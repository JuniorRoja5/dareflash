/**
 * EL SCRIPT DE DESPLIEGUE (scripts/deploy.sh): se ejecuta DE VERDAD, con `docker`, `git` y `curl`
 * falsos al principio del PATH que anotan lo que se les pide y responden lo que cada caso necesita.
 *
 * Lo que se fija, porque cada cosa es la que impide desplegar algo que no debía:
 *  - Sin imagen, no se despliega: si CI FALLÓ, lo dice y se para; si no ha terminado, espera con tope
 *    y se para. En ninguno de los dos se descarga, se migra ni se arranca nada.
 *  - Si el health responde con OTRO commit, lo dice y sale con error (no «desplegado»).
 *  - Volver atrás con migraciones posteriores exige `--acepto-esquema-nuevo`, y no migra.
 *  - El camino bueno va en orden: descargar → migrar → arrancar → health con ESE commit.
 *
 * Para romperlo a propósito: en deploy.sh, quitar el `morir` del caso `fallo:*` (rojo «CI falló»);
 * quitar la comparación `"$COMMIT" != "$SHA"` (rojo «otro commit»); quitar el `morir` del tope de espera
 * (rojo «no ha terminado»).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const VIEJO = "a".repeat(40);
const NUEVO = "b".repeat(40);
const OTRO = "c".repeat(40);
const MIGRACIONES = "20260101000000_una 20260201000000_otra";

/** En Windows, el bash de Git (el de System32 es el de WSL, y no ve estos ficheros). */
function bash(): string {
  if (process.platform !== "win32") return "bash";
  const exec = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
  return path.resolve(exec, "..", "..", "..", "bin", "bash.exe");
}

const FALSOS = mkdtempSync(path.join(tmpdir(), "deploy-falsos-"));
afterAll(() => rmSync(FALSOS, { recursive: true, force: true }));

writeFileSync(
  path.join(FALSOS, "docker"),
  `#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
case "$1" in
  manifest) [ "\${FAKE_IMAGEN_EXISTE:-1}" = 1 ]; exit $? ;;
  image)
    # La etiqueta revision de la imagen: la de su tag (así migrate-prod ve el SHA que se despliega).
    if [ "$2" = "inspect" ]; then img="\${@: -1}"; echo "\${img##*:}"; fi
    exit 0 ;;
  compose)
    case "$*" in
      *" exec "*)
        if grep -q " up -d" "$FAKE_LOG"; then h="\${FAKE_HEALTH_DESPUES:-}"; else h="\${FAKE_HEALTH_ANTES:-}"; fi
        [ -n "$h" ] && { echo "$h"; exit 0; }
        exit 1 ;;
      *"ls -1 prisma/migrations"*)
        for m in $FAKE_MIGRACIONES; do echo "$m"; done; echo migration_lock.toml; exit 0 ;;
    esac ;;
esac
exit 0
`,
  { mode: 0o755 },
);

writeFileSync(
  path.join(FALSOS, "git"),
  `#!/usr/bin/env bash
echo "git $*" >> "$FAKE_LOG"
case "$1" in
  rev-parse)
    ref="\${@: -1}"; ref="\${ref%"^{commit}"}"
    [ "$ref" = "HEAD" ] && ref="$FAKE_HEAD"
    [[ "$ref" =~ ^[0-9a-f]{40}$ ]] && { echo "$ref"; exit 0; }
    exit 1 ;;
  merge-base)
    if [ "$4" = "origin/main" ]; then [ "\${FAKE_EN_MAIN:-1}" = 1 ]; exit $?; fi
    printf '%s\\n' \${FAKE_ANCESTROS:-} | grep -qx "$3>$4"; exit $? ;;
  diff)
    [ "$2" = "--quiet" ] && exit 0
    for f in \${FAKE_POSTERIORES:-}; do echo "prisma/migrations/$f/migration.sql"; done; exit 0 ;;
  ls-tree)
    for m in $FAKE_MIGRACIONES; do echo "prisma/migrations/$m"; done
    echo prisma/migrations/migration_lock.toml; exit 0 ;;
esac
exit 0
`,
  { mode: 0o755 },
);

writeFileSync(
  path.join(FALSOS, "curl"),
  // Como el de verdad con `-D <cabeceras> -o <cuerpo> -w '%{http_code}'`: cabeceras y cuerpo a sus
  // ficheros, el código HTTP por la salida.
  `#!/usr/bin/env bash
echo "curl $*" >> "$FAKE_LOG"
cab=/dev/null; cuerpo=/dev/null
while [ $# -gt 0 ]; do
  case "$1" in -D) cab="$2"; shift ;; -o) cuerpo="$2"; shift ;; esac
  shift
done
printf '%b' "\${FAKE_CI_CABECERAS:-}" > "$cab"
printf '%s' "$FAKE_CI_JSON" > "$cuerpo"
printf '%s' "\${FAKE_CI_CODIGO:-200}"
`,
  { mode: 0o755 },
);

