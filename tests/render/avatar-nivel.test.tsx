/**
 * EL NIVEL EN EL AVATAR — render real.
 *
 * Lo que se fija:
 *  - EL ANILLO es el requisito, no el glifo: es lo que se ve de lejos. Cada nivel pinta su marco en
 *    SU color (token), con un grosor que depende del tamaño del avatar;
 *  - el nivel se DERIVA de los puntos con `nivelPorPuntos`, la misma función que la insignia de
 *    texto: un solo origen, no dos derivaciones que puedan discrepar en una frontera;
 *  - las FRONTERAS son las de la escalera (99 -> Rookie sin anillo, 100 -> Challenger con el suyo);
 *  - el glifo es un SVG NUESTRO y RELLENO, no un emoji ni un contorno que se pierda sobre una foto;
 *  - SIN puntos, el avatar se pinta EXACTAMENTE como antes: ni anillo, ni envoltorio.
 *
 * Para romperlo: dejar el anillo fijo o del mismo color para todos (rojo), quitarlo y dejar solo el
 * glifo (rojo), derivar el nivel con un `if` propio (rojo), o pintárselo a Rookie (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Avatar } from "@/components/ui/avatar";
import { NIVELES, nivelPorPuntos } from "@/lib/niveles";

afterEach(cleanup);

function pintar(props: { puntos?: number; tamano?: "sm" | "md" | "lg" | "xl" }) {
  const { container } = render(<Avatar nombre="Yuyu" {...props} />);
  const circulo = container.querySelector("[data-nivel]") as HTMLElement | null;
  const svg = container.querySelector("svg");
  return {
    container,
    nivel: circulo?.getAttribute("data-nivel") ?? null,
    anillo: circulo?.style.boxShadow ?? "",
    etiqueta: svg?.getAttribute("aria-label") ?? null,
    formas: [...(svg?.querySelectorAll("path") ?? [])].map((p) => p.getAttribute("d")).join("|"),
  };
}

describe("EL ANILLO: el marco de color, que es lo que se ve de lejos", () => {
  it("600 puntos son Pro: anillo con el token de Pro", () => {
    const { nivel, anillo } = pintar({ puntos: 600 });
    expect(nivel).toBe("pro");
    expect(anillo).toContain("--df-nivel-pro");
  });

  it("cada nivel pinta su PROPIO color, no todos el mismo", () => {
    const conAnillo = NIVELES.filter((n) => n.emblema);
    const anillos = conAnillo.map((n) => pintar({ puntos: n.minimo }).anillo);
    for (const a of anillos) expect(a).not.toBe("");
    expect(new Set(anillos).size).toBe(conAnillo.length);
    // Y cada uno nombra el token de SU nivel.
    for (const [i, n] of conAnillo.entries()) expect(anillos[i]).toContain(n.tokenColor!);
  });

  it("el grosor crece con el tamaño del avatar (un marco fino no se ve en el feed)", () => {
    const anchos = (["sm", "md", "lg", "xl"] as const).map((t) => {
      const a = pintar({ puntos: 600, tamano: t }).anillo;
      return Number(/0 0 0 ([\d.]+)px/.exec(a)?.[1] ?? 0);
    });
    for (const w of anchos) expect(w).toBeGreaterThan(0);
    // Estrictamente creciente: sm < md < lg < xl.
    expect([...anchos].sort((x, y) => x - y)).toEqual(anchos);
    expect(new Set(anchos).size).toBe(anchos.length);
  });

  it("LEGEND lleva doble contorno: el color no puede separarlo del oro del puesto, la forma sí", () => {
    const legend = pintar({ puntos: 10_000 }).anillo;
    const pro = pintar({ puntos: 600 }).anillo;
    // Tres capas (aro, hueco, aro) frente a una sola.
    expect(legend.split("0 0 0").length - 1).toBeGreaterThan(pro.split("0 0 0").length - 1);
    expect(legend).toContain("--df-void");
  });

  it("Rookie NO lleva anillo: es el estándar", () => {
    expect(pintar({ puntos: 0 }).nivel).toBeNull();
    expect(pintar({ puntos: 99 }).nivel).toBeNull();
    expect(pintar({ puntos: 100 }).nivel).toBe("challenger");
  });
});

describe("el glifo acompaña al anillo", () => {
  it("UN SOLO ORIGEN: lo que anuncia el avatar es lo que dice `nivelPorPuntos`", () => {
    for (const puntos of [0, 99, 100, 499, 500, 1_999, 2_000, 9_999, 10_000, 250_000]) {
      const nivel = nivelPorPuntos(puntos);
      expect(pintar({ puntos }).etiqueta, String(puntos)).toBe(
        nivel.emblema ? `Nivel ${nivel.nombre}` : null,
      );
    }
  });

  it("cada nivel con emblema pinta una FORMA distinta", () => {
    const conEmblema = NIVELES.filter((n) => n.emblema);
    const formas = conEmblema.map((n) => pintar({ puntos: n.minimo }).formas);
    expect(new Set(formas).size).toBe(conEmblema.length);
  });

  it("es un SVG RELLENO, no un contorno que se pierda sobre una foto", () => {
    const { container } = render(<Avatar nombre="Yuyu" puntos={10_000} />);
    const svg = container.querySelector("svg")!;
    // Disco del color del nivel + glifo calado: no depende de lo que haya debajo.
    expect(svg.querySelector("circle")?.getAttribute("fill")).toBe("currentColor");
    expect(svg.getAttribute("stroke")).toBeNull();
    expect(svg.querySelector("g")?.getAttribute("fill")).toContain("var(--df-void)");
  });

  it("son glifos nuestros: ni un carácter de emoji en el componente", () => {
    const fuente = readFileSync(
      path.resolve(__dirname, "..", "..", "src", "components", "ui", "emblema-nivel.tsx"),
      "utf8",
    );
    expect(fuente).not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u,
    );
    expect(fuente).toContain("<svg");
  });
});

describe("sin puntos, el avatar es el de siempre", () => {
  it("ni anillo, ni glifo, ni nodo de más", () => {
    const { container, nivel, etiqueta } = pintar({});
    expect(nivel).toBeNull();
    expect(etiqueta).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.firstElementChild?.className).toContain("rounded-full");
  });
});
