/**
 * LAS IMÁGENES LAS CONSTRUYE CI, Y SOLO CON LOS TESTS EN VERDE (infraestructura, 2026-11).
 *
 * El servidor de 1 vCPU compilaba Next en cada despliegue y una vez se quedó sin memoria. Ahora
 * `.github/workflows/imagenes.yml` construye las cuatro imágenes, las revisa y, en main, las publica en
 * ghcr.io; el servidor solo descarga (scripts/deploy.sh). Lo que se fija, porque cualquiera de estas
 * cosas se puede deshacer sin que nada falle a la vista:
 *
 *  - SIN TESTS VERDES NO HAY IMAGEN: el job que publica depende de `tests` y nada lo salta
 *    (`continue-on-error`, `if: always()`...). deploy.sh confía en eso: «no hay imagen» = «no se
 *    despliega».
 *  - Publicar es SOLO de main y va DESPUÉS de revisar las imágenes (sin secretos, con su SHA).
 *  - Cada imagen sale de SU etapa, y la misma en los tres sitios (CI, compose de producción, compose de
 *    emergencia). Ya pasó una vez que `web` arrancó la cola y devolvió 502.
 *  - La etiqueta es el SHA COMPLETO (`github.sha`): es lo que pide deploy.sh y lo que responde el health.
 *  - El compose de producción no construye nada.
 *
 * Para romperlo a propósito: quitar `needs: tests` (rojo); quitar el `if:` de main al paso de publicar
 * (rojo); subir el paso de publicar por encima de la revisión (rojo); cambiar el `target` de web a
 * `worker` en CI o en el compose de emergencia (rojo); volver a poner `build:` en el de producción (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const leer = (...p: string[]) =>
  readFileSync(path.resolve(__dirname, "..", ...p), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

const WORKFLOW = leer(".github", "workflows", "imagenes.yml");
const PROD = leer("docker-compose.prod.yml");
const CONSTRUIR = leer("docker-compose.construir.yml");

/** Las etapas del Dockerfile de cada imagen. Es LA tabla: los tres ficheros tienen que coincidir. */
const ETAPA: Record<string, string> = {
  web: "runner",
  worker: "worker",
  migrate: "builder",
  geoip: "geoip",
};

/** El texto de un job del workflow (desde `  <nombre>:` hasta el siguiente job). */
function job(nombre: string): string {
  const m = new RegExp(`^ {2}${nombre}:\\s*$`, "m").exec(WORKFLOW);
  if (!m) throw new Error(`el workflow no tiene el job ${nombre}`);
  const resto = WORKFLOW.slice(m.index + m[0].length);
  const fin = /^ {2}[a-z][\w-]*:\s*$/m.exec(resto);
  return WORKFLOW.slice(m.index, m.index + m[0].length + (fin ? fin.index : resto.length));
}

/** Los pasos de un job, en orden. */
function pasos(nombreJob: string): string[] {
  const j = job(nombreJob);
  return j
    .slice(j.indexOf("\n    steps:"))
    .split(/\n {6}- /)
    .slice(1);
}

/** Los bloques de servicio de un compose. */
function servicios(compose: string): Map<string, string> {
  const cuerpo = compose.slice(compose.indexOf("services:"));
  const fin = cuerpo.search(/^(volumes|networks):/m);
  const s = fin === -1 ? cuerpo : cuerpo.slice(0, fin);
  const bloques = new Map<string, string>();
  const cabeceras = [...s.matchAll(/^ {2}([a-z]+):\s*$/gm)];
  cabeceras.forEach((m, i) => bloques.set(m[1]!, s.slice(m.index, cabeceras[i + 1]?.index)));
  return bloques;
}

const PUBLICA = (p: string) => /docker push|docker\/login-action/.test(p);
const SOLO_MAIN = /^\s*if: github\.ref == 'refs\/heads\/main'\s*$/m;