const ci = (status: string, conclusion: string | null) =>
  JSON.stringify({ total_count: 1, workflow_runs: [{ id: 1, status, conclusion }] }, null, 2);

let n = 0;
function desplegar(args: string[], env: Record<string, string>) {
  const log = path.join(FALSOS, `log-${++n}.txt`);
  writeFileSync(log, "");
  // Los falsos se anteponen DENTRO de bash: el bash de Git en Windows es un lanzador que pone su propio
  // /mingw64/bin (con el git de verdad) delante de lo que le llegue en PATH.
  const lanzar =
    'PATH="$(cygpath -u "$FAKE_DIR" 2>/dev/null || echo "$FAKE_DIR"):$PATH" exec bash scripts/deploy.sh "$@"';
  const r = spawnSync(bash(), ["-c", lanzar, "deploy.sh", ...args], {
    cwd: RAIZ,
    encoding: "utf8",
    // Un script que se queda en bucle (p.ej. si alguien quita el tope de espera) tiene que FALLAR, no
    // colgar la suite: `spawnSync` bloquea y el timeout de vitest no lo interrumpe.
    timeout: 20_000,
    env: {
      ...process.env,
      FAKE_DIR: FALSOS,
      FAKE_LOG: log,
      FAKE_HEAD: NUEVO,
      FAKE_MIGRACIONES: MIGRACIONES,
      FAKE_CI_JSON: ci("completed", "success"),
      DEPLOY_ESPERA_MAX_S: "60",
      DEPLOY_ESPERA_PASO_S: "0",
      DEPLOY_HEALTH_MAX_S: "0",
      DEPLOY_HEALTH_PASO_S: "0",
      ...env,
    },
  });
  const llamadas = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { codigo: r.status, salida: `${r.stdout}\n${r.stderr}`, llamadas };
}

/** Lo que de verdad cambia producción: descargar, migrar o arrancar. */
const TOCA_PRODUCCION = /^docker (pull|tag)|compose[^\n]* (run|up)\b/;

describe("deploy.sh: el camino bueno", () => {
  it("descarga, migra con la imagen de ESE SHA, arranca y comprueba el health", () => {
    const r = desplegar([NUEVO], {
      FAKE_HEALTH_ANTES: `${VIEJO} ok`,
      FAKE_HEALTH_DESPUES: `${NUEVO} ok`,
      FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
    });
    expect(r.salida).toContain(`DESPLEGADO ${NUEVO}`);
    expect(r.codigo).toBe(0);
    const i = (re: RegExp) => r.llamadas.findIndex((l) => re.test(l));
    expect(i(/^docker pull .*dareflash-web:b{40}/)).toBeGreaterThan(-1);
    expect(i(/^docker pull/)).toBeLessThan(i(/compose[^\n]* run --rm -T migrate$/));
    expect(i(/compose[^\n]* run --rm -T migrate$/)).toBeLessThan(i(/compose[^\n]* up -d$/));
    expect(i(/^docker tag .*:b{40} .*dareflash-web:desplegada$/)).toBeLessThan(i(/ up -d$/));
    expect(r.salida).toContain(`./scripts/deploy.sh ${VIEJO}`); // cómo volver atrás
  });
});

describe("deploy.sh: el límite de la API de GitHub no se confunde con un fallo de CI", () => {
  it("un 403 por límite dice a qué hora reintentar, NO «CI falló», y no toca nada", () => {
    const reset = Date.UTC(2026, 10, 11, 15, 42) / 1000;
    const r = desplegar([NUEVO], {
      TZ: "UTC",
      FAKE_IMAGEN_EXISTE: "0",
      FAKE_CI_CODIGO: "403",
      FAKE_CI_CABECERAS: `HTTP/2 403\\r\\nx-ratelimit-remaining: 0\\r\\nx-ratelimit-reset: ${reset}\\r\\n`,
      FAKE_CI_JSON: '{"message":"API rate limit exceeded"}',
    });
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toMatch(/GitHub ha limitado las consultas/);
    // `date` llama UTC «UTC» en Ubuntu y «GMT» en el bash de Git; la hora es lo que importa.
    expect(r.salida).toMatch(/vuelve a intentarlo a las 15:42 (UTC|GMT)/);
    expect(r.salida).not.toMatch(/CI FALLÓ/);
    expect(r.llamadas.filter((l) => TOCA_PRODUCCION.test(l))).toEqual([]);
  });

  it("mira el REGISTRO antes que la API: si las imágenes ya están, no gasta ni una consulta", () => {
    const r = desplegar([NUEVO], {
      FAKE_HEALTH_ANTES: `${VIEJO} ok`,
      FAKE_HEALTH_DESPUES: `${NUEVO} ok`,
      FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
    });
    expect(r.codigo).toBe(0);
    expect(r.llamadas.some((l) => l.startsWith("curl "))).toBe(false);
  });

  it("y espera al menos 60 s entre consultas", () => {
    expect(readFileSync(path.join(RAIZ, "scripts", "deploy.sh"), "utf8")).toMatch(
      /^ESPERA_PASO_S="\$\{DEPLOY_ESPERA_PASO_S:-(\d+)\}"$/m,
    );
    const paso = /DEPLOY_ESPERA_PASO_S:-(\d+)/.exec(
      readFileSync(path.join(RAIZ, "scripts", "deploy.sh"), "utf8"),
    )?.[1];
    expect(Number(paso)).toBeGreaterThanOrEqual(60);
  });
});

