/**
 * LOS COMENTARIOS DE UN VÍDEO — render real (jsdom) de la pieza que comparten el panel de escritorio y
 * la hoja de móvil.
 *
 * Lo que se fija: pinta los comentarios REALES que da la API (nada de maqueta), pagina con "Ver más",
 * un invitado lee pero no escribe, publicar y borrar actualizan la lista y el contador con el número
 * del SERVIDOR. Para romperlo: volver a una lista fija (rojo), dejar escribir sin sesión (rojo), sumar
 * el contador en local en vez de usar el del servidor (rojo).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }));

vi.mock("@/lib/cliente-http", async (orig) => ({
  ...(await orig<typeof import("@/lib/cliente-http")>()),
  getJson: mocks.get,
  postJsonCsrf: mocks.post,
  delCsrf: mocks.del,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/feed" }));

import { ComentariosVideo } from "@/components/feed/comentarios-video";
import type { ComentarioVista } from "@/server/services/comentarios";

const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, code: "", data });
const comentario = (id: string, extra: Partial<ComentarioVista> = {}): ComentarioVista => ({
  id,
  texto: `Texto ${id}`,
  creadoMs: Date.now() - 60_000,
  autor: { username: `autor_${id}`, displayName: null, image: null },
  esMio: false,
  ...extra,
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.del.mockReset();
});

async function montar(opciones: { haySesion?: boolean; anclaId?: string } = {}) {
  const onContador = vi.fn();
  await act(async () => {
    render(
      <ComentariosVideo
        videoId="vid-1"
        haySesion={opciones.haySesion ?? true}
        anclaId={opciones.anclaId}
        onContador={onContador}
      />,
    );
  });
  return { onContador };
}
const caja = () => screen.getByLabelText("Escribe un comentario");
const publicarBtn = () => screen.getByRole("button", { name: "Publicar" });

describe("leer", () => {
  it("pinta los comentarios que da la API, con su autor", async () => {
    mocks.get.mockResolvedValueOnce(
      ok({ items: [comentario("c1"), comentario("c2")], nextCursor: null }),
    );
    await montar();
    expect(mocks.get).toHaveBeenCalledWith("/api/videos/vid-1/comentarios");
    expect(screen.getByText("Texto c1")).toBeDefined();
    expect(screen.getByText("@autor_c2")).toBeDefined();
  });

  it("'Ver más' pide la página siguiente por su cursor y la añade", async () => {
    mocks.get
      .mockResolvedValueOnce(ok({ items: [comentario("c1")], nextCursor: "cur-1" }))
      .mockResolvedValueOnce(ok({ items: [comentario("c9")], nextCursor: null }));
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver más comentarios" }));
    });
    expect(mocks.get).toHaveBeenLastCalledWith("/api/videos/vid-1/comentarios?cursor=cur-1");
    expect(screen.getByText("Texto c9")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Ver más comentarios" })).toBeNull();
  });

  it("sin comentarios: vacío honesto, sin 'Próximamente' ni nada inventado", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [], nextCursor: null }));
    await montar();
    expect(screen.getByText(/Aún no hay comentarios/)).toBeDefined();
    expect(document.body.textContent).not.toContain("Próximamente");
  });

  it("un INVITADO lee, pero en vez de la caja ve un enlace a entrar que vuelve aquí", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [comentario("c1")], nextCursor: null }));
    await montar({ haySesion: false });
    expect(screen.queryByLabelText("Escribe un comentario")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Inicia sesión para comentar" }).getAttribute("href"),
    ).toBe("/entrar?siguiente=%2Ffeed");
  });
});

describe("escribir", () => {
  it("'Publicar' exige un texto que valga (la misma regla que el servidor)", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [], nextCursor: null }));
    await montar();
    expect(publicarBtn()).toHaveProperty("disabled", true);
    fireEvent.change(caja(), { target: { value: "    " } });
    expect(publicarBtn()).toHaveProperty("disabled", true);
    fireEvent.change(caja(), { target: { value: "¡Qué nivel!" } });
    expect(publicarBtn()).toHaveProperty("disabled", false);
  });

  it("al publicar, el comentario sale ARRIBA y el contador toma el número del SERVIDOR", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [comentario("c1")], nextCursor: null }));
    const { onContador } = await montar();
    mocks.post.mockResolvedValueOnce(
      ok(
        { comentario: comentario("nuevo", { texto: "¡Qué nivel!", esMio: true }), comentarios: 7 },
        201,
      ),
    );
    fireEvent.change(caja(), { target: { value: "  ¡Qué nivel!  " } });
    await act(async () => {
      fireEvent.click(publicarBtn());
    });

    expect(mocks.post).toHaveBeenCalledWith("/api/videos/vid-1/comentarios", {
      texto: "¡Qué nivel!",
    });
    const lista = screen.getAllByRole("listitem");
    expect(lista[0]!.textContent).toContain("¡Qué nivel!");
    expect(onContador).toHaveBeenCalledWith(7);
    expect((caja() as HTMLTextAreaElement).value).toBe("");
  });

  it("si el servidor lo rechaza, lo dice y no pinta nada nuevo", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [], nextCursor: null }));
    const { onContador } = await montar();
    mocks.post.mockResolvedValueOnce(
      ok({ error: { code: "RATE_LIMITED", message: "Estás comentando muy seguido." } }, 429),
    );
    fireEvent.change(caja(), { target: { value: "Hola" } });
    await act(async () => {
      fireEvent.click(publicarBtn());
    });
    expect(screen.getByRole("alert").textContent).toContain("Estás comentando muy seguido.");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(onContador).not.toHaveBeenCalled();
  });
});

describe("el comentario del aviso (deep-link)", () => {
  /** El ancla se resuelve en un efecto posterior a la carga: hay que dejar correr ese ciclo. */
  const asentar = async () => {
    await act(async () => {});
  };

  it("si cayó en la lista, se marca; y no se pide nada más", async () => {
    mocks.get.mockResolvedValueOnce(
      ok({ items: [comentario("c1"), comentario("c2")], nextCursor: null }),
    );
    await montar({ anclaId: "c2" });
    await asentar();

    const marcados = screen
      .getAllByRole("listitem")
      .filter((li) => li.getAttribute("aria-current") === "true");
    expect(marcados).toHaveLength(1);
    expect(marcados[0]!.textContent).toContain("Texto c2");
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("si NO cayó en la lista, se pide suelto y se fija ARRIBA, marcado y sin repetirse", async () => {
    mocks.get
      .mockResolvedValueOnce(ok({ items: [comentario("c1")], nextCursor: "cur-1" }))
      .mockResolvedValueOnce(ok({ comentario: comentario("viejo"), videoId: "vid-1" }));
    await montar({ anclaId: "viejo" });
    await asentar();

    expect(mocks.get).toHaveBeenLastCalledWith("/api/comentarios/viejo");
    const lista = screen.getAllByRole("listitem");
    expect(lista).toHaveLength(2);
    expect(lista[0]!.textContent).toContain("Texto viejo");
    expect(lista[0]!.getAttribute("aria-current")).toBe("true");
  });

  it("el fijado no se duplica cuando una página posterior acaba trayéndolo", async () => {
    mocks.get
      .mockResolvedValueOnce(ok({ items: [comentario("c1")], nextCursor: "cur-1" }))
      .mockResolvedValueOnce(ok({ comentario: comentario("viejo"), videoId: "vid-1" }))
      .mockResolvedValueOnce(ok({ items: [comentario("viejo")], nextCursor: null }));
    await montar({ anclaId: "viejo" });
    await asentar();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver más comentarios" }));
    });

    expect(screen.getAllByText("Texto viejo")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("si ya no está, lo dice en vez de dejar al usuario buscándolo", async () => {
    mocks.get
      .mockResolvedValueOnce(ok({ items: [comentario("c1")], nextCursor: null }))
      .mockResolvedValueOnce(ok({ error: { code: "NOT_FOUND", message: "x" } }, 404));
    await montar({ anclaId: "fantasma" });
    await asentar();

    expect(screen.getByRole("status").textContent).toContain("Ese comentario ya no está.");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("sin ancla no se marca nada ni se pide nada de más", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [comentario("c1")], nextCursor: null }));
    await montar();
    await asentar();

    expect(screen.getAllByRole("listitem")[0]!.getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});

describe("borrar el propio", () => {
  it("solo en los tuyos; pide confirmación, lo quita y sube el contador del servidor", async () => {
    mocks.get.mockResolvedValueOnce(
      ok({ items: [comentario("mio", { esMio: true }), comentario("ajeno")], nextCursor: null }),
    );
    const { onContador } = await montar();
    const [mio, ajeno] = screen.getAllByRole("listitem");
    expect(within(ajeno!).queryByRole("button", { name: "Borrar" })).toBeNull();

    mocks.del.mockResolvedValueOnce(ok({ comentarios: 1 }));
    fireEvent.click(within(mio!).getByRole("button", { name: "Borrar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, borrar" }));
    });

    expect(mocks.del).toHaveBeenCalledWith("/api/comentarios/mio");
    expect(screen.queryByText("Texto mio")).toBeNull();
    expect(onContador).toHaveBeenCalledWith(1);
  });
});
