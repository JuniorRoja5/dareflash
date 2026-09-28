/**
 * RENDER DEL HERO DE /referidos, EN LOS DOS TEMAS.
 *
 * Como en el de /puntos: jsdom no aplica CSS, así que lo que esto demuestra no es que los colores
 * se vean bien —eso lo miden `paleta-clara` y `paleta-niveles`— sino que el MARKUP no depende del
 * tema: ni un color fijo, todo por token. Y que el QR se dibuja de verdad, que es lo que no se
 * puede afirmar leyendo el fichero.
 *
 * EL QR ES EL ÚNICO SITIO DEL PRODUCTO QUE NO SIGUE AL TEMA, a propósito (lo pide el lector, no el
 * diseño). Aquí se fija esa excepción: si alguien "arregla" la incoherencia poniéndole
 * `--df-surface`, en oscuro saldría un QR invertido que algunos teléfonos no leen.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HeroInvitacion } from "@/app/(app)/(shell)/referidos/hero-invitacion";
import { POINTS } from "@/config/constants";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

const ENLACE = "https://dareflash.test/entrar?ref=abc123xyz";
const CODIGO = "abc123xyz";

/** Todas las declaraciones de estilo inline del árbol. */
const declaraciones = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>("[style]")].flatMap((el) =>
    (el.getAttribute("style") ?? "")
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean),
  );

describe.each(["dark", "light"] as const)("tema %s", (tema) => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-theme", tema);
  });

  it("dice la recompensa con el importe del catálogo, no con un número a mano", () => {
    const c = render(<HeroInvitacion enlace={ENLACE} codigo={CODIGO} />).container;
    expect(c.textContent).toContain(`${POINTS.INVITE_FRIEND} puntos`);
  });

  it("enseña el enlace y el código en campos separados, cada uno con su botón", () => {
    const c = render(<HeroInvitacion enlace={ENLACE} codigo={CODIGO} />).container;
    const campos = [...c.querySelectorAll<HTMLInputElement>('input[type="text"]')];
    expect(campos.map((i) => i.value)).toEqual([ENLACE, CODIGO]);
    expect(c.querySelectorAll("button")).toHaveLength(2);
  });

  it("y solo UNO de los dos botones es la acción principal", () => {
    // `--df-action` es uno por pantalla: el enlace es lo que se comparte, el código es el plan B.
    const c = render(<HeroInvitacion enlace={ENLACE} codigo={CODIGO} />).container;
    const principales = [...c.querySelectorAll("button")].filter((b) =>
      b.className.includes("bg-action"),
    );
    expect(principales).toHaveLength(1);
  });

  it("pinta el QR del enlace, con módulos de verdad", () => {
    const c = render(<HeroInvitacion enlace={ENLACE} codigo={CODIGO} />).container;
    const svg = c.querySelector('svg[role="img"]');
    expect(svg, "no hay QR").not.toBeNull();
    const d = svg!.querySelector("path")?.getAttribute("d") ?? "";
    // Un QR de este tamaño son cientos de trozos; una plantilla vacía o un cuadrado no.
    expect(d.length, "el QR no tiene módulos").toBeGreaterThan(200);
    expect(svg!.getAttribute("aria-label")).toMatch(/invitación/i);
  });

  it("el QR NO sigue al tema: placa clara y tinta oscura en los dos", () => {
    const c = render(<HeroInvitacion enlace={ENLACE} codigo={CODIGO} />).container;
    const svg = c.querySelector('svg[role="img"]')!;
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("var(--df-qr-fondo)");
    expect(svg.querySelector("path")?.getAttribute("fill")).toBe("var(--df-qr-tinta)");
    // Y no se le cuela una superficie que sí cambiaría con el tema.
    expect(svg.innerHTML).not.toContain("--df-surface");
  });

  it("lleva el halo del acento, como el hero de /puntos lleva el de su nivel", () => {
    const c = render(<HeroInvitacion enlace={ENLACE} codigo={CODIGO} />).container;
    expect(c.querySelector(".df-halo")).not.toBeNull();
    expect(c.querySelector("section")?.getAttribute("style")).toContain(
      "--df-halo-color: var(--df-action)",
    );
  });

  it("no fija ni un color: todo sale de un token", () => {
    const c = render(<HeroInvitacion enlace={ENLACE} codigo={CODIGO} />).container;
    const decls = declaraciones(c);
    expect(decls.length).toBeGreaterThan(0);
    for (const d of decls) {
      expect(/#[0-9a-fA-F]{3,8}\b/.test(d), d).toBe(false);
      expect(/\b(rgba?|hsla?)\s*\(/.test(d), d).toBe(false);
      for (const uso of d.match(/var\(\s*--[\w-]+/g) ?? []) {
        expect(uso, uso).toMatch(/var\(\s*(--df-|--font-)/);
      }
    }
  });

  it("sin enlace no finge: lo dice y dice qué hacer, y no pinta un QR vacío", () => {
    const c = render(<HeroInvitacion enlace={null} codigo={null} />).container;
    expect(c.textContent).toMatch(/Recarga la página/);
    expect(
      c.querySelector('svg[role="img"]'),
      "un QR sin enlace no lleva a ningún sitio",
    ).toBeNull();
    expect(c.querySelectorAll("input")).toHaveLength(0);
  });
});
