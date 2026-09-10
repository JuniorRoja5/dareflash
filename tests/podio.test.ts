/**
 * FORMA DEL PODIO y color por puesto.
 *
 * Sustituye a `ranking-vistas.test.ts`, que probaba las funciones del módulo de datos de maqueta.
 * Lo que allí era una regla de MARCA —el oro solo para el 1, plata solo para el 2, bronce solo para
 * el 3— se conserva íntegro aquí: se retiró el andamio, no el guardarraíl. Lo que NO se conserva es
 * lo que solo tenía sentido con datos inventados (`listaRanking`, `paginar`): la lista real se pagina
 * por cursor contra el servicio, así que una función de "dame la página N" ya no existe ni debe.
 */
import { describe, expect, it } from "vitest";

import {
  cuantosEnPodio,
  medallaPuesto,
  ordenVisualPodio,
  PODIO_MAX,
  primerPuestoDeLista,
} from "../src/lib/podio";

describe("medallaPuesto (color por puesto del podio)", () => {
  it("1 -> oro, 2 -> plata, 3 -> bronce", () => {
    expect(medallaPuesto(1)).toBe("rank");
    expect(medallaPuesto(2)).toBe("silver");
    expect(medallaPuesto(3)).toBe("bronze");
  });

  it("fuera del podio (4+, 0, no entero) no lleva medalla", () => {
    // El oro NUNCA es decorativo: si el 4 pudiera llevarlo, dejaría de significar "primero".
    expect(medallaPuesto(4)).toBeNull();
    expect(medallaPuesto(0)).toBeNull();
    expect(medallaPuesto(-1)).toBeNull();
    expect(medallaPuesto(1.5)).toBeNull();
  });
});

describe("el podio pinta SOLO las posiciones que existen", () => {
  it("sin nadie no hay podio", () => {
    // El llamante pinta el vacío honesto; el podio no inventa un pedestal para nadie.
    expect(ordenVisualPodio(0)).toEqual([]);
    expect(cuantosEnPodio(0)).toBe(0);
  });

  it("con UNA persona hay UNA posición, no una con dos huecos al lado", () => {
    // Este es el caso del día del lanzamiento: cierra el primer reto y hay exactamente un ganador.
    // La versión anterior exigía tres y devolvía null, así que esa persona no salía por ningún lado.
    expect(ordenVisualPodio(1)).toEqual([1]);
    expect(cuantosEnPodio(1)).toBe(1);
  });

  it("con DOS personas hay dos, y el 1º sigue a la derecha del 2º", () => {
    expect(ordenVisualPodio(2)).toEqual([2, 1]);
    expect(cuantosEnPodio(2)).toBe(2);
  });

  it("con tres o más, el podio clásico: 2 · 1 · 3", () => {
    // El orden VISUAL no es el de clasificación: el primero va al CENTRO.
    expect(ordenVisualPodio(3)).toEqual([2, 1, 3]);
    expect(ordenVisualPodio(50)).toEqual([2, 1, 3]);
    expect(cuantosEnPodio(50)).toBe(PODIO_MAX);
  });

  it("nunca devuelve un puesto sin persona detrás", () => {
    for (let n = 0; n <= 5; n += 1) {
      const visual = ordenVisualPodio(n);
      expect(visual.length).toBe(Math.min(n, PODIO_MAX));
      // Cada puesto pintado tiene que caber dentro de los que hay: un [2,1,3] con 2 personas
      // significaría un pedestal de bronce vacío, que es dato falso disfrazado de hueco.
      for (const p of visual) expect(p).toBeLessThanOrEqual(n);
    }
  });

  it("es total: un número raro no la rompe", () => {
    expect(ordenVisualPodio(-3)).toEqual([]);
    expect(ordenVisualPodio(2.7)).toEqual([2, 1]);
  });
});

describe("dónde empieza la lista de debajo", () => {
  it("se calcula, no se clava en 4", () => {
    // Con la constante clavada, un ranking de 2 personas dejaría la lista empezando en el 4º y los
    // puestos pintados no cuadrarían con la realidad.
    expect(primerPuestoDeLista(0)).toBe(1);
    expect(primerPuestoDeLista(1)).toBe(2);
    expect(primerPuestoDeLista(2)).toBe(3);
    expect(primerPuestoDeLista(3)).toBe(4);
    expect(primerPuestoDeLista(100)).toBe(4);
  });
});
