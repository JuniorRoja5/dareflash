/**
 * LA LÓGICA PURA DE LA PUBLICIDAD (Fase 9 · P6): precio, zonas, estado visible, la CASCADA de cada
 * espacio y la estimación. La cascada es la pieza que reutilizará el reparto de P7: aquí se fija ya que
 * un espectador de ciudad NUNCA recibe una campaña global en el hueco local.
 *
 * Para romperlo a propósito: que la cascada local siga hasta global (rojo el de la ciudad); que la
 * estimación use la media de los días y no el peor (rojo); quitar el tope de Global a los países (rojo).
 */
import { describe, expect, it } from "vitest";

import { CREDITOS_POR_DIA } from "../src/config/constants";
import type { Ubicacion } from "../src/lib/geo";
import {
  type CampanaEnReparto,
  accionesPublicidad,
  claveRotacion,
  destinoValido,
  clicsPorCienVistas,
  diasPorDelante,
  diasSeguidos,
  elegiblesEnHueco,
  elegirConRotacion,
  espacioDelHueco,
  estadoVisiblePublicidad,
  estimacionDelCalendario,
  fraseSaldo,
  huecosEnTramo,
  nivelesDeRespaldo,
  personasQueLeTocan,
  tarifaPorDia,
  zonasDeCampana,
} from "../src/lib/publicidad";

const VALENCIA = 2509954;
const CASTELLON = 2519752;
const enValencia: Ubicacion = { paisIso: "ES", estadoCodigo: "ES.60", ciudadId: VALENCIA };

const campana = (id: string, c: Partial<CampanaEnReparto>): CampanaEnReparto => ({
  id,
  alcance: "CIUDAD",
  ciudades: [],
  estadoCodigo: null,
  paises: [],
  ...c,
});

describe("el precio", () => {
  it("cada alcance su tarifa, de la tabla", () => {
    expect(tarifaPorDia("CIUDAD")).toBe(CREDITOS_POR_DIA.CIUDAD);
    expect(tarifaPorDia("ESTADO")).toBe(CREDITOS_POR_DIA.ESTADO);
    expect(tarifaPorDia("GLOBAL")).toBe(CREDITOS_POR_DIA.GLOBAL);
  });

  it("países: 5 por país, y nunca más que Global", () => {
    expect([1, 2, 3, 4, 10].map((n) => tarifaPorDia("PAIS", n))).toEqual([5, 10, 15, 15, 15]);
  });
});

describe("las zonas que ocupa", () => {
  it("una por país, ordenadas y sin repetir (todas las transacciones ocupan en el mismo orden)", () => {
    expect(
      zonasDeCampana({
        alcance: "PAIS",
        ciudadId: null,
        estadoCodigo: null,
        paises: ["MX", "ES", "MX"],
      }),
    ).toEqual(["PAIS:ES", "PAIS:MX"]);
    expect(
      zonasDeCampana({ alcance: "CIUDAD", ciudadId: VALENCIA, estadoCodigo: null, paises: [] }),
    ).toEqual([`CIUDAD:${VALENCIA}`]);
    expect(
      zonasDeCampana({ alcance: "GLOBAL", ciudadId: null, estadoCodigo: null, paises: [] }),
    ).toEqual(["GLOBAL:*"]);
  });
});

