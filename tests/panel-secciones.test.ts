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
    // Las placeholder llevan una fase futura (número).
    expect(seccionPorHref("/panel/moderacion")?.fase).toBe(5);
    expect(seccionPorHref("/panel/monedero")?.fase).toBe(7);
  });
});
