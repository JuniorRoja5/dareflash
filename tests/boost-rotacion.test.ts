/**
 * LA ROTACIÓN DE LA PORTADA — y la promesa que tiene que cumplir.
 *
 * ┌─ LO QUE SE PROMETE ────────────────────────────────────────────────────────────────────────────┐
 * │ Cada activación da una hora en «Perfiles Boost» y AL MENOS `BOOST_MIN_PORTADA` minutos en la   │
 * │ portada dentro de esa hora. Con 5 huecos y 60 activaciones a la vez la aritmética no deja      │
 * │ margen: 60 ventanas × 5 huecos = 300 minutos-hueco por hora, repartidos entre 60 personas son  │
 * │ 5 justos. El reparto tiene que ser EXACTO, no aproximado.                                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUÉ HAY UNA SIMULACIÓN Y NO SOLO CASOS SUELTOS ───────────────────────────────────────────┐
 * │ Lo que había antes —«los 5 más recientes»— pasa cualquier caso suelto: con cinco vigentes sale │
 * │ bien, con uno también. El fallo solo aparece con LLEGADAS ESCALONADAS, que es lo que pasa en   │
 * │ una hora con tráfico: cada compra nueva empuja hacia abajo a quien compró antes, y el primero  │
 * │ se queda sin volver. Eso no se ve sin correr el reloj, así que aquí se corre: varias horas,    │
 * │ varios patrones de llegada, y se mide el PEOR caso.                                            │
 * │                                                                                                 │
 * │ ROTURA COMPROBADA: devolviendo «los 5 más recientes», el mínimo cae a 0 ventanas y enrojecen   │
 * │ los patrones de RÁFAGAS y AVALANCHA. Y —esto es lo instructivo— el patrón SATURADO sigue       │
 * │ verde: con una llegada por ventana, la pila va dando 5 ventanas a cada uno antes de empujarlo  │
 * │ fuera. Por eso hay varios patrones y no uno: el fallo solo asoma cuando varias personas        │
 * │ compran a la vez, que es justo la hora que más importa.                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from "vitest";

import {
  BOOST_CARRILES,
  BOOST_DESTACADOS_PORTADA,
  BOOST_DURACION_MIN,
  BOOST_MAX_SIMULTANEOS,
  BOOST_MIN_PORTADA,
  BOOST_ROTACION_SEG,
} from "../src/config/constants";
import { indiceVentana, portadaDeVentana, type AparicionRotable } from "../src/lib/boost-rotacion";

const OPC = { carriles: BOOST_CARRILES, huecos: BOOST_DESTACADOS_PORTADA };
const VENTANAS_POR_HORA = (BOOST_DURACION_MIN * 60) / BOOST_ROTACION_SEG;

describe("las cifras encajan entre sí, o la promesa no se sostiene", () => {
  it("los carriles son el máximo entre los huecos, y la división es EXACTA", () => {
    // Si no fuera exacta, un carril tendría más gente que otro y a esa gente le tocarían menos
    // minutos. El número de carriles no se elige: se deduce.
    expect(BOOST_CARRILES).toBe(BOOST_MAX_SIMULTANEOS / BOOST_DESTACADOS_PORTADA);
    expect(Number.isInteger(BOOST_CARRILES)).toBe(true);
  });

  it("una hora cabe un número ENTERO de ventanas, y es múltiplo de los carriles", () => {
    // Las dos cosas sostienen la cuenta: en 60 ventanas consecutivas, `w mod 12` cae en un carril
    // dado exactamente 5 veces. Si la hora no fuera múltiplo, caería 4 ó 5 según cuándo empezaras.
    expect(Number.isInteger(VENTANAS_POR_HORA)).toBe(true);
    expect(VENTANAS_POR_HORA % BOOST_CARRILES).toBe(0);
    expect(VENTANAS_POR_HORA / BOOST_CARRILES).toBe(BOOST_MIN_PORTADA);
  });
});

describe("la ventana es de reloj", () => {
  it("el mismo segundo da el mismo índice, y no depende de cuándo arrancó el proceso", () => {
    const t = Date.UTC(2026, 10, 3, 12, 34, 56);
    expect(indiceVentana(t, 60)).toBe(indiceVentana(t + 999, 60));
    expect(indiceVentana(t, 60) + 1).toBe(indiceVentana(t + 60_000, 60));
  });

  it("dos visitantes del MISMO minuto ven exactamente la misma portada", () => {
    const vigentes = Array.from({ length: 40 }, (_, i) => ({
      id: `a${i}`,
      userId: `u${i}`,
      carril: i % BOOST_CARRILES,
    }));
    const t = Date.UTC(2026, 10, 3, 12, 0, 0);
    // Uno entra en el segundo 2 y el otro en el 58 de la misma ventana.
    const a = portadaDeVentana(vigentes, indiceVentana(t + 2_000, BOOST_ROTACION_SEG), OPC);
    const b = portadaDeVentana(vigentes, indiceVentana(t + 58_000, BOOST_ROTACION_SEG), OPC);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    // Y la ventana siguiente SÍ cambia, o no sería una rotación.
    const c = portadaDeVentana(vigentes, indiceVentana(t + 62_000, BOOST_ROTACION_SEG), OPC);
    expect(c.map((x) => x.id)).not.toEqual(a.map((x) => x.id));
  });
});

describe("las reglas de un vistazo", () => {
  it("con pocos vigentes salen TODOS, en todas las ventanas", () => {
    const pocos = Array.from({ length: BOOST_DESTACADOS_PORTADA }, (_, i) => ({
      id: `a${i}`,
      userId: `u${i}`,
      carril: i,
    }));
    for (let w = 0; w < BOOST_CARRILES * 2; w += 1) {
      expect(portadaDeVentana(pocos, w, OPC)).toHaveLength(BOOST_DESTACADOS_PORTADA);
    }
  });

  it("nunca se devuelven más de los huecos que hay", () => {
    const muchos = Array.from({ length: BOOST_MAX_SIMULTANEOS }, (_, i) => ({
      id: `a${i}`,
      userId: `u${i}`,
      carril: i % BOOST_CARRILES,
    }));
    for (let w = 0; w < BOOST_CARRILES; w += 1) {
      expect(portadaDeVentana(muchos, w, OPC)).toHaveLength(BOOST_DESTACADOS_PORTADA);
    }
  });

  it("una persona con DOS apariciones vivas ocupa UN hueco, no dos", () => {
    // Quien encadena boosts vuelve a encabezar, pero no acapara la vitrina.
    const repetida: AparicionRotable[] = [
      { id: "a1", userId: "u1", carril: 0 },
      { id: "a2", userId: "u1", carril: 0 },
      { id: "b1", userId: "u2", carril: 0 },
    ];
    const salida = portadaDeVentana(repetida, 0, OPC);
    expect(new Set(salida.map((s) => s.userId)).size).toBe(salida.length);
    expect(salida.map((s) => s.userId)).toEqual(["u1", "u2"]);
  });

  it("un carril fuera de rango no desaparece de la portada durante una hora", () => {
    // Pasaría si alguien baja el máximo con apariciones vivas: su carril ya no existe. Entran por
    // el equivalente en vez de quedarse invisibles habiendo pagado.
    const rara = [{ id: "a", userId: "u", carril: BOOST_CARRILES + 3 }];
    expect(portadaDeVentana(rara, 3, OPC).map((x) => x.id)).toEqual(["a"]);
  });
});

/** Una aparición viva dentro de la simulación. */
interface Viva extends AparicionRotable {
  hastaMs: number;
  ventanas: number;
}