describe("el estado visible y las acciones", () => {
  it("la intención guardada más el calendario", () => {
    const cal = (ocupaHoy: boolean, ocupaDespues: boolean) => ({ ocupaHoy, ocupaDespues });
    expect(estadoVisiblePublicidad("ACTIVA", cal(true, true))).toBe("ACTIVA");
    expect(estadoVisiblePublicidad("ACTIVA", cal(false, true))).toBe("PROGRAMADA");
    expect(estadoVisiblePublicidad("ACTIVA", cal(false, false))).toBe("FINALIZADA");
    expect(estadoVisiblePublicidad("PAUSADA", cal(true, false))).toBe("PAUSADA");
    expect(estadoVisiblePublicidad("BORRADOR", cal(false, false))).toBe("BORRADOR");
  });

  it("un botón por acción que el servidor acepta, y ninguno en lo terminado", () => {
    expect(accionesPublicidad("BORRADOR")).toEqual(["ACTIVAR", "BORRAR"]);
    expect(accionesPublicidad("PAUSADA")).toEqual(["REANUDAR", "TERMINAR"]);
    expect(accionesPublicidad("FINALIZADA")).toEqual([]);
    expect(accionesPublicidad("TERMINADA")).toEqual([]);
    // P8: en revisión (la pausó el umbral) solo se puede terminar; retirada, nada.
    expect(accionesPublicidad("EN_REVISION")).toEqual(["TERMINAR"]);
    expect(accionesPublicidad("RETIRADA")).toEqual([]);
    const sinDias = { ocupaHoy: false, ocupaDespues: false };
    expect(estadoVisiblePublicidad("PAUSADA", sinDias, true)).toBe("EN_REVISION");
    expect(estadoVisiblePublicidad("PAUSADA", sinDias, false)).toBe("PAUSADA");
    expect(estadoVisiblePublicidad("RETIRADA", sinDias)).toBe("RETIRADA");
  });
});

describe("la cascada de cada espacio", () => {
  const deCiudad = campana("ciudad", { alcance: "CIUDAD", ciudades: [VALENCIA, CASTELLON] });
  const deEstado = campana("estado", { alcance: "ESTADO", estadoCodigo: "ES.60" });
  const dePais = campana("pais", { alcance: "PAIS", paises: ["ES"] });
  const global = campana("global", { alcance: "GLOBAL" });
  const todas = [deCiudad, deEstado, dePais, global];
  const ids = (cs: CampanaEnReparto[]) => cs.map((c) => c.id);

  it("un espectador de ciudad NUNCA recibe una campaña global en el hueco local", () => {
    expect(ids(elegiblesEnHueco("LOCAL", enValencia, todas))).toEqual(["ciudad"]);
    // Ni aunque no haya nada local: el hueco es de la casa, no de lo global.
    expect(elegiblesEnHueco("LOCAL", enValencia, [dePais, global])).toEqual([]);
  });

  it("y lo local nunca entra en el hueco global", () => {
    expect(ids(elegiblesEnHueco("GLOBAL", enValencia, todas))).toEqual(["pais"]);
    expect(elegiblesEnHueco("GLOBAL", enValencia, [deCiudad, deEstado])).toEqual([]);
  });

  it("excluyente: la de estado entra solo si ninguna de ciudad cubre al espectador", () => {
    const enAlicante: Ubicacion = { paisIso: "ES", estadoCodigo: "ES.60", ciudadId: 2521978 };
    expect(ids(elegiblesEnHueco("LOCAL", enAlicante, todas))).toEqual(["estado"]);
  });

  it("excluyente: la global entra solo si ninguna de su país", () => {
    const enMexico: Ubicacion = { paisIso: "MX", estadoCodigo: null, ciudadId: null };
    expect(ids(elegiblesEnHueco("GLOBAL", enMexico, todas))).toEqual(["global"]);
  });

  it("sin ubicación: nada local; en lo global, solo las globales", () => {
    const nadie: Ubicacion = { paisIso: null, estadoCodigo: null, ciudadId: null };
    expect(elegiblesEnHueco("LOCAL", nadie, todas)).toEqual([]);
    expect(ids(elegiblesEnHueco("GLOBAL", nadie, todas))).toEqual(["global"]);
  });

  it("los niveles de respaldo de la estimación no cruzan de espacio", () => {
    expect(nivelesDeRespaldo("CIUDAD")).toEqual(["ESTADO", "PAIS"]);
    expect(nivelesDeRespaldo("PAIS")).toEqual(["GLOBAL"]);
    expect(nivelesDeRespaldo("CIUDAD")).not.toContain("GLOBAL");
  });
});

