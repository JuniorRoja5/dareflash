/**
 * EL HALO DE UNA TARJETA DESTACADA ES EL NIVEL DE SU DUEÑO — render real.
 *
 * Era el verde de marca para todo el mundo (`--df-halo-color: var(--df-action)` escrito a pelo), así
 * que cuarenta caras salían con la misma luz. Un halo que vale lo mismo para todos no informa de
 * nada: es decoración repetida cuarenta veces, y encima choca con el aro del avatar, que SÍ decía
 * el nivel. La tarjeta se contradecía a sí misma.
 *
 * Lo que se fija aquí, y que no se puede ver leyendo el fuente:
 *  - dos personas de nivel distinto reciben COLORES distintos, y cada uno es el token de SU nivel;
 *  - Rookie no lleva halo (como no lleva aro): es el estándar, no una insignia;
 *  - el color sale de un token `--df-nivel-*`, nunca de un hex ni de `--df-action`;
 *  - y el halo no se cuela sin su clase de movimiento, que es lo que `prefers-reduced-motion` apaga.
 *
 * Para romperlo a propósito: volver a forzar `var(--df-action)` (rojo), darle halo a Rookie (rojo),
 * o pintar el halo con un hex (rojo).
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { TarjetaDestacado } from "@/components/ui/tarjeta-destacado";
import { NIVELES, nivelPorPuntos } from "@/lib/niveles";

/** Unos puntos que caen dentro de cada nivel, derivados del catálogo y no inventados. */
const PUNTOS_DE = (clave: string): number => {
  const i = NIVELES.findIndex((n) => n.clave === clave);
  expect(i, `no existe el nivel ${clave}`).toBeGreaterThan(-1);
  const nivel = NIVELES[i]!;
  const siguiente = NIVELES[i + 1];
  // El centro del tramo, derivado del catálogo: así un cambio de umbrales no deja estos casos
  // apuntando al nivel de al lado sin que nadie se entere.
  return siguiente ? Math.floor((nivel.minimo + siguiente.minimo) / 2) : nivel.minimo + 1000;
};

function montar(puntos: number) {
  const { container } = render(
    <TarjetaDestacado username="marta" displayName="Marta" imagen={null} puntos={puntos} />,
  );
  return container.querySelector("a")!;
}

const halo = (el: Element): string | null => {
  const m = /--df-halo-color:\s*([^;"]+)/.exec(el.getAttribute("style") ?? "");
  return m ? m[1]!.trim() : null;
};

describe("el halo dice el NIVEL, no la marca", () => {
  it("los puntos de prueba caen en el nivel que dicen (si no, todo lo demás miente)", () => {
    // Se me fue a la primera: el helper leía un campo que no existe, devolvía NaN y TODAS las
    // tarjetas salían Rookie — con lo cual los casos de abajo fallaban por el motivo equivocado.
    for (const n of NIVELES) {
      expect(
        nivelPorPuntos(PUNTOS_DE(n.clave)).clave,
        `${n.clave} con ${PUNTOS_DE(n.clave)} pts`,
      ).toBe(n.clave);
    }
  });

  for (const nivel of NIVELES.filter((n) => n.emblema !== null)) {
    it(`${nivel.clave}: el halo es ${nivel.tokenColor}`, () => {
      const tarjeta = montar(PUNTOS_DE(nivel.clave));
      expect(halo(tarjeta)).toBe(`var(${nivel.tokenColor})`);
      expect(tarjeta.querySelector(".df-halo"), "no pintó el halo").toBeTruthy();
    });
  }

  it("Rookie no lleva halo, igual que no lleva aro", () => {
    const tarjeta = montar(PUNTOS_DE("rookie"));
    expect(halo(tarjeta), "Rookie recibió un color de halo").toBeNull();
    expect(tarjeta.querySelector(".df-halo"), "Rookie salió con halo").toBeNull();
  });

  it("dos niveles distintos NO comparten color (que era justo el fallo)", () => {
    const colores = NIVELES.filter((n) => n.emblema !== null).map((n) =>
      halo(montar(PUNTOS_DE(n.clave))),
    );
    expect(new Set(colores).size, "dos niveles pintan el mismo halo").toBe(colores.length);
  });

  it("y ninguno es el acento de marca ni un hex", () => {
    for (const n of NIVELES.filter((x) => x.emblema !== null)) {
      const c = halo(montar(PUNTOS_DE(n.clave)))!;
      expect(c, "el halo volvió al verde de marca").not.toContain("--df-action");
      expect(c, "el halo lleva un color a mano").not.toMatch(/#|rgb/i);
      expect(c).toMatch(/^var\(--df-nivel-|^var\(--df-rank\)$/);
    }
  });

  it("el halo late con su clase, que es la que apaga el movimiento reducido", () => {
    const tarjeta = montar(PUNTOS_DE("pro"));
    const luz = tarjeta.querySelector(".df-halo")!;
    expect(luz.className).toContain("df-respira");
  });
});