describe("deploy.sh: sin imagen no se despliega", () => {
  it("si CI FALLÓ (tests rojos), lo dice y no toca nada", () => {
    const r = desplegar([NUEVO], {
      FAKE_IMAGEN_EXISTE: "0",
      FAKE_CI_JSON: ci("completed", "failure"),
      FAKE_HEALTH_ANTES: `${VIEJO} ok`,
    });
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toMatch(/CI FALLÓ/);
    expect(r.salida).toMatch(/sin tests verdes no hay imagen/);
    expect(r.llamadas.filter((l) => TOCA_PRODUCCION.test(l))).toEqual([]);
  });

  it("si CI no ha terminado, espera hasta el tope y se para sin tocar nada", () => {
    const r = desplegar([NUEVO], {
      FAKE_IMAGEN_EXISTE: "0",
      FAKE_CI_JSON: ci("in_progress", null),
      DEPLOY_ESPERA_MAX_S: "0",
    });
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toMatch(/CI no ha publicado las imágenes/);
    expect(r.salida).toMatch(/en_curso/);
    expect(r.llamadas.filter((l) => TOCA_PRODUCCION.test(l))).toEqual([]);
  });

  it("un commit que no está en main no se despliega (CI no publica sus imágenes)", () => {
    const r = desplegar([NUEVO], { FAKE_EN_MAIN: "0" });
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toMatch(/no está en main/);
    expect(r.llamadas.filter((l) => TOCA_PRODUCCION.test(l))).toEqual([]);
  });
});

describe("deploy.sh: el health tiene que ser el commit desplegado", () => {
  it("si responde con OTRO commit, lo dice claramente y sale con error", () => {
    const r = desplegar([NUEVO], {
      FAKE_HEALTH_ANTES: `${VIEJO} ok`,
      FAKE_HEALTH_DESPUES: `${OTRO} ok`,
      FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
      DEPLOY_HEALTH_MAX_S: "60",
    });
    expect(r.codigo).toBe(3);
    expect(r.salida).toContain(`el health responde con el commit ${OTRO}, NO con ${NUEVO}`);
    expect(r.salida).not.toContain("DESPLEGADO");
  });

  it("si no llega a responder ok, se para en el tope y dice cómo volver", () => {
    const r = desplegar([NUEVO], {
      FAKE_HEALTH_ANTES: `${VIEJO} ok`,
      FAKE_HEALTH_DESPUES: `${NUEVO} degraded`,
      FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
    });
    expect(r.codigo).toBe(4);
    expect(r.salida).toContain(`./scripts/deploy.sh ${VIEJO}`);
    expect(r.salida).not.toContain("DESPLEGADO");
  });
});

describe("deploy.sh: volver atrás", () => {
  const atras = {
    FAKE_HEALTH_ANTES: `${NUEVO} ok`,
    FAKE_HEALTH_DESPUES: `${VIEJO} ok`,
    FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
  };

  it("con migraciones posteriores, se para y las lista si no se acepta el esquema nuevo", () => {
    const r = desplegar([VIEJO], { ...atras, FAKE_POSTERIORES: "20261101000000_nueva" });
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toContain("20261101000000_nueva");
    expect(r.salida).toMatch(/--acepto-esquema-nuevo/);
    expect(r.llamadas.filter((l) => TOCA_PRODUCCION.test(l))).toEqual([]);
  });

  it("aceptándolo, vuelve SIN migrar (Prisma no deshace)", () => {
    const r = desplegar([VIEJO, "--acepto-esquema-nuevo"], {
      ...atras,
      FAKE_POSTERIORES: "20261101000000_nueva",
    });
    expect(r.salida).toContain(`DESPLEGADO ${VIEJO}`);
    expect(r.codigo).toBe(0);
    expect(r.llamadas.some((l) => / run --rm -T migrate$/.test(l))).toBe(false);
    expect(r.llamadas.some((l) => / up -d$/.test(l))).toBe(true);
  });
});
