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

import { sinComentarios } from "./helpers/grafo-imports";

const RAIZ = path.resolve(__dirname, "..");
const VIEJO = "a".repeat(40);
const NUEVO = "b".repeat(40);
const OTRO = "c".repeat(40);
const MIGRACIONES = "20260101000000_una 20260201000000_otra";

/**
 * Lo que dice el health de una versión SANA: la web con ese commit y `ok`, y el worker latiendo con
 * ESE commit, hace 3 s y vivo desde hace 40 (Fase 11 · worker vigilado). Formato de `salud()`:
 * `<commit> <status> <worker.commit> <worker.haceS> <worker.vivoS>`.
 */
const sano = (sha: string) => `${sha} ok ${sha} 3 40`;

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
    if [ "$2" = "inspect" ]; then
      img="\${@: -1}"
      # Con --format, la etiqueta revision: la de su tag (así migrate-prod ve el SHA que se despliega).
      if [ "$3" = "--format" ]; then echo "\${img##*:}"; exit 0; fi
      # Sin --format, «¿existe en local?»: sin FAKE_LOCALES, todas; con, solo las de la lista.
      [ -z "\${FAKE_LOCALES+x}" ] && exit 0
      for x in $FAKE_LOCALES; do [ "$x" = "$img" ] && exit 0; done
      exit 1
    fi
    exit 0 ;;
  images) for x in \${FAKE_IMAGENES:-}; do echo "$x"; done; exit 0 ;;
  # La etiqueta revision del contenedor web en marcha.
  inspect) echo "\${FAKE_SHA_WEB:-}"; exit 0 ;;
  compose)
    echo "IMAGE_TAG=\${IMAGE_TAG:-}" >> "$FAKE_LOG"
    case "$*" in
      *" ps -q web"*) [ -n "\${FAKE_SHA_WEB:-}" ] && echo cont-web; exit 0 ;;
      *" exec -T caddy "*)
        case "$*" in
          *" validate "*)
            [ "\${FAKE_CADDY_VALIDA:-1}" = 1 ] && exit 0
            echo "Error: adapting config using caddyfile: Caddyfile:3: unrecognized directive: rediir"; exit 1 ;;
          *" reload "*)
            [ "\${FAKE_CADDY_RECARGA:-1}" = 1 ] && exit 0
            echo "Error: sending configuration to instance: connection refused"; exit 1 ;;
          *) cat >/dev/null; exit 0 ;;
        esac ;;
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
  show)
    # El worker de un commit: por defecto el de hoy (late); los SHA de FAKE_SIN_LATIDO, uno de antes.
    case "$2" in
      *:scripts/worker.ts)
        for x in \${FAKE_SIN_LATIDO:-}; do [ "$x" = "\${2%%:*}" ] && { echo "// worker sin latido"; exit 0; }; done
        cat scripts/worker.ts; exit 0 ;;
    esac
    # Por defecto, el MISMO Caddyfile que el del disco; con FAKE_CADDYFILE_DISTINTO=1, otro.
    if [ "\${FAKE_CADDYFILE_DISTINTO:-0}" = 1 ]; then echo "otro.test {"; echo "}"; else cat caddy/Caddyfile; fi
    exit 0 ;;
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
/** Ejecuta un script de scripts/ con los falsos delante. El historial va a un fichero de la prueba. */
function ejecutar(script: string, args: string[], env: Record<string, string>) {
  const log = path.join(FALSOS, `log-${++n}.txt`);
  writeFileSync(log, "");
  // Los falsos se anteponen DENTRO de bash: el bash de Git en Windows es un lanzador que pone su propio
  // /mingw64/bin (con el git de verdad) delante de lo que le llegue en PATH.
  const lanzar = `PATH="$(cygpath -u "$FAKE_DIR" 2>/dev/null || echo "$FAKE_DIR"):$PATH" exec bash scripts/${script} "$@"`;
  const r = spawnSync(bash(), ["-c", lanzar, script, ...args], {
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
      // Nunca en el repositorio: cada ejecución, su historial.
      DEPLOY_HISTORIAL: path.join(FALSOS, `historial-${n}.txt`),
      ...env,
    },
  });
  const llamadas = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { codigo: r.status, salida: `${r.stdout}\n${r.stderr}`, llamadas };
}
const desplegar = (args: string[], env: Record<string, string>) => ejecutar("deploy.sh", args, env);

/** Lo que de verdad cambia producción: descargar, migrar o arrancar. */
const TOCA_PRODUCCION = /^docker (pull|tag)|compose[^\n]* (run|up)\b/;

