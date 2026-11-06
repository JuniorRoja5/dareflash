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
  destinoValido,
  diasSeguidos,
  elegiblesEnHueco,
  estadoVisiblePublicidad,
  estimacionDelCalendario,
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
