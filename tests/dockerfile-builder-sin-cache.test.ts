/**
 * La etapa `builder` del Dockerfile BORRA la cache de `next build`, en el MISMO RUN que construye.
 *
 * Desde Next 16.3, `next build` escribe por defecto la cache de Turbopack en .next/cache (~115 MB).
 * En Docker no se reutiliza nunca (cada build parte de una capa limpia), y `worker` y `migrate`
 * heredan de `builder`: sin el borrado, la imagen del worker crecia 90 MB de algo que no usa. Ningun
 * test de comportamiento lo notaria —la imagen funciona igual, solo pesa mas—; por eso se fija aqui.
 */
import { describe, expect, it } from "vitest";

import { etapaDockerfile } from "./helpers/dockerfile";

describe("la cache de `next build` no viaja en las imagenes", () => {
  it("`builder` borra .next/cache en el MISMO RUN que ejecuta el build", () => {
    const lineaBuild = etapaDockerfile("builder")
      .split("\n")
      .find((l) => l.includes("npm run build"));
    expect(lineaBuild).toBeDefined();
    // En un RUN aparte no serviria: la capa del build ya contendria la cache y la imagen pesaria igual.
    expect(lineaBuild).toMatch(/npm run build && rm -rf \.next\/cache\s*$/);
  });
});