/**
 * Corre el reloj con un patrón de llegadas y devuelve el PEOR número de ventanas en portada de
 * las apariciones que vivieron su hora entera.
 *
 * Reproduce la regla real de asignación de carril (la plaza libre de menor `posicion, carril`,
 * que es lo que hace el UPDATE de `activarBoost`) y el cupo.
 */
function simular(horas: number, llegadas: (v: number) => number) {
  const t0 = Date.UTC(2026, 0, 1);
  const vivas: Viva[] = [];
  const hechas: Viva[] = [];
  // El escaparate: `huecos` plazas por carril, como las filas de `BoostPlaza`.
  const plazas: Array<{ carril: number; posicion: number; libreMs: number }> = [];
  for (let p = 0; p < BOOST_DESTACADOS_PORTADA; p += 1) {
    for (let c = 0; c < BOOST_CARRILES; c += 1) plazas.push({ carril: c, posicion: p, libreMs: 0 });
  }
  plazas.sort((a, b) => a.posicion - b.posicion || a.carril - b.carril);

  let n = 0;
  const ventanas = horas * VENTANAS_POR_HORA;
  for (let v = 0; v < ventanas; v += 1) {
    const ahoraMs = t0 + v * BOOST_ROTACION_SEG * 1000;

    for (let i = vivas.length - 1; i >= 0; i -= 1) {
      if (vivas[i]!.hastaMs <= ahoraMs) hechas.push(...vivas.splice(i, 1));
    }

    for (let k = 0; k < llegadas(v); k += 1) {
      const plaza = plazas.find((p) => p.libreMs <= ahoraMs);
      if (!plaza) continue; // cupo lleno: rechazada, como en producción
      const hastaMs = ahoraMs + BOOST_DURACION_MIN * 60_000;
      plaza.libreMs = hastaMs;
      n += 1;
      vivas.push({
        id: `a${String(n).padStart(5, "0")}`,
        userId: `u${n}`,
        carril: plaza.carril,
        hastaMs,
        ventanas: 0,
      });
    }

    for (const sale of portadaDeVentana(vivas, indiceVentana(ahoraMs, BOOST_ROTACION_SEG), OPC)) {
      vivas.find((x) => x.id === sale.id)!.ventanas += 1;
    }
  }
  const juzgables = hechas.filter((h) => h.hastaMs <= t0 + ventanas * BOOST_ROTACION_SEG * 1000);
  return {
    casos: juzgables.length,
    minimo: Math.min(...juzgables.map((j) => j.ventanas)),
  };
}

