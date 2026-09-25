/**
 * EL FEED DIBUJA EL AVATAR DEL DUEÑO, CON SU NIVEL.
 *
 * Es la superficie donde más gente ve a más gente, y era justo la que no lo pintaba: el post traía el
 * nombre pero no la foto ni los puntos, así que el avatar sencillamente no existía ahí. "El nivel se
 * ve en toda la plataforma" fallaba por el sitio que más importa.
 *
 * Para romperlo: quitar el avatar del feed (rojo), o dejar de pasarle los puntos (rojo).
 */
import { act, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/reproductor-hls", () => ({
  ReproductorHls: () => <div data-testid="video" />,
}));
vi.mock("@/components/ui/boton-voto", () => ({
  BotonVoto: () => <button type="button">Vota</button>,
}));
vi.mock("@/components/feed/comentarios-video", () => ({
  ComentariosVideo: () => <div data-testid="comentarios" />,
}));

import { FeedVertical } from "@/components/feed/feed-vertical";
import type { PostFeed } from "@/server/services/feed";

const post = (puntos: number): PostFeed => ({
  id: "v1",
  displayName: null,
  username: "yuyu",
  imagen: null,
  puntos,
  retoTitulo: "Reto",
  categoria: null,
  votos: 0,
  comentarios: 0,
  src: "s",
  poster: "p",
  participacionId: null,
  retoId: null,
  retoAbierto: false,
  miVoto: null,
  esMio: false,
});

beforeAll(() => {
  class IO {
    observe(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});

async function montar(puntos: number) {
  let raiz!: HTMLElement;
  await act(async () => {
    const { container } = render(
      <FeedVertical
        postsIniciales={[post(puntos)]}
        cursorInicial={null}
        haySesion={false}
        emailVerificado={false}
      />,
    );
    raiz = container;
  });
  return raiz;
}

describe("el avatar del dueño del vídeo", () => {
  it("se dibuja, con el anillo de su nivel", async () => {
    const c = await montar(600);
    const circulos = [...c.querySelectorAll("[data-nivel]")];
    expect(circulos.length, "el feed no pinta ningún avatar con nivel").toBeGreaterThan(0);
    for (const n of circulos) expect(n.getAttribute("data-nivel")).toBe("pro");
    // Y el nivel se anuncia para quien no ve el color.
    expect(screen.getAllByLabelText("Nivel Pro").length).toBeGreaterThan(0);
  });

  it("un Rookie sale sin anillo, pero el avatar SIGUE estando", async () => {
    const c = await montar(0);
    expect(c.querySelector("[data-nivel]")).toBeNull();
    // El círculo del avatar se reconoce por su clase: sin él, el feed volvería a no tener autor.
    expect(c.querySelectorAll(".rounded-full").length).toBeGreaterThan(0);
  });
});
