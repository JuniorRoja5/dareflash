import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import robots from "../src/app/robots";

/**
 * PESTILLO DE LANZAMIENTO. dareflash.com NO debe indexarse hasta la Fase 1 (decision de Junior).
 * Estos tests son el pestillo: el dia que alguien quite el noindex —cabecera o robots.txt— SALTAN
 * y obligan a mirar lo que esta haciendo. NO los "arregles" para que pasen: si tocas el bloqueo de
 * indexacion, es una decision CONSCIENTE, no un test molesto que ajustar.
 */
describe("bloqueo de indexacion (pestillo de lanzamiento)", () => {
  it("next.config aplica X-Robots-Tag: noindex a TODAS las rutas (/:path*)", async () => {
    const headers = (await nextConfig.headers?.()) ?? [];
    const global = headers.find((h) => h.source === "/:path*");
    expect(global, "debe existir una regla de cabeceras para /:path*").toBeTruthy();
    const xRobots = global!.headers.find((h) => h.key === "X-Robots-Tag");
    expect(xRobots?.value).toMatch(/noindex/);
  });

  it("robots.txt bloquea TODO el sitio (pestillo Fase 1) y el panel de admin explícitamente", () => {
    const salida = robots();
    const reglas = Array.isArray(salida.rules) ? salida.rules : [salida.rules];
    const star = reglas.find((r) => r.userAgent === "*");
    expect(star, "debe existir una regla para el agente *").toBeTruthy();
    const disallow = star!.disallow;
    const rutas = Array.isArray(disallow) ? disallow : disallow ? [disallow] : [];
    expect(rutas).toContain("/"); // pestillo de lanzamiento: sigue vigente
    expect(rutas).toContain("/panel"); // el panel NUNCA se indexa (sobrevive si se levanta "/")
  });
});
