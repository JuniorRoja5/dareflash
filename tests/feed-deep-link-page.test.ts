/**
 * LA PÁGINA DEL FEED ANTE EL ENLACE DEL AVISO (`/feed?video=…&comentario=…`).
 *
 * Lo que fija, mirando lo que la página le pasa al feed:
 *  - el vídeo pedido va el PRIMERO, aunque no estuviera en la primera página;
 *  - y no se repite más abajo si la primera página ya lo traía;
 *  - si ya no se ve, NO se finge: feed normal, aviso honesto y sin ancla;
 *  - sin parámetros, la página es exactamente la de antes (ni consulta el vídeo suelto).
 *
 * Para romperlo: no poner el vídeo delante (rojo), quitar el filtro del duplicado (rojo), pasar el
 * comentario destacado aunque el vídeo no exista (rojo), callar el aviso (rojo).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostFeed } from "../src/server/services/feed";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  feedPublicado: vi.fn(),
  videoParaFeed: vi.fn(),
}));

vi.mock("@/server/db/client", () => ({ prisma: {} }));
// Los textos de la página (Fase 11 · P5b1): `textos()` lee el idioma de la petición, que aquí no hay.
vi.mock("@/textos/servidor", async () => {
  const { es } = await import("../src/textos/es");
  const { crearT } = await import("../src/textos/plantilla");
  const corte = (ns: readonly (keyof typeof es)[]) => Object.fromEntries(ns.map((n) => [n, es[n]]));
  return {
    textos: async (n: keyof typeof es) => crearT(es[n] as never, "es"),
    textosClienteDeLaPeticion: async (ns: readonly (keyof typeof es)[]) => corte(ns),
  };
});
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/services/feed", () => ({
  feedPublicado: mocks.feedPublicado,
  videoParaFeed: mocks.videoParaFeed,
}));
vi.mock("@/server/services/reproduccion-servidor", () => ({
  firmarReproduccion: () => ({ src: "s", poster: "p" }),
}));

import FeedPage from "../src/app/(app)/feed/page";

const post = (id: string): PostFeed => ({
  id,
  displayName: null,
  imagen: null,
  puntos: 0,
  username: `autor_${id}`,
  retoTitulo: "t",
  categoria: null,
  votos: 0,
  comentarios: 0,
  likes: 0,
  miLike: false,
  src: "s",
  poster: "p",
  participacionId: null,
  retoId: null,
  retoAbierto: false,
  miVoto: null,
  esMio: false,
  autorDestacado: false,
  autorVip: false,
  colorNombre: null,
});

/** Las props con las que la página monta el feed (el elemento, sin renderizarlo). */
async function propsDelFeed(query: Record<string, string | string[] | undefined>) {
  type PropsFeed = {
    postsIniciales?: PostFeed[];
    cursorInicial?: string | null;
    comentarioDestacado?: string;
    aviso?: string;
  };
  const el = (await FeedPage({ searchParams: Promise.resolve(query) })) as {
    props: PropsFeed & { children?: { props: PropsFeed } };
  };
  // Desde la P5b1 el feed va dentro de su `TextosProvider` (los textos de su isla de cliente): las props
  // del feed son las del hijo. El estado vacío (sin vídeos) no lleva proveedor.
  return el.props.children?.props ?? el.props;
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue({ userId: "u-1" });
  mocks.feedPublicado.mockResolvedValue({ items: [post("v1"), post("v2")], nextCursor: "cur-1" });
  mocks.videoParaFeed.mockResolvedValue(post("v9"));
});

describe("/feed?video=…&comentario=…", () => {
  it("abre POR el vídeo del enlace: va el primero, con su comentario destacado", async () => {
    const props = await propsDelFeed({ video: "v9", comentario: "c9" });

    expect(props.postsIniciales?.map((p) => p.id)).toEqual(["v9", "v1", "v2"]);
    expect(props.comentarioDestacado).toBe("c9");
    expect(props.cursorInicial).toBe("cur-1");
    expect(props.aviso).toBeUndefined();
    expect(mocks.videoParaFeed).toHaveBeenCalledWith(
      expect.anything(),
      "v9",
      expect.objectContaining({ userId: "u-1" }),
    );
  });

  it("si la primera página ya lo traía, no sale dos veces", async () => {
    mocks.videoParaFeed.mockResolvedValue(post("v2"));

    const props = await propsDelFeed({ video: "v2", comentario: "c9" });

    expect(props.postsIniciales?.map((p) => p.id)).toEqual(["v2", "v1"]);
  });

  it("vídeo que ya no se ve: feed normal, aviso honesto y sin ancla", async () => {
    mocks.videoParaFeed.mockResolvedValue(null);

    const props = await propsDelFeed({ video: "fantasma", comentario: "c9" });

    expect(props.postsIniciales?.map((p) => p.id)).toEqual(["v1", "v2"]);
    expect(props.aviso).toBe("Ese vídeo ya no está disponible.");
    expect(props.comentarioDestacado).toBeUndefined();
  });

  it("sin parámetros (o con uno repetido, que no es una petición legítima) no se consulta nada extra", async () => {
    expect((await propsDelFeed({})).comentarioDestacado).toBeUndefined();
    expect((await propsDelFeed({ video: ["a", "b"] })).aviso).toBeUndefined();
    expect(mocks.videoParaFeed).not.toHaveBeenCalled();
  });
});
