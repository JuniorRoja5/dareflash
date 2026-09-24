/**
 * EL NIVEL EN EL AVATAR — render real.
 *
 * Lo que se fija:
 *  - el nivel se DERIVA de los puntos con `nivelPorPuntos`, la misma función que la insignia de texto:
 *    un solo origen, no dos derivaciones que puedan discrepar en una frontera;
 *  - las FRONTERAS son las de la escalera (99 -> Rookie, 100 -> Challenger), no unas propias;
 *  - SIN puntos, el avatar se pinta EXACTAMENTE como antes: ni anillo, ni envoltorio, ni texto para
 *    lectores. Es lo que permite que esto no mueva ninguna maqueta de las que ya existían;
 *  - el nivel se ANUNCIA a lectores de pantalla. El anillo es geometría, y en un comentario o en el
 *    feed es lo ÚNICO que comunica el nivel: sin el texto, ahí no existiría.
 *
 * Para romperlo: dejar el anillo fijo en vez de por tier (rojo en las fronteras), derivar el nivel
 * con un `if` propio en vez de `nivelPorPuntos` (rojo en 2000), o quitar el `sr-only` (rojo).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Avatar } from "@/components/ui/avatar";
import { NIVELES, nivelPorPuntos } from "@/lib/niveles";

afterEach(cleanup);

/** El nodo que lleva el anillo (el círculo), y el texto que se anuncia. */
function pintar(props: { puntos?: number }) {
  const { container } = render(<Avatar nombre="Yuyu" {...props} />);
  const circulo = container.querySelector("span.rounded-full") as HTMLElement | null;
  const lector = container.querySelector(".sr-only")?.textContent ?? null;
  return { container, clases: circulo?.className ?? "", lector };
}

describe("el anillo sale del nivel, y el nivel de los puntos", () => {
  it("600 puntos son Pro, y se dicen", () => {
    const { lector } = pintar({ puntos: 600 });
    expect(lector).toBe("Nivel Pro");
  });

  it("las fronteras son las de la escalera: 99 Rookie, 100 Challenger", () => {
    expect(pintar({ puntos: 99 }).lector).toBe("Nivel Rookie");
    expect(pintar({ puntos: 100 }).lector).toBe("Nivel Challenger");
    // Y arriba del todo, lo mismo: 9999 sigue siendo Elite; 10000 ya es Legend.
    expect(pintar({ puntos: 9_999 }).lector).toBe("Nivel Elite");
    expect(pintar({ puntos: 10_000 }).lector).toBe("Nivel Legend");
  });

  it("UN SOLO ORIGEN: lo que anuncia el avatar es lo que dice `nivelPorPuntos`", () => {
    // Si alguien metiera aquí su propia tabla de umbrales, este recorrido la delataría.
    for (const puntos of [0, 99, 100, 499, 500, 1_999, 2_000, 9_999, 10_000, 250_000]) {
      expect(pintar({ puntos }).lector, String(puntos)).toBe(
        `Nivel ${nivelPorPuntos(puntos).nombre}`,
      );
    }
  });

  it("cada tier pinta un anillo DISTINTO (si fuera fijo, el nivel no se vería)", () => {
    const anillos = NIVELES.map((n) => pintar({ puntos: n.minimo }).clases);
    for (const c of anillos) expect(c).toMatch(/\bring-/);
    expect(new Set(anillos).size).toBe(NIVELES.length);
  });
});

describe("sin puntos, el avatar es el de siempre", () => {
  it("ni anillo, ni texto de nivel, ni un nodo de más", () => {
    const { clases, lector, container } = pintar({});
    expect(lector).toBeNull();
    expect(clases).not.toMatch(/\bring-/);
    // El nodo raíz ES el círculo: sin envoltorio. Es lo que garantiza que las pantallas que no pasan
    // puntos (la barra de búsqueda, el menú de cuenta, la previa del perfil) no cambien de maqueta.
    expect(container.firstElementChild?.className).toContain("rounded-full");
  });

  it("un 0 NO es lo mismo que no saberlo: 0 es Rookie y sí lleva anillo", () => {
    // Si `puntos` fuera obligatorio, las pantallas que no lo cargan pasarían un 0 para salir del paso
    // y estarían afirmando que esa persona es Rookie. Por eso es opcional.
    expect(pintar({ puntos: 0 }).lector).toBe("Nivel Rookie");
    expect(pintar({}).lector).toBeNull();
  });
});
