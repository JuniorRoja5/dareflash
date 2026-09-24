/**
 * EL NIVEL EN EL AVATAR — render real.
 *
 * Lo que se fija:
 *  - el nivel se DERIVA de los puntos con `nivelPorPuntos`, la misma función que la insignia de texto:
 *    un solo origen, no dos derivaciones que puedan discrepar en una frontera;
 *  - las FRONTERAS son las de la escalera (99 -> Rookie sin marca, 100 -> Challenger con la suya);
 *  - el emblema es un SVG NUESTRO, no un emoji: un emoji lo dibuja cada sistema a su manera;
 *  - SIN puntos, el avatar se pinta EXACTAMENTE como antes: ni emblema, ni envoltorio;
 *  - el nivel se ANUNCIA a lectores de pantalla. En un comentario o en el feed el emblema es lo ÚNICO
 *    que lo comunica; sin el `aria-label`, ahí no existiría.
 *
 * Para romperlo: dejar el emblema fijo en vez de por nivel (rojo en las fronteras), derivarlo con un
 * `if` propio en vez de `nivelPorPuntos` (rojo), poner un emoji (rojo), o pintárselo a Rookie (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Avatar } from "@/components/ui/avatar";
import { NIVELES, nivelPorPuntos } from "@/lib/niveles";

afterEach(cleanup);

function pintar(props: { puntos?: number }) {
  const { container } = render(<Avatar nombre="Yuyu" {...props} />);
  const svg = container.querySelector("svg");
  return {
    container,
    etiqueta: svg?.getAttribute("aria-label") ?? null,
    color: svg?.getAttribute("style") ?? "",
    formas: [...(svg?.querySelectorAll("path") ?? [])].map((p) => p.getAttribute("d")).join("|"),
  };
}

describe("el emblema sale del nivel, y el nivel de los puntos", () => {
  it("600 puntos son Pro, con su emblema y su color", () => {
    const { etiqueta, color } = pintar({ puntos: 600 });
    expect(etiqueta).toBe("Nivel Pro");
    expect(color).toContain("--df-nivel-pro");
  });

  it("las fronteras: 99 es Rookie y NO lleva marca; 100 ya es Challenger y sí", () => {
    expect(pintar({ puntos: 99 }).etiqueta).toBeNull();
    expect(pintar({ puntos: 100 }).etiqueta).toBe("Nivel Challenger");
    expect(pintar({ puntos: 9_999 }).etiqueta).toBe("Nivel Elite");
    expect(pintar({ puntos: 10_000 }).etiqueta).toBe("Nivel Legend");
  });

  it("UN SOLO ORIGEN: lo que anuncia el avatar es lo que dice `nivelPorPuntos`", () => {
    for (const puntos of [0, 99, 100, 499, 500, 1_999, 2_000, 9_999, 10_000, 250_000]) {
      const nivel = nivelPorPuntos(puntos);
      const esperado = nivel.emblema ? `Nivel ${nivel.nombre}` : null;
      expect(pintar({ puntos }).etiqueta, String(puntos)).toBe(esperado);
    }
  });

  it("cada nivel con emblema pinta una FORMA distinta (si no, el nivel no se leería)", () => {
    const conEmblema = NIVELES.filter((n) => n.emblema);
    const formas = conEmblema.map((n) => pintar({ puntos: n.minimo }).formas);
    for (const f of formas) expect(f.length).toBeGreaterThan(0);
    expect(new Set(formas).size).toBe(conEmblema.length);
    // Y cada uno con SU token de color, no todos con el mismo.
    const colores = conEmblema.map((n) => pintar({ puntos: n.minimo }).color);
    expect(new Set(colores).size).toBe(conEmblema.length);
  });
});

describe("son glifos nuestros, no emoji", () => {
  it("el componente del emblema no contiene un solo carácter de emoji", () => {
    const fuente = readFileSync(
      path.resolve(__dirname, "..", "..", "src", "components", "ui", "emblema-nivel.tsx"),
      "utf8",
    );
    // Rangos de pictogramas y símbolos. Un emoji aquí significaría que el nivel se ve distinto en
    // cada dispositivo — y el brief los prohíbe como iconos.
    expect(fuente).not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u,
    );
    expect(fuente).toContain("<svg");
  });

  it("lo que se pinta en el DOM es un SVG con trazos, no texto", () => {
    const { container } = render(<Avatar nombre="Yuyu" puntos={10_000} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    // El color lo pone el token, no un valor escrito a mano en el componente.
    expect(svg.getAttribute("style")).toMatch(/var\(--df-[a-z-]+\)/);
  });
});

describe("sin puntos, el avatar es el de siempre", () => {
  it("ni emblema, ni nodo de más", () => {
    const { etiqueta, container } = pintar({});
    expect(etiqueta).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    // El nodo raíz ES el círculo: sin envoltorio. Es lo que garantiza que las pantallas que no pasan
    // puntos (la barra de búsqueda, el menú de cuenta, la previa del perfil) no cambien de maqueta.
    expect(container.firstElementChild?.className).toContain("rounded-full");
  });

  it("un 0 NO es lo mismo que no saberlo: 0 es Rookie, que tampoco lleva marca", () => {
    // Los dos acaban sin emblema, pero por razones distintas, y esa diferencia importa el día que
    // Rookie tenga una: pasar un 0 para salir del paso estaría AFIRMANDO que esa persona es Rookie.
    expect(pintar({ puntos: 0 }).etiqueta).toBeNull();
    expect(pintar({}).etiqueta).toBeNull();
    expect(nivelPorPuntos(0).clave).toBe("rookie");
  });
});
