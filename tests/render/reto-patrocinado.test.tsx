/**
 * EL RETO PATROCINADO, PINTADO (Fase 9 · P1).
 *
 * Tres propiedades, y las tres son del mismo tipo que las del reto exclusivo:
 *  - UN RETO NORMAL SALE EXACTO COMO ANTES: ni marca, ni envoltorio, ni una clase de más.
 *  - LA MARCA SE VE PARA TODO EL MUNDO. No hay rol, no hay sesión, no hay condición: un
 *    patrocinio que solo ve parte del público no es transparencia.
 *  - PATROCINADO Y EXCLUSIVO CONVIVEN. Un reto puede ser las dos cosas y los dos distintivos
 *    tienen que leerse a la vez, sin pisarse: van en contenedores distintos de la portada.
 *
 * Y lo que NUNCA se pinta: la comisión. No está en el DTO —así que la vista no podría enseñarla
 * aunque quisiera— y aquí se comprueba que no aparece por ningún otro camino.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { TarjetaReto } from "@/app/(app)/(shell)/retos/tarjeta-reto";
import { ETIQUETA_PATROCINADO } from "@/config/constants";
import type { RetoPublicoVista } from "@/server/services/retos-publico";

afterEach(cleanup);

const BASE: RetoPublicoVista = {
  publicCode: "abc12345",
  slug: "reto-de-prueba",
  titulo: "Reto de prueba",
  categoria: "fitness",
  premioCents: 100_000,
  deadlineMs: Date.now() + 86_400_000,
  coverImage: null,
  soloVip: false,
  sponsor: null,
};

const pintar = (over: Partial<RetoPublicoVista> = {}) =>
  render(<TarjetaReto reto={{ ...BASE, ...over }} />).container;

const marcaSponsor = (c: HTMLElement) => c.querySelector("[data-reto-sponsor]");
const chapaVip = (c: HTMLElement) => c.querySelector("[data-reto-chapa-vip]");

describe("un reto NORMAL no lleva marca de patrocinio", () => {
  it("ni el nodo, ni el texto", () => {
    const c = pintar();
    expect(marcaSponsor(c), "un reto sin marca lleva el distintivo").toBeNull();
    expect(c.textContent).not.toContain(ETIQUETA_PATROCINADO);
  });

  it("y un reto con el flag pero SIN nombre tampoco: no hay media marca", () => {
    // El DTO ya lo resuelve (`sponsor: null` si falta el nombre), y este caso lo fija desde la
    // vista: "Patrocinado por" seguido de un hueco no se pinta nunca.
    const c = pintar({ sponsor: null, soloVip: true });
    expect(marcaSponsor(c)).toBeNull();
  });
});

describe("un reto patrocinado enseña la marca", () => {
  const sponsor = { nombre: "Marca S.A.", logo: null };

  it("con el nombre y la etiqueta", () => {
    const c = pintar({ sponsor });
    const m = marcaSponsor(c)!;
    expect(m).not.toBeNull();
    expect(m.textContent).toContain(ETIQUETA_PATROCINADO);
    expect(m.textContent).toContain("Marca S.A.");
  });

  it("con el logo si lo hay, y SIN recortarlo", () => {
    // `object-cover` recortaría el logo, y un logo recortado es el logo de otra marca.
    const c = pintar({ sponsor: { nombre: "Marca S.A.", logo: "/portadas/x-sponsor.webp?v=1" } });
    const img = marcaSponsor(c)!.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/portadas/x-sponsor.webp?v=1");
    expect(img.className).toContain("object-contain");
    expect(img.className).not.toContain("object-cover");
  });

  it("y sin logo se pinta igual: una marca puede no tener uno", () => {
    const c = pintar({ sponsor });
    expect(marcaSponsor(c)!.querySelector("img")).toBeNull();
    expect(screen.getByText("Marca S.A.")).toBeTruthy();
  });

  it("NUNCA la comisión: no está en el DTO y no sale por ningún otro camino", () => {
    const c = pintar({ sponsor });
    expect(c.textContent).not.toMatch(/comisi[óo]n|25\s*%|%/i);
  });
});

describe("patrocinado y exclusivo conviven", () => {
  it("los dos distintivos se pintan, y en contenedores distintos", () => {
    const c = pintar({ soloVip: true, sponsor: { nombre: "Marca S.A.", logo: null } });

    const vip = chapaVip(c)!;
    const sponsor = marcaSponsor(c)!;
    expect(vip, "falta la chapa del exclusivo").not.toBeNull();
    expect(sponsor, "falta la marca del patrocinio").not.toBeNull();
    // NI UNO DENTRO DEL OTRO: en el mismo contenedor acabarían compitiendo por la misma esquina,
    // que es como la chapa del VIP se montó encima de la categoría en P7.
    expect(vip.contains(sponsor)).toBe(false);
    expect(sponsor.contains(vip)).toBe(false);
  });

  it("y el marco dorado sigue siendo del exclusivo, no del patrocinio", () => {
    // El oro significa VIP. Un reto patrocinado que no sea exclusivo no puede llevarlo.
    const soloPatrocinado = pintar({ sponsor: { nombre: "Marca S.A.", logo: null } });
    expect(soloPatrocinado.querySelector("[data-reto-exclusivo]")).toBeNull();

    const ambos = pintar({ soloVip: true, sponsor: { nombre: "Marca S.A.", logo: null } });
    expect(ambos.querySelector("[data-reto-exclusivo]")).not.toBeNull();
  });
});
