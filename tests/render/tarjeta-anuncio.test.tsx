/**
 * LA TARJETA DE ANUNCIO (Fase 9 · P7, rediseñada como entrada de blog): lo que se fija pintándola.
 *
 *  1. La etiqueta («Publicidad» / «De DareFlash») está en TODAS las variantes —servida, vista previa,
 *     sin imagen (la casa), sin dominio, con la imagen rota, y la diapositiva del feed—, a la vista y
 *     no escondida a los lectores de pantalla. Es la identificación obligatoria de la publicidad.
 *  2. «Visitar» va por `/ir/{id}` (cuenta el clic), en pestaña nueva y `sponsored`, y NO es la acción
 *     verde (`--df-action`): esa es la de DareFlash.
 *  3. La vista previa es el MISMO dibujo, pero sin navegar ni ofrecer «Denunciar».
 *  4. La imagen tiene sus estados: cargando, lista, y un error dicho en su sitio sin descolocar nada.
 *
 * Para romperlo: quitar la etiqueta de la tarjeta (rojo el 1); poner `bg-action` en «Visitar» (rojo
 * el 2); que la vista previa pinte un `<a>` (rojo el 3).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/denunciar", () => ({
  Denunciar: () => <button type="button">Denunciar</button>,
}));

import { PiezaFeed } from "@/components/feed/pieza-feed";
import { TarjetaAnuncio } from "@/components/ui/tarjeta-anuncio";
import type { PiezaEntregada } from "@/server/services/publicidad-entrega";

const campana = (over: Partial<PiezaEntregada> = {}): PiezaEntregada => ({
  tipo: "campana",
  id: "pub1",
  etiqueta: "Publicidad",
  imagen: "/portadas/publicidad-pub1.webp",
  titulo: null,
  texto: "Zapatillas para correr cada mañana",
  cta: "Visitar",
  enlace: "/ir/pub1",
  externo: true,
  dominio: "zapatillasnorte.example",
  ...over,
});
const casa: PiezaEntregada = {
  tipo: "casa",
  id: "casa-global",
  etiqueta: "De DareFlash",
  imagen: null,
  titulo: "Llega a gente de todo el país",
  texto: "Tu marca, entre los vídeos.",
  cta: "Anúnciate aquí",
  enlace: "/empezar/empresa",
  externo: false,
  dominio: null,
};
const DENUNCIA = { haySesion: true, emailVerificado: true };

/** La etiqueta está, se ve y no está escondida a un lector de pantalla. */
function etiquetaALaVista(contenedor: HTMLElement, texto: string) {
  const el = within(contenedor).getByText(texto);
  expect(el.closest("[aria-hidden]"), `«${texto}» escondida`).toBeNull();
  expect(el.className).not.toMatch(/\bsr-only\b|\bhidden\b|\binvisible\b|opacity-0/);
  return el;
}

describe("la etiqueta, en TODAS las variantes", () => {
  const variantes: [string, () => HTMLElement, string][] = [
    [
      "servida",
      () => render(<TarjetaAnuncio pieza={campana()} denuncia={DENUNCIA} />).container,
      "Publicidad",
    ],
    [
      "vista previa",
      () => render(<TarjetaAnuncio pieza={campana()} previa />).container,
      "Publicidad",
    ],
    [
      "sin dominio",
      () => render(<TarjetaAnuncio pieza={campana({ dominio: null })} />).container,
      "Publicidad",
    ],
    [
      "sin imagen (la casa)",
      () => render(<TarjetaAnuncio pieza={casa} />).container,
      "De DareFlash",
    ],
    [
      "feed",
      () => render(<PiezaFeed pieza={campana()} alRef={() => {}} denuncia={DENUNCIA} />).container,
      "Publicidad",
    ],
    [
      "feed (la casa)",
      () => render(<PiezaFeed pieza={casa} alRef={() => {}} />).container,
      "De DareFlash",
    ],
  ];
  it.each(variantes)("%s", (_, pintar, texto) => {
    etiquetaALaVista(pintar(), texto);
  });

  it("y con la imagen ROTA: aviso en su sitio y la etiqueta sigue", () => {
    const { container } = render(<TarjetaAnuncio pieza={campana()} />);
    const img = container.querySelector("img:not([aria-hidden])")!;
    fireEvent.error(img);
    expect(screen.getByText("La imagen no se ha podido cargar.")).toBeTruthy();
    expect(
      container.querySelector("[data-imagen-anuncio]")?.getAttribute("data-imagen-anuncio"),
    ).toBe("error");
    etiquetaALaVista(container, "Publicidad");
  });
});

describe("«Visitar»", () => {
  it("va por /ir (cuenta el clic), fuera y sponsored; el dominio es TEXTO, no enlace", () => {
    const { container } = render(<TarjetaAnuncio pieza={campana()} denuncia={DENUNCIA} />);
    const enlaces = [...container.querySelectorAll("a")];
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]!.getAttribute("href")).toBe("/ir/pub1");
    expect(enlaces[0]!.getAttribute("target")).toBe("_blank");
    expect(enlaces[0]!.getAttribute("rel")).toContain("sponsored");
    expect(screen.getByText("zapatillasnorte.example").closest("a")).toBeNull();
  });

  it("NO es la acción verde de la pantalla (`--df-action`)", () => {
    const { container } = render(<TarjetaAnuncio pieza={campana()} />);
    const cta = container.querySelector("a")!;
    expect(cta.className).not.toMatch(/action/);
    // Ni nada de la tarjeta usa el acento de acción.
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border|ring)-action\b|df-action/);
  });
});

describe("la vista previa: el mismo dibujo, sin navegar", () => {
  it("«Visitar» no es un enlace y no se ofrece denunciar", () => {
    const { container } = render(<TarjetaAnuncio pieza={campana()} previa denuncia={DENUNCIA} />);
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Visitar")).toBeTruthy();
    expect(screen.queryByText("Denunciar")).toBeNull();
    expect(container.querySelector('[data-tarjeta-anuncio="previa"]')).not.toBeNull();
  });

  it("la servida sí ofrece denunciar; la casa, nunca", () => {
    render(<TarjetaAnuncio pieza={campana()} denuncia={DENUNCIA} />);
    expect(screen.getByText("Denunciar")).toBeTruthy();
    const { container } = render(<TarjetaAnuncio pieza={casa} denuncia={DENUNCIA} />);
    expect(within(container).queryByText("Denunciar")).toBeNull();
  });
});
