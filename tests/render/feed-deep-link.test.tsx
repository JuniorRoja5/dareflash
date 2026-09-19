/**
 * EL FEED AL LLEGAR POR EL ENLACE DE UN AVISO. La página ya pone el vídeo del comentario el primero;
 * lo que se fija aquí es lo que el feed hace con eso:
 *
 *  - en MÓVIL abre la HOJA de comentarios de ese vídeo (si no, el usuario aterriza en el vídeo correcto
 *    sin ver el comentario del que hablaba el aviso);
 *  - y le pasa el ANCLA, que es lo que resalta el comentario;
 *  - sin enlace, nada se abre solo.
 *
 * El reproductor y el botón de voto se sustituyen por dobles: esto no va de vídeo, y montar hls.js en
 * jsdom es puro coste. `matchMedia` del setup responde `matches: false` -> móvil.
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
  // Doble que solo declara CON QUÉ lo han montado: el ancla es justo lo que se quiere comprobar.
  ComentariosVideo: ({ videoId, anclaId }: { videoId: string; anclaId?: string }) => (
    <div data-testid="comentarios" data-video={videoId} data-ancla={anclaId ?? ""} />
  ),
}));

import { FeedVertical } from "@/components/feed/feed-vertical";
import type { PostFeed } from "@/server/services/feed";

const post = (id: string): PostFeed => ({
  id,
  displayName: null,
  username: `autor_${id}`,
  retoTitulo: "Reto",
  categoria: null,
  votos: 0,
  comentarios: 3,
  src: "s",
  poster: "p",
  participacionId: null,
  retoId: null,
  retoAbierto: false,
  miVoto: null,
});

beforeAll(() => {
  // jsdom no trae IntersectionObserver y el feed lo usa para saber qué vídeo está activo.
  class IO {
    observe(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
});

async function montar(comentarioDestacado?: string) {
  await act(async () => {
    render(
      <FeedVertical
        postsIniciales={[post("v9"), post("v1")]}
        cursorInicial={null}
        haySesion
        comentarioDestacado={comentarioDestacado}
      />,
    );
  });
}

describe("feed + deep-link del aviso", () => {
  it("en móvil abre la hoja del vídeo del enlace, con el ancla puesta", async () => {
    await montar("c9");

    const hoja = screen.getByRole("dialog", { name: "Comentarios" });
    const comentarios = hoja.querySelector("[data-testid='comentarios']");
    expect(comentarios?.getAttribute("data-video")).toBe("v9");
    expect(comentarios?.getAttribute("data-ancla")).toBe("c9");
  });

  it("sin enlace no se abre nada solo", async () => {
    await montar();

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("el aviso honesto se ve y se puede cerrar", async () => {
    await act(async () => {
      render(
        <FeedVertical
          postsIniciales={[post("v1")]}
          cursorInicial={null}
          aviso="Ese vídeo ya no está disponible."
        />,
      );
    });

    expect(screen.getByRole("status").textContent).toContain("Ese vídeo ya no está disponible.");
    await act(async () => {
      screen.getByRole("button", { name: "Cerrar aviso" }).click();
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