describe("la promesa aguanta con llegadas de verdad", () => {
  // Cada patrón es una forma distinta de llenar el escaparate. El que importa es el saturado: con
  // el cupo lleno, el reparto no tiene holgura y cualquier rotación floja se queda corta.
  const patrones: Array<[string, number, (v: number) => number]> = [
    ["saturado: una llegada por ventana", 6, () => 1],
    ["a ráfagas: doce cada diez ventanas", 6, (v) => (v % 10 === 0 ? 12 : 0)],
    ["avalancha: sesenta de golpe cada hora", 6, (v) => (v % 60 === 0 ? 60 : 0)],
    ["irregular", 8, (v) => ((v * 7919) % 5 === 0 ? 2 : v % 3 === 0 ? 1 : 0)],
  ];

  it.each(patrones)("%s: nadie baja de los minutos prometidos", (_nombre, horas, llegadas) => {
    const r = simular(horas, llegadas);
    expect(r.casos, "la simulación no llegó a juzgar ninguna aparición").toBeGreaterThan(50);
    expect(r.minimo).toBeGreaterThanOrEqual(BOOST_MIN_PORTADA);
  });

  it("y con poca gente salen mucho más que el mínimo: el suelo no es el techo", () => {
    // Si la rotación diera SIEMPRE justo el mínimo, estaría desperdiciando huecos cuando sobran.
    const r = simular(6, (v) => (v % 20 === 0 ? 1 : 0));
    expect(r.minimo).toBe(VENTANAS_POR_HORA);
  });
});
