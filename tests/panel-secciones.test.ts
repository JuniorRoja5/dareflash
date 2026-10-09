/**
 * Secciones del panel (M6), pieza PURA. Con dientes: `/panel` (Resumen) es EXACTA —si fuera prefijo, se
 * encendería en TODAS las subrutas—; las demás encienden en su ruta y subrutas. Y la lista es coherente.
 */
import { describe, expect, it } from "vitest";

import { SECCIONES_PANEL, seccionActiva, seccionPorHref } from "../src/app/panel/secciones";

describe("seccionActiva", () => {
  it("/panel (Resumen) es EXACTA: no se enciende en las subrutas", () => {
    expect(seccionActiva("/panel", "/panel")).toBe(true);
    expect(seccionActiva("/panel", "/panel/retos")).toBe(false);
    expect(seccionActiva("/panel", "/panel/moderacion")).toBe(false);
  });

  it("una sección se enciende en su ruta y en sus subrutas (prefijo)", () => {
    expect(seccionActiva("/panel/retos", "/panel/retos")).toBe(true);
    expect(seccionActiva("/panel/retos", "/panel/retos/algo")).toBe(true);
    expect(seccionActiva("/panel/retos", "/panel/usuarios")).toBe(false);
    // No enciende por coincidencia parcial de nombre.
    expect(seccionActiva("/panel/retos", "/panel/retosx")).toBe(false);
  });
});

describe("SECCIONES_PANEL", () => {
  it("todas cuelgan de /panel, con href único; Resumen y Retos son funcionales (fase null)", () => {
    const hrefs = SECCIONES_PANEL.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length); // sin duplicados
    for (const s of SECCIONES_PANEL) expect(s.href.startsWith("/panel")).toBe(true);
    expect(seccionPorHref("/panel")?.fase).toBeNull();
    expect(seccionPorHref("/panel/retos")?.fase).toBeNull();
    // Moderación dejó de ser placeholder cuando se construyó la cola (Fase 5).
    expect(seccionPorHref("/panel/moderacion")?.fase).toBeNull();
    // Y Boost cuando se construyó su panel (Fase 6, última pieza): ver vigentes, retirar y ajustar.
    expect(seccionPorHref("/panel/boost")?.fase).toBeNull();
    // Las que siguen siendo placeholder llevan una fase futura (número).
    expect(seccionPorHref("/panel/monedero")?.fase).toBe(7);
  });

  it("la única sección que sigue siendo placeholder es el Monedero (Fase 7)", () => {
    // Lo que esto fija no es la lista, es el GESTO: construir una sección y olvidarse de bajar su
    // `fase` a null deja el placeholder puesto encima de una pantalla que ya funciona. Pasó a estar
    // a un descuido de distancia en cuanto hubo más de una sección viva.
    const placeholders = SECCIONES_PANEL.filter((s) => s.fase !== null).map((s) => s.href);
    expect(placeholders).toEqual(["/panel/monedero"]);
  });
});
