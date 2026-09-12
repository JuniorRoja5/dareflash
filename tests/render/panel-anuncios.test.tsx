/**
 * PANEL DE NOTIFICACIONES — render real (jsdom) de enviar, la lista de anuncios y el inspector.
 *
 * Lo que se fija: enviar pide confirmación con el tamaño de la audiencia y es idempotente de extremo a
 * extremo (un reintento reusa la clave; cambiar el texto estrena otra). La lista enseña el progreso
 * real y el estado del reparto en copy humano. El inspector pinta lo que vio cada persona.
 *
 * Para romperlo a propósito: generar la clave en cada envío (rojo), o pintar el progreso con otro
 * número que no sea el recuento (rojo).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/cliente-http", async (orig) => ({
  ...(await orig<typeof import("@/lib/cliente-http")>()),
  postJsonCsrf: mocks.post,
  getJson: mocks.get,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { EnviarAnuncio } from "@/app/panel/notificaciones/enviar-anuncio";
import { InspectorNotificaciones } from "@/app/panel/notificaciones/inspector-notificaciones";
import { ListaAnuncios } from "@/app/panel/notificaciones/lista-anuncios";
import type { AnuncioRevision } from "@/server/services/anuncios";

let n = 0;
beforeEach(() => {
  n = 0;
  const original = globalThis.crypto;
  vi.stubGlobal("crypto", {
    randomUUID: () => `clave-${++n}`,
    getRandomValues: <T extends ArrayBufferView>(a: T) => original.getRandomValues(a),
    subtle: original.subtle,
  });
  mocks.post.mockReset();
  mocks.get.mockReset();
  mocks.refresh.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (data: unknown) => ({ ok: true, status: 200, code: "", data });
const escribir = (valor: string) =>
  fireEvent.change(screen.getByLabelText(/Texto del anuncio/), { target: { value: valor } });
const revisar = () => screen.getByRole("button", { name: "Revisar anuncio" });

describe("EnviarAnuncio", () => {
  it("sin texto no se puede ni revisar; la confirmación dice a cuántas cuentas llega", () => {
    render(<EnviarAnuncio audiencia={12500} />);
    expect(revisar()).toHaveProperty("disabled", true);
    escribir("  ");
    expect(revisar()).toHaveProperty("disabled", true);
    escribir("Mantenimiento el sábado.");
    fireEvent.click(revisar());
    expect(
      within(screen.getByRole("group", { name: "Confirmar envío" })).getByText(
        /¿Enviar a 12\.500 cuentas\? No se puede deshacer\./,
      ),
    ).toBeDefined();
  });

  it("un reintento tras un fallo reusa la MISMA clave; al acertar, refresca", async () => {
    render(<EnviarAnuncio audiencia={3} />);
    escribir("Mantenimiento el sábado.");
    fireEvent.click(revisar());

    mocks.post.mockRejectedValueOnce(new Error("red caída"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    });
    expect(screen.getByRole("alert").textContent).toContain("si ya se envió, no se repetirá");

    mocks.post.mockResolvedValueOnce(ok({ id: "an-1", targetCount: 3, creado: true }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    });

    const claves = mocks.post.mock.calls.map(([, c]) => (c as { clave: string }).clave);
    expect(claves).toHaveLength(2);
    expect(claves[0]).toBe(claves[1]);
    expect(mocks.post.mock.calls[0]?.[1]).toMatchObject({ texto: "Mantenimiento el sábado." });
    expect(screen.getByRole("status").textContent).toContain("Se está repartiendo a 3 cuentas");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("cambiar el texto es OTRA intención: otra clave", async () => {
    render(<EnviarAnuncio audiencia={3} />);
    escribir("Mantenimiento el sábado.");
    fireEvent.click(revisar());
    mocks.post.mockRejectedValueOnce(new Error("red caída"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    });

    escribir("Mantenimiento el domingo.");
    fireEvent.click(revisar());
    mocks.post.mockResolvedValueOnce(ok({ id: "an-2", targetCount: 3, creado: true }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    });

    const claves = mocks.post.mock.calls.map(([, c]) => (c as { clave: string }).clave);
    expect(claves[0]).not.toBe(claves[1]);
  });

  it("si ya estaba enviado, lo dice sin alarma", async () => {
    render(<EnviarAnuncio audiencia={3} />);
    escribir("Mantenimiento el sábado.");
    fireEvent.click(revisar());
    mocks.post.mockResolvedValueOnce(ok({ id: "an-1", targetCount: 3, creado: false }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, enviar" }));
    });
    expect(screen.getByRole("status").textContent).toContain("ya estaba enviado");
  });
});

const anuncio = (id: string, extra: Partial<AnuncioRevision> = {}): AnuncioRevision => ({
  id,
  texto: `Texto del anuncio ${id}`,
  creadoEnMs: Date.UTC(2026, 2, 5, 10, 30),
  autor: "admin_anuncios",
  targetCount: 12500,
  entregadas: 12400,
  estado: "repartiendo",
  ...extra,
});

describe("ListaAnuncios", () => {
  it("el progreso es el recuento sobre el objetivo, y cada estado en copy humano", () => {
    const { container } = render(
      <ListaAnuncios
        cursorInicial={null}
        inicial={[
          anuncio("a1"),
          anuncio("a2", { entregadas: 12500, estado: "entregado" }),
          anuncio("a3", { entregadas: 12490, estado: "terminado" }),
          anuncio("a4", { entregadas: 10, estado: "fallido" }),
        ]}
      />,
    );
    const item = (id: string) => container.querySelector<HTMLElement>(`[data-anuncio="${id}"]`)!;
    expect(item("a1").textContent).toContain("12.400 / 12.500 entregados");
    expect(item("a1").textContent).toContain("Repartiendo…");
    expect(item("a1").textContent).toContain("por @admin_anuncios");
    expect(item("a2").textContent).toContain("Entregado");
    expect(item("a3").textContent).toContain("10 cuentas se borraron o fueron baneadas");
    expect(item("a4").textContent).toContain("se detuvo por errores");
    expect(container.innerHTML).not.toMatch(/money/);
  });

  it("'Ver más' pide la página siguiente por cursor", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [anuncio("a9")], nextCursor: null }));
    const { container } = render(<ListaAnuncios cursorInicial="c1" inicial={[anuncio("a1")]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver más anuncios" }));
    });
    expect(mocks.get).toHaveBeenCalledWith("/api/panel/anuncios?cursor=c1");
    expect(container.querySelectorAll("[data-anuncio]")).toHaveLength(2);
  });

  it("sin anuncios: vacío honesto", () => {
    render(<ListaAnuncios cursorInicial={null} inicial={[]} />);
    expect(screen.getByText("Aún no has enviado ningún anuncio.")).toBeDefined();
  });
});

describe("InspectorNotificaciones", () => {
  const fila = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    usuario: "lucia",
    tipo: "ANUNCIO" as const,
    texto: "Mantenimiento el sábado.",
    leida: false,
    creadaMs: Date.UTC(2026, 2, 5, 10, 30),
    ...extra,
  });

  it("pinta a quién, qué tipo, el texto que vio y si lo leyó", () => {
    render(
      <InspectorNotificaciones
        consulta=""
        cursorInicial={null}
        inicial={[fila("n1"), fila("n2", { tipo: "VOTO_RECIBIDO", texto: null, leida: true })]}
      />,
    );
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas[0]!.textContent).toContain("@lucia");
    expect(filas[0]!.textContent).toContain("Anuncio");
    expect(filas[0]!.textContent).toContain("Mantenimiento el sábado.");
    expect(filas[0]!.textContent).toContain("Sin leer");
    expect(filas[1]!.textContent).toContain("Voto recibido");
    expect(filas[1]!.textContent).toContain("Leída");
  });

  it("'Ver más' mantiene los filtros y añade el cursor", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [fila("n9")], nextCursor: null }));
    render(
      <InspectorNotificaciones
        consulta="usuario=lucia&tipo=ANUNCIO"
        cursorInicial="c1"
        inicial={[fila("n1")]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver más notificaciones" }));
    });
    expect(mocks.get).toHaveBeenCalledWith(
      "/api/panel/notificaciones?usuario=lucia&tipo=ANUNCIO&cursor=c1",
    );
  });

  it("sin resultados: vacío honesto", () => {
    render(<InspectorNotificaciones consulta="" cursorInicial={null} inicial={[]} />);
    expect(screen.getByText("No hay notificaciones con esos filtros.")).toBeDefined();
  });
});