describe("ningún secreto en el repositorio (escáner antes que nada)", () => {
  it("CI escanea el árbol en su propio job, y los tests dependen de él", () => {
    expect(job("secretos")).toMatch(/run: bash scripts\/escanear-secretos\.sh arbol\s*$/m);
    expect(job("tests")).toMatch(/^ {4}needs: secretos\s*$/m);
  });

  it("el pre-commit escanea lo que se va a confirmar, ANTES que el resto", () => {
    const hook = leer(".husky", "pre-commit");
    const escaner = hook.indexOf("bash scripts/escanear-secretos.sh preparado");
    expect(escaner).toBeGreaterThan(-1);
    expect(escaner).toBeLessThan(hook.indexOf("npx lint-staged"));
  });

  it("la versión de gitleaks está fijada (una imagen sin versión cambia las reglas sin avisar)", () => {
    expect(leer("scripts", "escanear-secretos.sh")).toMatch(
      /^IMAGEN="ghcr\.io\/gitleaks\/gitleaks:v\d+\.\d+\.\d+"$/m,
    );
  });

  it("la BD de CI no lleva contraseña escrita (ni en el servicio ni en la URL)", () => {
    const t = job("tests");
    expect(t).not.toMatch(/MARIADB_ROOT_PASSWORD:/);
    expect(t).toMatch(/MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: "1"/);
    expect(t).toMatch(/TEST_DATABASE_URL: mysql:\/\/root@/);
  });
});

describe("sin tests verdes no hay imagen", () => {
  it("el job de las imágenes depende de los tests", () => {
    expect(job("imagenes")).toMatch(/^ {4}needs: tests\s*$/m);
  });

  it("los tests son de verdad: typecheck, lint y vitest contra un MariaDB 11.8", () => {
    const t = job("tests");
    expect(t).toMatch(/run: npm run typecheck/);
    expect(t).toMatch(/run: npm run lint/);
    expect(t).toMatch(/run: npx vitest run\s*$/m);
    expect(t).toMatch(/image: mariadb:11\.8/);
    expect(t).toMatch(/TEST_DATABASE_URL: mysql:\/\//);
  });

  it("nada salta la dependencia (ni continue-on-error, ni if: always/failure)", () => {
    expect(WORKFLOW).not.toMatch(/continue-on-error/);
    expect(WORKFLOW).not.toMatch(/if:[^\n]*(always\(\)|failure\(\)|cancelled\(\))/);
  });
});

describe("publicar: solo main, y después de revisar", () => {
  const p = pasos("imagenes");
  const revisar = p.findIndex((x) => /scripts\/ci-revisar-imagenes\.sh/.test(x));

  it("hay un paso que revisa las imágenes, y existe el script", () => {
    expect(revisar).toBeGreaterThan(-1);
    expect(leer("scripts", "ci-revisar-imagenes.sh")).toMatch(/\.env/);
  });

  it("los pasos que entran en el registro o publican son SOLO de main, y van después de revisar", () => {
    const publican = p.map((x, i) => [x, i] as const).filter(([x]) => PUBLICA(x));
    expect(publican.length).toBeGreaterThanOrEqual(2); // el login y el push
    for (const [x, i] of publican) {
      expect(x, x.split("\n")[0]).toMatch(SOLO_MAIN);
      expect(i, x.split("\n")[0]).toBeGreaterThan(revisar);
    }
  });

  it("construir no publica: cada build es `push: false` (se carga, se revisa y después se sube)", () => {
    const builds = p.filter((x) => /docker\/build-push-action/.test(x));
    expect(builds).toHaveLength(4);
    for (const b of builds) {
      expect(b).toMatch(/^\s+push: false\s*$/m);
      expect(b).toMatch(/^\s+load: true\s*$/m);
    }
  });

  it("en main no se cancela una ejecución a medias (cada SHA de main necesita su imagen)", () => {
    expect(WORKFLOW).toMatch(/cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}/);
  });
});