describe("la estimación", () => {
  const propia = campana("mia", { alcance: "CIUDAD", ciudades: [VALENCIA, CASTELLON] });
  const grupos = [
    { ubicacion: enValencia, personas: 60 },
    { ubicacion: { paisIso: "ES", estadoCodigo: "ES.60", ciudadId: CASTELLON }, personas: 30 },
  ];

  it("sola en su zona, le toca toda la gente de su radio", () => {
    expect(personasQueLeTocan(propia, grupos, [])).toBe(90);
  });

  it("una vecina cuyo radio cubre Valencia diluye solo a la gente de Valencia", () => {
    const vecina = campana("vecina", { alcance: "CIUDAD", ciudades: [VALENCIA] });
    expect(personasQueLeTocan(propia, grupos, [vecina])).toBe(60 / 2 + 30);
  });

  it("una de estado no le quita nada: donde hay de ciudad, la de estado no sale", () => {
    const deEstado = campana("estado", { alcance: "ESTADO", estadoCodigo: "ES.60" });
    expect(personasQueLeTocan(propia, grupos, [deEstado])).toBe(90);
  });

  it("con el calendario: el PEOR día, redondeado a la baja", () => {
    const dias = diasSeguidos(new Date("2026-12-01T00:00:00.000Z"), 3);
    const otra = campana("otra", { alcance: "CIUDAD", ciudades: [VALENCIA, CASTELLON] });
    const otraDos = campana("otra2", { alcance: "CIUDAD", ciudades: [VALENCIA, CASTELLON] });
    // Día 2 con dos competidoras: 90 / 3 = 30. Los otros, 90 y 45.
    const porDia = (d: Date) =>
      d.getUTCDate() === 1 ? [] : d.getUTCDate() === 2 ? [otra] : [otra, otraDos];
    expect(estimacionDelCalendario(propia, grupos, dias, porDia)).toBe(30);
    const raros = [{ ubicacion: enValencia, personas: 10 }];
    expect(estimacionDelCalendario(propia, raros, dias.slice(0, 1), () => [otra, otraDos])).toBe(3);
  });
});

describe("el reparto (P7), simulado", () => {
  const tres = [{ id: "c" }, { id: "a" }, { id: "b" }];

  it("los huecos alternan espacio: el 1.º global, el 2.º local…", () => {
    expect([0, 1, 2, 3].map(espacioDelHueco)).toEqual(["GLOBAL", "LOCAL", "GLOBAL", "LOCAL"]);
  });

  it("un hueco tras cada 8 vídeos, contados desde el principio del feed y no por página", () => {
    // Página 1: vídeos 0..9 → hueco tras el 7 (k=0). Página 2: vídeos 10..19 → tras el 15 (k=1), que es
    // el 5.º de esa página. Si se contara por página, el 2.º hueco caería en otro sitio.
    expect(huecosEnTramo(0, 10, 8)).toEqual([{ k: 0, despuesDe: 7 }]);
    expect(huecosEnTramo(10, 10, 8)).toEqual([{ k: 1, despuesDe: 5 }]);
    expect(huecosEnTramo(0, 7, 8)).toEqual([]);
    expect(huecosEnTramo(0, 24, 8).map((h) => h.k)).toEqual([0, 1, 2]);
  });

  it("100.000 impresiones entre 3 campañas: cada una un tercio, ±1", () => {
    const cuenta = new Map<string, number>();
    for (let n = 0; n < 100_000; n += 1) {
      const c = elegirConRotacion(tres, n)!;
      cuenta.set(c.id, (cuenta.get(c.id) ?? 0) + 1);
    }
    const valores = [...cuenta.values()];
    expect(valores).toHaveLength(3);
    expect(Math.max(...valores) - Math.min(...valores)).toBeLessThanOrEqual(1);
    for (const v of valores) expect(Math.abs(v - 100_000 / 3)).toBeLessThanOrEqual(1);
  });

  it("con un número que no divide, la más y la menos servida se llevan como mucho 1", () => {
    const cinco = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    const cuenta = new Map<string, number>();
    for (let n = 0; n < 1_003; n += 1) {
      const c = elegirConRotacion(cinco, n)!;
      cuenta.set(c.id, (cuenta.get(c.id) ?? 0) + 1);
    }
    const v = [...cuenta.values()];
    expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
  });

  it("estable: el mismo contador da la misma campaña, se pidan en el orden que se pidan", () => {
    expect(elegirConRotacion(tres, 4)?.id).toBe(elegirConRotacion([...tres].reverse(), 4)?.id);
  });

  it("tope de frecuencia: se salta lo recién visto; si todo lo es, ninguna (no se repite el cartel)", () => {
    expect(elegirConRotacion(tres, 0, new Set(["a"]))?.id).toBe("b");
    expect(elegirConRotacion([{ id: "a" }], 0, new Set(["a"]))).toBeNull();
    expect(elegirConRotacion([], 0)).toBeNull();
  });

  it("la clave del contador es el nivel de la cascada en el sitio de quien mira", () => {
    const deCiudad = campana("x", { alcance: "CIUDAD", ciudades: [VALENCIA] });
    const global = campana("g", { alcance: "GLOBAL" });
    expect(claveRotacion("LOCAL", enValencia, [deCiudad])).toBe(`LOCAL:CIUDAD:${VALENCIA}`);
    expect(claveRotacion("GLOBAL", enValencia, [global])).toBe("GLOBAL:GLOBAL");
  });
});

