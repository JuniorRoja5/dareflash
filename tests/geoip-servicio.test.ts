/**
 * EL SERVICIO `geoip`: quien ESCRIBE el fichero de IP y con qué (Fase 9 · P5).
 *
 * El guión mensual corre dentro de un servicio de un solo uso del compose, para que el host no tenga que
 * instalar Node ni `maxmind` ni saber dónde vive el volumen. Lo que se fija, porque cualquiera de estas
 * cosas se puede deshacer sin que falle nada a la vista:
 *  - SOLO `geoip` monta `geoip_data` en escritura; `web` y `worker`, en solo lectura (un `:ro` borrado
 *    no rompe nada... hasta que algo de la app escriba donde no debía).
 *  - `geoip` no arranca con `up -d` (perfil propio) ni se reinicia.
 *  - Las tres rutas del fichero —la del servicio, la del worker y el default de `env`— son la MISMA: si
 *    discreparan, el guión escribiría donde la app no lee, y el aviso diría «no hay fichero» para siempre.
 *  - La etapa deriva de `base`, no de `builder`: reconstruirla desde el cron no puede disparar un
 *    `next build` en una máquina de 1 vCPU. Y lleva lo que el guión necesita (curl, los dos guiones y
 *    node_modules para `maxmind`).
 *
 * Para romperlo a propósito: quitar el `:ro` de `web` (rojo); cambiar `FROM base AS geoip` por
 * `FROM builder AS geoip` (rojo); quitar `profiles` del servicio (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { etapaDockerfile } from "./helpers/dockerfile";

const RUTA = "/srv/geoip/dbip-city-lite.mmdb";

/** Los bloques de servicio del compose, sin las líneas de comentario (un comentario no monta nada). */
function servicios(): Map<string, string> {
  const compose = readFileSync(path.resolve(__dirname, "..", "docker-compose.prod.yml"), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  const cuerpo = compose.slice(compose.indexOf("\nservices:"), compose.indexOf("\nvolumes:"));
  const bloques = new Map<string, string>();
  const cabeceras = [...cuerpo.matchAll(/^ {2}([a-z]+):\s*$/gm)];
  cabeceras.forEach((m, i) => {
    bloques.set(m[1]!, cuerpo.slice(m.index, cabeceras[i + 1]?.index));
  });
  return bloques;
}

describe("el volumen del fichero de IP", () => {
  it("solo `geoip` lo monta en escritura; web y worker, en solo lectura", () => {
    const s = servicios();
    const montan = [...s]
      .filter(([, b]) => /geoip_data:/.test(b))
      .map(([n]) => n)
      .sort();
    expect(montan).toEqual(["geoip", "web", "worker"]);
    for (const n of ["web", "worker"]) {
      expect(s.get(n), n).toMatch(/^\s+- geoip_data:\/srv\/geoip:ro\s*$/m);
    }
    expect(s.get("geoip")).toMatch(/^\s+- geoip_data:\/srv\/geoip\s*$/m);
  });

  it("`geoip` es de un solo uso: perfil propio, sin reinicio, y usa SU imagen", () => {
    const g = servicios().get("geoip")!;
    expect(g).toMatch(/profiles: \["geoip"\]/);
    expect(g).toMatch(/restart: "no"/);
    // La imagen de SU etapa la construye CI (y la de emergencia, docker-compose.construir.yml): que
    // cada nombre corresponda a su etapa lo vigila `imagenes-ci.test`.
    expect(g).toMatch(
      /^\s+image: ghcr\.io\/juniorroja5\/dareflash-geoip:\$\{IMAGE_TAG:-desplegada\}\s*$/m,
    );
  });

  it("las tres rutas del fichero son la misma", () => {
    const s = servicios();
    expect(s.get("geoip")).toContain(`GEOIP_FICHERO: ${RUTA}`);
    expect(s.get("worker")).toContain(`GEOIP_FICHERO: ${RUTA}`);
    const env = readFileSync(path.resolve(__dirname, "..", "src", "config", "env.ts"), "utf8");
    expect(env).toContain(`.default("${RUTA}")`);
    expect(etapaDockerfile("geoip")).toContain(`ENV GEOIP_FICHERO=${RUTA}`);
  });
});

describe("la etapa `geoip` del Dockerfile", () => {
  const etapa = () => etapaDockerfile("geoip");

  it("deriva de `base`, no de `builder` (reconstruirla nunca dispara un `next build`)", () => {
    expect(etapa()).toMatch(/^FROM base AS geoip\s*$/m);
    expect(etapa()).not.toMatch(/npm run build|COPY \. \./);
  });

  it("lleva lo que el guión necesita: curl, node_modules (maxmind) y los dos guiones", () => {
    expect(etapa()).toMatch(/apt-get install[^\n]*\bcurl\b/);
    expect(etapa()).toMatch(/^COPY --from=deps \/app\/node_modules \.\/node_modules\s*$/m);
    expect(etapa()).toMatch(/COPY scripts\/actualizar-geoip\.sh scripts\/geoip-comprobar\.mjs/);
    expect(etapa()).toMatch(/CMD \["bash", "scripts\/actualizar-geoip\.sh"\]/);
  });
});
