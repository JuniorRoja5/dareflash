/**
 * Filtros del inspector de notificaciones (PURO): de la URL a filtros válidos. Lo que no valida se
 * ignora; las fechas son días UTC enteros (`hasta` incluido).
 */
import { describe, expect, it } from "vitest";

import { leerFiltrosInspector } from "../src/lib/filtros-inspector";

describe("leerFiltrosInspector", () => {
  it("usuario sin @, tipo de la unión y días UTC enteros (el de `hasta`, incluido)", () => {
    const { filtros, valores, consulta } = leerFiltrosInspector({
      usuario: " @lucia ",
      tipo: "ANUNCIO",
      desde: "2026-03-01",
      hasta: "2026-03-02",
    });
    expect(filtros.usuario).toBe("lucia");
    expect(filtros.tipo).toBe("ANUNCIO");
    expect(filtros.desde?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    // Exclusivo: el 2 entero cuenta, el 3 ya no.
    expect(filtros.hasta?.toISOString()).toBe("2026-03-03T00:00:00.000Z");
    expect(valores).toEqual({
      usuario: "lucia",
      tipo: "ANUNCIO",
      desde: "2026-03-01",
      hasta: "2026-03-02",
    });
    expect(consulta).toBe("usuario=lucia&tipo=ANUNCIO&desde=2026-03-01&hasta=2026-03-02");
  });

  it("lo que no valida se IGNORA: un tipo inventado o una fecha imposible no filtran", () => {
    const { filtros, consulta } = leerFiltrosInspector({
      tipo: "COMENTARIO_RECIBIDO",
      desde: "2026-02-31",
      hasta: "ayer",
    });
    expect(filtros).toEqual({ usuario: null, tipo: null, desde: null, hasta: null });
    expect(consulta).toBe("");
  });

  it("sin nada: sin filtros", () => {
    expect(leerFiltrosInspector({}).filtros).toEqual({
      usuario: null,
      tipo: null,
      desde: null,
      hasta: null,
    });
  });
});