describe("la frase del saldo", () => {
  it("sin nada comprometido, el saldo a secas; con algo, cuánto queda para nuevas", () => {
    expect(fraseSaldo(90, 0)).toBe("Tienes 90 créditos de publicidad.");
    expect(fraseSaldo(90, 60)).toBe(
      "Tienes 90 créditos de publicidad; 60 ya están comprometidos en tus otras campañas, así que te quedan 30 para nuevas.",
    );
    expect(fraseSaldo(1, 0)).toBe("Tienes 1 crédito de publicidad.");
    // Nunca un disponible negativo (el saldo pudo bajar por un ajuste después de comprometer).
    expect(fraseSaldo(10, 30, "todas")).toContain("te quedan 0 para nuevas");
  });
});

describe("el destino del clic", () => {
  it("solo http(s) absoluto", () => {
    expect(destinoValido("https://panaderia.example.com/oferta")).toBe(true);
    expect(destinoValido("http://tienda.example.org")).toBe(true);
    expect(destinoValido("javascript:alert(1)")).toBe(false);
    expect(destinoValido("data:text/html,hola")).toBe(false);
    expect(destinoValido("/ruta/relativa")).toBe(false);
    expect(destinoValido("https://localhost")).toBe(false);
  });
});

describe("los días por delante que enseña la ficha (Fase 9 · P8)", () => {
  it("una RETIRADA no tiene días por delante: se liberaron y no se devuelven", () => {
    // Se vio en la ficha del portal: «Le quedan 60 créditos (4 días)» en una campaña retirada.
    expect(diasPorDelante("RETIRADA", 5, 1)).toBe(0);
    expect(diasPorDelante("TERMINADA", 5, 1)).toBe(0);
    expect(diasPorDelante("FINALIZADA", 5, 5)).toBe(0);
  });

  it("pausada o en revisión: los que recupera al reanudar; borrador: los contratados", () => {
    expect(diasPorDelante("PAUSADA", 5, 1)).toBe(4);
    expect(diasPorDelante("EN_REVISION", 5, 1)).toBe(4);
    expect(diasPorDelante("ACTIVA", 5, 2)).toBe(3);
    expect(diasPorDelante("BORRADOR", 5, 0)).toBe(5);
    expect(diasPorDelante("ACTIVA", 5, 9)).toBe(0);
  });
});

describe("clics por cada 100 vistas (Fase 9 · P10)", () => {
  it("con un decimal; sin vistas no hay cifra (no es un 0)", () => {
    expect(clicsPorCienVistas(200, 5)).toBe(2.5);
    expect(clicsPorCienVistas(3, 1)).toBe(33.3);
    expect(clicsPorCienVistas(0, 0)).toBeNull();
    expect(clicsPorCienVistas(0, 2)).toBeNull();
  });
});
