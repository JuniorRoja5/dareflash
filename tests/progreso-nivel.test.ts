/**
 * EL PROGRESO AL SIGUIENTE NIVEL SALE DE LOS UMBRALES, no de una cuenta escrita en la pantalla.
 *
 * Lo que se fija:
 *  - el porcentaje es DEL TRAMO, no del total (si no, la barra de un Rookie no se movería en meses);
 *  - nunca dice 100% sin haber llegado (de ahí el `floor`, y aquí está el caso exacto: 499 de 500);
 *  - en el nivel MÁXIMO no hay barra ni "faltan N", hay techo;
 *  - `faltan` concuerda con los umbrales de `NIVELES`, no con números escritos aquí.
 *
 * Para romperlo: cambiar `Math.floor` por `Math.round` (rojo en "no miente al 99,8%"); dividir entre
 * el umbral del último nivel en vez de entre el tramo (rojo en "el porcentaje es del tramo"); dar
 * `siguiente` en Legend (rojo en "techo"); o mover un umbral en `niveles.ts` (rojo en los casos que
 * se derivan de él, que es justo lo que se quiere: la pantalla sigue al dominio).
 */
import { describe, expect, it } from "vitest";

import { NIVELES, nivelPorPuntos } from "../src/lib/niveles";
import { progresoNivel } from "../src/lib/progreso-nivel";

const ultimo = NIVELES[NIVELES.length - 1]!;

describe("el tramo, no el total", () => {
  it("a mitad de camino entre dos umbrales, el 50%", () => {
    for (let i = 0; i < NIVELES.length - 1; i += 1) {
      const actual = NIVELES[i]!;
      const siguiente = NIVELES[i + 1]!;
      const medio = actual.minimo + Math.floor((siguiente.minimo - actual.minimo) / 2);
      const p = progresoNivel(medio);
      expect(p.nivel.clave, `${medio} puntos`).toBe(actual.clave);
      expect(p.siguiente?.clave).toBe(siguiente.clave);
      // 50 exacto, o 49 cuando el tramo es impar y el punto medio cae justo por debajo.
      expect(p.porcentaje, `${actual.clave} -> ${siguiente.clave}`).toBeGreaterThanOrEqual(49);
      expect(p.porcentaje).toBeLessThanOrEqual(50);
    }
  });

  it("justo en el umbral se estrena nivel: 0% del tramo nuevo, no 100% del viejo", () => {
    for (const n of NIVELES) {
      const p = progresoNivel(n.minimo);
      expect(p.nivel.clave, `${n.minimo} puntos`).toBe(n.clave);
      if (!p.esMaximo) expect(p.porcentaje).toBe(0);
    }
  });

  it("NO miente al 99,8%: con un punto de menos no dice 100%", () => {
    for (let i = 0; i < NIVELES.length - 1; i += 1) {
      const siguiente = NIVELES[i + 1]!;
      const p = progresoNivel(siguiente.minimo - 1);
      expect(p.porcentaje, `a 1 punto de ${siguiente.clave}`).toBeLessThan(100);
      expect(p.faltan).toBe(1);
      expect(p.siguiente?.clave).toBe(siguiente.clave);
    }
  });
});

describe("cuánto falta", () => {
  it("`faltan` es la diferencia con el umbral del siguiente, salga de donde salga", () => {
    for (const puntos of [0, 1, 99, 100, 250, 499, 500, 1999, 2000, 9999]) {
      const p = progresoNivel(puntos);
      const siguiente = p.siguiente;
      if (!siguiente) continue;
      expect(p.faltan, `${puntos} puntos`).toBe(siguiente.minimo - puntos);
      // Y siempre es algo que queda por hacer: un "faltan 0" con nivel sin estrenar sería absurdo.
      expect(p.faltan).toBeGreaterThan(0);
    }
  });

  it("el nivel que devuelve es el mismo que `nivelPorPuntos`: una sola fuente", () => {
    for (const puntos of [-50, 0, 99, 100, 1999, 10_000, 99_999]) {
      expect(progresoNivel(puntos).nivel.clave, `${puntos}`).toBe(nivelPorPuntos(puntos).clave);
    }
  });
});

describe("el techo", () => {
  it("en el nivel máximo no hay siguiente ni cuenta atrás", () => {
    for (const puntos of [ultimo.minimo, ultimo.minimo + 1, 1_000_000]) {
      const p = progresoNivel(puntos);
      expect(p.esMaximo, `${puntos} puntos`).toBe(true);
      expect(p.siguiente).toBeNull();
      expect(p.faltan).toBe(0);
      expect(p.porcentaje).toBe(100);
    }
  });

  it("y por debajo del techo SIEMPRE hay siguiente", () => {
    const p = progresoNivel(ultimo.minimo - 1);
    expect(p.esMaximo).toBe(false);
    expect(p.siguiente?.clave).toBe(ultimo.clave);
  });
});

describe("bordes", () => {
  it("puntos negativos caen en el primer nivel y la barra no va al revés", () => {
    const p = progresoNivel(-100);
    expect(p.nivel.clave).toBe(NIVELES[0]!.clave);
    expect(p.porcentaje).toBe(0);
    expect(p.porcentaje).not.toBeLessThan(0);
  });

  it("el porcentaje nunca se sale de 0..100", () => {
    for (let puntos = -10; puntos <= 12_000; puntos += 37) {
      const p = progresoNivel(puntos);
      expect(p.porcentaje, `${puntos}`).toBeGreaterThanOrEqual(0);
      expect(p.porcentaje, `${puntos}`).toBeLessThanOrEqual(100);
    }
  });
});