describe("cada imagen, de su etapa, con el SHA completo", () => {
  const builds = pasos("imagenes").filter((x) => /docker\/build-push-action/.test(x));

  it("CI: imagen -> etapa, solo amd64, caché en Actions y la etiqueta del SHA", () => {
    const vistas: Record<string, string> = {};
    for (const b of builds) {
      const imagen =
        /tags: \$\{\{ env\.REGISTRO \}\}\/dareflash-([a-z]+):\$\{\{ github\.sha \}\}/.exec(b)?.[1];
      const etapa = /^\s+target: (\S+)\s*$/m.exec(b)?.[1];
      expect(imagen, b.split("\n")[0]).toBeDefined();
      vistas[imagen!] = etapa!;
      expect(b).toMatch(/^\s+platforms: linux\/amd64\s*$/m);
      expect(b).toMatch(new RegExp(`cache-from: type=gha,scope=${imagen}\\s*$`, "m"));
      expect(b).toMatch(new RegExp(`cache-to: type=gha,mode=max,scope=${imagen}\\s*$`, "m"));
      expect(b).toMatch(/org\.opencontainers\.image\.revision=\$\{\{ github\.sha \}\}/);
    }
    expect(vistas).toEqual(ETAPA);
  });

  it("el SHA se comprueba (40 hex) antes de construir", () => {
    const p = pasos("imagenes");
    const guarda = p.findIndex((x) => /grep -Eq '\^\[0-9a-f\]\{40\}\$'/.test(x));
    const primerBuild = p.findIndex((x) => /docker\/build-push-action/.test(x));
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(primerBuild);
  });

  it("el compose de producción usa la imagen de cada servicio y NO construye nada", () => {
    const s = servicios(PROD);
    for (const nombre of Object.keys(ETAPA)) {
      expect(s.get(nombre), nombre).toMatch(
        new RegExp(
          `^\\s+image: ghcr\\.io/juniorroja5/dareflash-${nombre}:\\$\\{IMAGE_TAG:-desplegada\\}\\s*$`,
          "m",
        ),
      );
    }
    expect(PROD).not.toMatch(/^\s+build:/m);
    expect(PROD).not.toMatch(/--build\b/);
  });

  it("el compose de EMERGENCIA construye cada servicio desde SU etapa (la misma que CI)", () => {
    const s = servicios(CONSTRUIR);
    const vistas: Record<string, string> = {};
    for (const [nombre, bloque] of s)
      vistas[nombre] = /^\s+target: (\S+)\s*$/m.exec(bloque)?.[1] ?? "";
    expect(vistas).toEqual(ETAPA);
  });

  it("y el registro es el mismo en CI, en los dos compose y en los scripts", () => {
    expect(WORKFLOW).toMatch(/REGISTRO: ghcr\.io\/juniorroja5\s*$/m);
    expect(leer("scripts", "deploy.sh")).toMatch(/^REGISTRO="ghcr\.io\/juniorroja5"$/m);
    // migrate-prod.sh, geoip-mensual.sh y limpiar.sh lo toman de imagenes-comun.sh.
    expect(leer("scripts", "imagenes-comun.sh")).toMatch(/^REGISTRO="ghcr\.io\/juniorroja5"$/m);
    for (const f of ["migrate-prod.sh", "geoip-mensual.sh", "limpiar.sh"]) {
      expect(leer("scripts", f), f).toMatch(/source scripts\/imagenes-comun\.sh/);
    }
  });
});

describe("la limpieza y el cron de geoip (2026-11-12: un `prune -a` borró las imágenes de un solo uso)", () => {
  const scripts = ["deploy.sh", "limpiar.sh", "geoip-mensual.sh", "migrate-prod.sh"].map((f) => [
    f,
    leer("scripts", f),
  ]);

  it("ningún script borra imágenes con `prune -a` (solo la caché de build)", () => {
    for (const [f, s] of scripts) {
      expect(s, f).not.toMatch(/docker (image|system) prune[^\n]*\s-a\b/);
    }
    expect(leer("scripts", "limpiar.sh")).toMatch(/docker builder prune -a -f/);
  });

  it("el runbook dice que `limpiar.sh` es la ÚNICA forma, y avisa contra el `prune -a`", () => {
    const estado = leer("estado.md");
    expect(estado).toMatch(/Limpiar disco: SOLO `\.\/scripts\/limpiar\.sh`/);
    expect(estado).toMatch(/Nunca `docker image prune -a` ni `docker system prune -a`/);
  });

  it("el cron de geoip es `geoip-mensual.sh` (no depende de la etiqueta local `desplegada`)", () => {
    expect(leer("estado.md")).toMatch(/`\.\/scripts\/geoip-mensual\.sh`/);
    // En un comentario del compose: se lee el fichero tal cual (PROD va sin comentarios).
    expect(readFileSync(path.resolve(__dirname, "..", "docker-compose.prod.yml"), "utf8")).toMatch(
      /Linea del cron mensual: {2}\.\/scripts\/geoip-mensual\.sh/,
    );
    expect(leer("scripts", "geoip-mensual.sh")).toMatch(/SHA=\$\(sha_en_marcha\)/);
  });
});