describe("deploy.sh: el camino bueno", () => {
  it("descarga, migra con la imagen de ESE SHA, arranca y comprueba el health", () => {
    const r = desplegar([NUEVO], {
      FAKE_HEALTH_ANTES: `${VIEJO} ok`,
      FAKE_HEALTH_DESPUES: sano(NUEVO),
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
      FAKE_HEALTH_DESPUES: sano(NUEVO),
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

/**
 * EL WORKER (Fase 11 · worker vigilado). El 19 nov el worker murió al arrancar, en bucle, y este script
 * dijo «DESPLEGADO»: solo miraba la web. Ahora, con la web ya buena, espera al latido del worker.
 */
describe("deploy.sh: el worker tiene que ser ESTE commit y estar vivo", () => {
  const base = { FAKE_HEALTH_ANTES: sano(VIEJO), FAKE_ANCESTROS: `${VIEJO}>${NUEVO}` };
  const conTope = { DEPLOY_HEALTH_MAX_S: "1", DEPLOY_HEALTH_PASO_S: "1" };

  it("latido del commit desplegado, reciente y vivo: DESPLEGADO", () => {
    const r = desplegar([NUEVO], { ...base, FAKE_HEALTH_DESPUES: `${NUEVO} ok ${NUEVO} 2 45` });
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain(`DESPLEGADO ${NUEVO}`);
  });

  it("latido de OTRO commit hasta el tope: error, dice cuál es y cómo volver", () => {
    const r = desplegar([NUEVO], {
      ...base,
      ...conTope,
      FAKE_HEALTH_DESPUES: `${NUEVO} ok ${VIEJO} 2 900`,
    });
    expect(r.codigo).toBe(5);
    expect(r.salida).toContain("el worker no arranca");
    expect(r.salida).toContain(VIEJO);
    expect(r.salida).toContain("logs --tail=100 worker");
    expect(r.salida).toContain(`./scripts/deploy.sh ${VIEJO}`);
    expect(r.salida).not.toContain("DESPLEGADO");
  });

  it("sin ningún latido en el tope: error, «el worker no arranca»", () => {
    const r = desplegar([NUEVO], { ...base, ...conTope, FAKE_HEALTH_DESPUES: `${NUEVO} ok` });
    expect(r.codigo).toBe(5);
    expect(r.salida).toMatch(/el worker no arranca: .*ni un latido/);
    expect(r.salida).not.toContain("DESPLEGADO");
  });

  it("EN BUCLE: latido bueno y reciente, pero el proceso no lleva vivo ni dos latidos: error", () => {
    // Lo que pasó el 19 nov: el worker alcanza a latir y muere; cada reinicio empieza de cero.
    const r = desplegar([NUEVO], {
      ...base,
      ...conTope,
      FAKE_HEALTH_DESPUES: `${NUEVO} ok ${NUEVO} 1 5`,
    });
    expect(r.codigo).toBe(5);
    expect(r.salida).toContain("no se queda vivo");
    expect(r.salida).not.toContain("DESPLEGADO");
  });

  it("latido VIEJO (el worker murió hace rato): error", () => {
    const r = desplegar([NUEVO], {
      ...base,
      ...conTope,
      FAKE_HEALTH_DESPUES: `${NUEVO} ok ${NUEVO} 300 600`,
    });
    expect(r.codigo).toBe(5);
    expect(r.salida).not.toContain("DESPLEGADO");
  });
});

/**
 * VOLVER ATRÁS A UN COMMIT QUE NO SABE LATIR. Su worker no anota latido y su health no tiene `worker`:
 * exigírselo convertía la vía de emergencia en «el worker no arranca» con todo sano, y sin recargar
 * Caddy. Se decide por el commit (su `scripts/worker.ts`), no por el health.
 */
describe("deploy.sh: volver atrás a un commit anterior a la vigilancia del worker", () => {
  // El health de una versión vieja: sin el campo `worker`.
  const atras = {
    FAKE_HEALTH_ANTES: sano(NUEVO),
    FAKE_HEALTH_DESPUES: `${VIEJO} ok`,
    FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
    DEPLOY_HEALTH_MAX_S: "1",
    DEPLOY_HEALTH_PASO_S: "1",
  };
  const caddy = (r: { llamadas: string[] }, orden: string) =>
    r.llamadas.findIndex((l) => l.includes(" exec -T caddy caddy " + orden + " "));

  it("sin latido en ese commit: AVISA, valida y recarga Caddy, y DESPLEGADO con código 0", () => {
    const r = desplegar([VIEJO], { ...atras, FAKE_SIN_LATIDO: VIEJO });
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain(
      "AVISO: este commit es anterior a la vigilancia del worker: no se puede comprobar que esté vivo.",
    );
    expect(r.salida).toContain("logs --tail=100 worker");
    expect(r.salida).not.toContain("el worker no arranca");
    expect(r.llamadas).toContain(`git show ${VIEJO}:scripts/worker.ts`);
    expect(caddy(r, "validate")).toBeGreaterThan(-1);
    expect(caddy(r, "reload")).toBeGreaterThan(caddy(r, "validate"));
    expect(r.salida).toContain(`DESPLEGADO ${VIEJO}`);
  });

  it("control: si ese commit SÍ sabe latir y no late, sigue siendo error 5", () => {
    const r = desplegar([VIEJO], atras);
    expect(r.codigo).toBe(5);
    expect(r.salida).toContain("el worker no arranca");
    expect(r.salida).not.toContain("anterior a la vigilancia");
    expect(r.salida).not.toContain("DESPLEGADO");
  });

  it("la marca que busca deploy.sh está en el worker de HOY (un renombrado no apaga la vigilancia)", () => {
    // Si `anotarLatido(` dejara de aparecer en scripts/worker.ts, deploy.sh trataría TODO commit nuevo
    // como «anterior a la vigilancia»: avisaría y seguiría, sin esperar al latido nunca más.
    const script = readFileSync(path.join(RAIZ, "scripts", "deploy.sh"), "utf8");
    const marca = /^MARCA_LATIDO='([^']+)'$/m.exec(script)?.[1];
    expect(marca, "no se encontró MARCA_LATIDO en deploy.sh").toBeTruthy();
    const worker = sinComentarios(readFileSync(path.join(RAIZ, "scripts", "worker.ts"), "utf8"));
    expect(worker, `scripts/worker.ts ya no contiene «${marca}»`).toContain(marca);
  });
});

/**
 * CADDY (Fase 11 · worker vigilado, corrección 2). Caddy monta `caddy/` pero NO relee el fichero: un
 * Caddyfile nuevo no se servía hasta un `caddy reload` a mano. Ahora deploy.sh lo valida DENTRO del
 * contenedor de Caddy y solo entonces lo recarga.
 */
describe("deploy.sh: Caddy valida ANTES de recargar, y un fallo no se da por bueno", () => {
  const base = {
    FAKE_HEALTH_ANTES: sano(VIEJO),
    FAKE_HEALTH_DESPUES: sano(NUEVO),
    FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
  };
  const caddy = (r: { llamadas: string[] }, orden: string) =>
    r.llamadas.findIndex((l) => l.includes(" exec -T caddy caddy " + orden + " "));

  it("caso bueno: el Caddyfile de ESE SHA, `validate` antes que `reload`, y DESPLEGADO", () => {
    const r = desplegar([NUEVO], base);
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain(`DESPLEGADO ${NUEVO}`);
    expect(r.llamadas).toContain(`git show ${NUEVO}:caddy/Caddyfile`);
    expect(caddy(r, "validate")).toBeGreaterThan(-1);
    expect(caddy(r, "reload")).toBeGreaterThan(caddy(r, "validate"));
    // Y después de arrancar web y worker, no antes.
    expect(caddy(r, "validate")).toBeGreaterThan(r.llamadas.findIndex((l) => / up -d$/.test(l)));
  });

  it("Caddyfile INVÁLIDO: error, dice qué pasa y NO recarga", () => {
    const r = desplegar([NUEVO], { ...base, FAKE_CADDY_VALIDA: "0" });
    expect(r.codigo).toBe(6);
    expect(r.salida).toContain(`el Caddyfile de ${NUEVO} NO es válido. NO se ha recargado`);
    expect(r.salida).toContain("unrecognized directive"); // lo que dice Caddy, no un genérico
    expect(caddy(r, "validate")).toBeGreaterThan(-1);
    expect(caddy(r, "reload")).toBe(-1);
    expect(r.salida).not.toContain("DESPLEGADO");
  });

  it("un `reload` que FALLA: error con su propia salida, sin DESPLEGADO", () => {
    const r = desplegar([NUEVO], { ...base, FAKE_CADDY_RECARGA: "0" });
    expect(r.codigo).toBe(7);
    expect(r.salida).toContain("Caddy NO lo ha podido recargar");
    expect(r.salida).toContain("connection refused");
    expect(r.salida).not.toContain("DESPLEGADO");
  });

  it("al volver atrás, valida y recarga el Caddyfile del SHA DE DESTINO", () => {
    const r = desplegar([VIEJO], {
      FAKE_HEALTH_ANTES: sano(NUEVO),
      FAKE_HEALTH_DESPUES: sano(VIEJO),
      FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
    });
    expect(r.codigo).toBe(0);
    expect(r.llamadas).toContain(`git show ${VIEJO}:caddy/Caddyfile`);
    expect(r.llamadas.some((l) => l.includes(`git show ${NUEVO}:`))).toBe(false);
    expect(caddy(r, "reload")).toBeGreaterThan(caddy(r, "validate"));
  });

  // Caddy queda con el temporal; si su contenedor se reinicia, vuelve al fichero montado del disco.
  const AVISO = /AVISO: Caddy sirve el Caddyfile de a{40}, pero el del disco/;
  const atras = {
    FAKE_HEALTH_ANTES: sano(NUEVO),
    FAKE_HEALTH_DESPUES: sano(VIEJO),
    FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
  };

  it("vuelta atrás con un Caddyfile DISTINTO del disco: avisa (no es un error)", () => {
    const r = desplegar([VIEJO], { ...atras, FAKE_CADDYFILE_DISTINTO: "1" });
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(AVISO);
    expect(r.salida).toContain("si el\ncontenedor de Caddy se reinicia, cargará el del disco");
    expect(r.salida).toContain(`DESPLEGADO ${VIEJO}`);
  });

  it("con el MISMO Caddyfile que el disco: no avisa", () => {
    const r = desplegar([VIEJO], atras);
    expect(r.codigo).toBe(0);
    expect(r.salida).not.toMatch(/AVISO: Caddy/);
  });
});

describe("deploy.sh: volver atrás", () => {
  const atras = {
    FAKE_HEALTH_ANTES: `${NUEVO} ok`,
    FAKE_HEALTH_DESPUES: sano(VIEJO),
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

// ---------------------------------------------------------------------------------------------------
// El cron de geoip y la limpieza (2026-11-12: un `docker image prune -a` borró las imágenes de geoip y
// migrate y su etiqueta `desplegada`; el cron habría fallado en diciembre)
// ---------------------------------------------------------------------------------------------------

const R = "ghcr.io/juniorroja5";
const SERV = ["web", "worker", "migrate", "geoip"];
const imagenesDe = (sha: string) => SERV.map((s) => `${R}/dareflash-${s}:${sha}`);
const ANTIGUO = "d".repeat(40);

describe("el cron de geoip NO depende de la etiqueta local `desplegada`", () => {
  it("sin la etiqueta ni la imagen en local: resuelve el SHA EN MARCHA, la descarga y la usa", () => {
    const r = ejecutar("geoip-mensual.sh", [], { FAKE_SHA_WEB: NUEVO, FAKE_LOCALES: "" });
    expect(r.codigo).toBe(0);
    const i = (re: RegExp) => r.llamadas.findIndex((l) => re.test(l));
    expect(i(new RegExp(`^docker pull --quiet ${R}/dareflash-geoip:${NUEVO}$`))).toBeGreaterThan(
      -1,
    );
    expect(i(/compose[^\n]* run --rm -T geoip$/)).toBeGreaterThan(i(/^docker pull/));
    // Y corre con la imagen de ESE SHA, no con `desplegada`.
    const run = i(/compose[^\n]* run --rm -T geoip$/);
    // (el falso apunta el IMAGE_TAG justo DESPUÉS de cada llamada a compose)
    expect(r.llamadas[run + 1]).toBe(`IMAGE_TAG=${NUEVO}`);
  });

  it("si la imagen ya está, no descarga nada", () => {
    const r = ejecutar("geoip-mensual.sh", [], {
      FAKE_SHA_WEB: NUEVO,
      FAKE_LOCALES: imagenesDe(NUEVO).join(" "),
    });
    expect(r.codigo).toBe(0);
    expect(r.llamadas.some((l) => l.startsWith("docker pull"))).toBe(false);
  });

  it("con web parado no adivina: lo dice y no ejecuta nada", () => {
    const r = ejecutar("geoip-mensual.sh", [], { FAKE_SHA_WEB: "" });
    expect(r.codigo).not.toBe(0);
    expect(r.salida).toMatch(/el contenedor web no está en marcha/);
    expect(r.llamadas.some((l) => / run /.test(l))).toBe(false);
  });
});

describe("la limpieza (scripts/limpiar.sh): conserva lo desplegado y lo anterior, borra el resto", () => {
  it("se quedan las cuatro de la versión en marcha y las cuatro de la anterior", () => {
    const historial = path.join(FALSOS, "historial-limpieza.txt");
    writeFileSync(historial, `${ANTIGUO}\n${VIEJO}\n${NUEVO}\n`);
    const todas = [
      ...imagenesDe(NUEVO),
      ...imagenesDe(VIEJO),
      ...imagenesDe(ANTIGUO),
      ...SERV.map((s) => `${R}/dareflash-${s}:desplegada`),
      "dareflash-web:latest", // construida en el servidor antes de CI
      "mariadb:11.8",
      "caddy:2",
      "<none>:<none>",
    ];
    const r = ejecutar("limpiar.sh", [], {
      FAKE_SHA_WEB: NUEVO,
      FAKE_LOCALES: todas.join(" "),
      FAKE_IMAGENES: todas.join(" "),
      DEPLOY_HISTORIAL: historial,
    });
    expect(r.codigo).toBe(0);
    const borradas = r.llamadas.filter((l) => l.startsWith("docker rmi ")).map((l) => l.slice(11));
    expect(borradas.sort()).toEqual([...imagenesDe(ANTIGUO), "dareflash-web:latest"].sort());
    // Nada de lo que hay que conservar, ni lo de terceros.
    for (const img of [...imagenesDe(NUEVO), ...imagenesDe(VIEJO), "mariadb:11.8", "caddy:2"]) {
      expect(borradas, img).not.toContain(img);
    }
    // Las colgantes y la caché de build, sí; un `prune -a` de IMÁGENES, nunca.
    expect(r.llamadas).toContain("docker image prune -f");
    expect(r.llamadas).toContain("docker builder prune -a -f");
    expect(r.llamadas.some((l) => /^docker (image|system) prune .*-a/.test(l))).toBe(false);
  });

  it("si falta alguna de la versión en marcha (p.ej. tras un prune), la descarga y le pone `desplegada`", () => {
    const sinGeoipNiMigrate = [`${R}/dareflash-web:${NUEVO}`, `${R}/dareflash-worker:${NUEVO}`];
    const r = ejecutar("limpiar.sh", [], {
      FAKE_SHA_WEB: NUEVO,
      FAKE_LOCALES: sinGeoipNiMigrate.join(" "),
      FAKE_IMAGENES: sinGeoipNiMigrate.join(" "),
    });
    expect(r.codigo).toBe(0);
    for (const s of ["migrate", "geoip"]) {
      expect(r.llamadas).toContain(`docker pull --quiet ${R}/dareflash-${s}:${NUEVO}`);
    }
    for (const s of SERV) {
      expect(r.llamadas).toContain(
        `docker tag ${R}/dareflash-${s}:${NUEVO} ${R}/dareflash-${s}:desplegada`,
      );
    }
  });

  it("y DESPUÉS de limpiar, el cron de geoip sigue funcionando", () => {
    // Tras la limpieza las cuatro del SHA en marcha están (las garantiza `limpiar.sh`).
    const r = ejecutar("geoip-mensual.sh", [], {
      FAKE_SHA_WEB: NUEVO,
      FAKE_LOCALES: imagenesDe(NUEVO).join(" "),
    });
    expect(r.codigo).toBe(0);
    expect(r.llamadas.some((l) => / run --rm -T geoip$/.test(l))).toBe(true);
  });
});

describe("deploy.sh deja el historial y limpia con limpiar.sh", () => {
  it("apunta el SHA desplegado (de ahí sale «la anterior») y llama a la limpieza", () => {
    const historial = path.join(FALSOS, "historial-deploy.txt");
    writeFileSync(historial, `${VIEJO}\n`);
    const r = desplegar([NUEVO], {
      FAKE_HEALTH_ANTES: `${VIEJO} ok`,
      FAKE_HEALTH_DESPUES: sano(NUEVO),
      FAKE_ANCESTROS: `${VIEJO}>${NUEVO}`,
      FAKE_SHA_WEB: NUEVO,
      DEPLOY_HISTORIAL: historial,
    });
    expect(r.codigo).toBe(0);
    expect(readFileSync(historial, "utf8").trim().split("\n")).toEqual([VIEJO, NUEVO]);
    expect(r.llamadas).toContain("docker builder prune -a -f");
  });
});
