/**
 * EL RETO EXCLUSIVO, PINTADO (Fase 8 · P7).
 *
 * La propiedad que manda es la misma que en la identidad: **un reto NORMAL sale EXACTO como antes**.
 * El marco dorado es caro de ver y la inmensa mayoría de los retos no son exclusivos, así que
 * cualquier resto —un envoltorio con las clases vacías, un `div` de más— sería una maqueta movida
 * para todos ellos a cambio de nada. Por eso aquí no se comprueba "no se ve el marco": se comprueba
 * que el nodo es EL MISMO.
 *
 * Y el CTA: al no-VIP se le ofrece una salida (ir a /vip), no un botón muerto; al VIP, participar.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { BotonParticipar } from "@/app/(app)/(shell)/retos/[codigo]/participar";
import { TarjetaReto } from "@/app/(app)/(shell)/retos/tarjeta-reto";
import { CTA_RETO_SOLO_VIP } from "@/config/constants";
import type { RetoPublicoVista } from "@/server/services/retos-publico";

afterEach(cleanup);

const BASE: RetoPublicoVista = {
  publicCode: "abc12345",
  slug: "reto-de-prueba",
  titulo: "Reto de prueba",
  categoria: "fitness",
  premioCents: 50_000,
  deadlineMs: Date.now() + 86_400_000,
  coverImage: null,
  soloVip: false,
};

const pintar = (over: Partial<RetoPublicoVista> = {}) =>
  render(<TarjetaReto reto={{ ...BASE, ...over }} />).container;

const marco = (c: HTMLElement) => c.querySelector("[data-reto-exclusivo]");
const chapa = (c: HTMLElement) => c.querySelector("[data-reto-chapa-vip]");

describe("un reto NORMAL queda como estaba", () => {
  it("ni marco, ni chapa, ni envoltorio", () => {
    const c = pintar();
    expect(marco(c), "el reto normal recibe el marco dorado").toBeNull();
    expect(chapa(c)).toBeNull();
    // El nodo raíz sigue siendo el `<article>` de siempre, directo: sin un nivel de más.
    expect(c.firstElementChild?.tagName).toBe("ARTICLE");
    expect(c.querySelector(".df-reto-exclusivo-borde")).toBeNull();
    expect(c.innerHTML, "se ha colado el oro del VIP").not.toContain("--vip-gold");
  });

  it("y la tarjeta conserva su superficie translúcida", () => {
    const art = pintar().firstElementChild!;
    expect(art.className).toContain("bg-surface/60");
    expect(art.className).toContain("border-line");
  });
});

describe("un reto EXCLUSIVO lleva marco y chapa", () => {
  it("las tres capas del marco, con la tarjeta opaca dentro", () => {
    const c = pintar({ soloVip: true });
    const m = marco(c)!;
    expect(m, "no hay marco").not.toBeNull();
    expect(m.className).toContain("df-reto-exclusivo");
    // Anidadas y en este orden: el bloom desborda fuera, el borde recorta dentro, la cara tapa.
    expect(m.querySelector(".df-reto-exclusivo-borde > .df-reto-exclusivo-cara")).not.toBeNull();
  });

  it("la chapa dice EXCLUSIVO y lleva la marca VIP de verdad dentro", () => {
    const c = pintar({ soloVip: true });
    const ch = chapa(c)!;
    expect(ch).not.toBeNull();
    expect(ch.textContent).toContain("EXCLUSIVO");
    // La MISMA pieza que marca a una persona VIP, sin un dibujo propio que mantener aparte.
    expect(ch.querySelector("[data-marca-vip]")?.textContent).toBe("VIP");
  });

  it("y el premio NO se pinta en oro: el dinero es dinero en todas las pantallas", () => {
    // Medido: en claro `--vip-gold` y `--df-money` están a ΔE 4,6 —indistinguibles— y en oscuro el
    // oro queda a ΔE 6,4 del oro del PODIO. El exclusivo lo marcan el marco y la chapa.
    const c = pintar({ soloVip: true });
    const importe = c.querySelector(".text-money");
    expect(importe, "el importe dejó de usar el token del dinero").not.toBeNull();
    expect(importe!.getAttribute("style") ?? "").not.toContain("--vip-gold");
  });

  it("la tarjeta opaca NO arrastra la superficie translúcida (se vería el cónico debajo)", () => {
    const cara = pintar({ soloVip: true }).querySelector(".df-reto-exclusivo-cara")!;
    expect(cara.className).not.toContain("bg-surface/60");
  });
});

describe("el CTA del detalle", () => {
  const props = {
    challengeId: "c1",
    publicCode: "abc12345",
    slug: "reto-de-prueba",
    autenticado: true,
    activo: true,
  };

  it("no-VIP en un reto exclusivo: una SALIDA a /vip, no un botón muerto", () => {
    render(<BotonParticipar {...props} vetoVip />);
    const cta = screen.getByRole("link", { name: CTA_RETO_SOLO_VIP });
    expect(cta.getAttribute("href")).toBe("/vip");
    // En oro, y con su tinta: el par compartido (`RELLENO_VIP`).
    const estilo = cta.getAttribute("style") ?? "";
    expect(estilo).toMatch(/(^|;\s*)background-color: var\(--vip-gold\)/);
    expect(estilo).toContain("var(--vip-tinta)");
    expect(estilo).not.toContain("--df-action");
    expect(cta.className, "el CTA del VIP lleva el relleno de acción").not.toContain("bg-action");
  });

  it("VIP en el mismo reto: el botón de siempre", () => {
    render(<BotonParticipar {...props} vetoVip={false} />);
    expect(screen.getByRole("button", { name: "Participar" })).toBeTruthy();
    expect(screen.queryByText(CTA_RETO_SOLO_VIP)).toBeNull();
  });

  it("y si además falta NIVEL, manda el nivel: no se vende contra una pared", () => {
    render(<BotonParticipar {...props} vetoVip avisoNivel="Necesitas ser Pro para participar." />);
    expect(screen.getByRole("button", { name: "Nivel insuficiente" })).toBeTruthy();
    expect(
      screen.queryByText(CTA_RETO_SOLO_VIP),
      "se ofrece pagar con otra pared detrás",
    ).toBeNull();
  });

  it("un reto CERRADO no ofrece nada, ni siquiera suscribirse", () => {
    render(<BotonParticipar {...props} activo={false} vetoVip />);
    expect(screen.getByRole("button", { name: "Reto cerrado" })).toBeTruthy();
    expect(screen.queryByText(CTA_RETO_SOLO_VIP)).toBeNull();
  });
});
