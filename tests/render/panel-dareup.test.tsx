/**
 * PANEL DAREUP — render real (jsdom) de las tres piezas de cliente: el ajuste, el historial y el
 * ranking del mes.
 *
 * Lo que se fija: el ajuste exige motivo, dice que NO cambia victorias ni puesto, y es idempotente de
 * extremo a extremo (un reintento reusa la clave; un cambio de contenido estrena otra). El historial
 * pinta los movimientos reales con su nota y su autor. Todo neutro: los puntos no son dinero.
 *
 * Para romperlo a propósito: generar la clave en cada envío (rojo), no exigir motivo (rojo), quitar la
 * frase de las victorias (rojo).
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
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { AjustarPuntos } from "@/app/panel/ranking/ajustar-puntos";
import { HistorialPuntos } from "@/app/panel/ranking/historial-puntos";
import { RankingMesPanel } from "@/app/panel/ranking/ranking-mes-panel";

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

function escribir(etiqueta: RegExp, valor: string): void {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
}
const revisar = () => screen.getByRole("button", { name: "Revisar ajuste" });

describe("AjustarPuntos", () => {
  it("sin un motivo de verdad no se puede ni revisar", () => {
    render(<AjustarPuntos userId="u1" username="jugadora" puntos={100} />);
    escribir(/Cantidad/, "50");
    expect(revisar()).toHaveProperty("disabled", true);
    escribir(/Motivo/, "ok");
    expect(revisar()).toHaveProperty("disabled", true);
    escribir(/Motivo/, "Premio del evento");
    expect(revisar()).toHaveProperty("disabled", false);
  });

  it("dice lo que va a pasar y que NO cambia victorias ni puesto", () => {
    render(<AjustarPuntos userId="u1" username="jugadora" puntos={100} />);
    const seccion = screen.getByRole("region", { name: "Ajustar puntos" });
    expect(seccion.textContent).toContain("No cambia sus victorias ni su puesto en el ranking");

    escribir(/Cantidad/, "+50");
    escribir(/Motivo/, "Premio del evento");
    expect(seccion.textContent).toContain("Quedaría en 150 puntos · Challenger");
    fireEvent.click(revisar());
    expect(
      within(screen.getByRole("group", { name: "Confirmar ajuste" })).getByText(
        /¿Sumar 50 puntos a @\s*jugadora\?/,
      ),
    ).toBeDefined();
  });

  it("no deja restar por debajo de 0", () => {
    render(<AjustarPuntos userId="u1" username="jugadora" puntos={10} />);
    escribir(/Cantidad/, "-11");
    escribir(/Motivo/, "Voto duplicado detectado");
    expect(screen.getByText(/No puede quedar en negativo/)).toBeDefined();
    expect(revisar()).toHaveProperty("disabled", true);
  });

  it("un reintento tras un fallo reusa la MISMA clave; al acertar, refresca la ficha", async () => {
    render(<AjustarPuntos userId="u1" username="jugadora" puntos={100} />);
    escribir(/Cantidad/, "50");
    escribir(/Motivo/, "Premio del evento");
    fireEvent.click(revisar());

    mocks.post.mockRejectedValueOnce(new Error("red caída"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, aplicar" }));
    });
    expect(screen.getByRole("alert").textContent).toContain("si ya se aplicó, no se repetirá");

    mocks.post.mockResolvedValueOnce(ok({ aplicado: true, saldo: 150 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, aplicar" }));
    });

    const claves = mocks.post.mock.calls.map(([, cuerpo]) => (cuerpo as { clave: string }).clave);
    expect(claves).toHaveLength(2);
    expect(claves[0]).toBe(claves[1]);
    expect(mocks.post.mock.calls[0]?.[1]).toMatchObject({
      userId: "u1",
      delta: 50,
      nota: "Premio del evento",
    });
    expect(screen.getByRole("status").textContent).toContain("tiene ahora 150 puntos");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("cambiar la cantidad o el motivo es OTRA intención: otra clave", async () => {
    render(<AjustarPuntos userId="u1" username="jugadora" puntos={100} />);
    escribir(/Cantidad/, "50");
    escribir(/Motivo/, "Premio del evento");
    fireEvent.click(revisar());
    mocks.post.mockRejectedValueOnce(new Error("red caída"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, aplicar" }));
    });

    escribir(/Motivo/, "Premio del evento de marzo");
    fireEvent.click(revisar());
    mocks.post.mockResolvedValueOnce(ok({ aplicado: true, saldo: 150 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, aplicar" }));
    });

    const claves = mocks.post.mock.calls.map(([, cuerpo]) => (cuerpo as { clave: string }).clave);
    expect(claves[0]).not.toBe(claves[1]);
  });

  it("si el servidor dice que ya estaba aplicado, lo cuenta sin alarma", async () => {
    render(<AjustarPuntos userId="u1" username="jugadora" puntos={100} />);
    escribir(/Cantidad/, "50");
    escribir(/Motivo/, "Premio del evento");
    fireEvent.click(revisar());
    mocks.post.mockResolvedValueOnce(ok({ aplicado: false, saldo: 150 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, aplicar" }));
    });
    expect(screen.getByRole("status").textContent).toContain("ya estaba aplicado");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

const mov = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  delta: 30,
  razon: "WIN_CHALLENGE",
  refType: "CHALLENGE",
  refId: "reto-1",
  nota: null,
  creadoEnMs: Date.UTC(2026, 2, 5, 10, 30),
  autor: null,
  ...extra,
});

describe("HistorialPuntos", () => {
  it("pinta cada movimiento real: motivo humano, puntos con signo, quién, y la nota", () => {
    render(
      <HistorialPuntos
        userId="u1"
        cursorInicial={null}
        inicial={[
          mov("m2", {
            delta: -5,
            razon: "ADMIN_AJUSTE",
            refType: "ADMIN",
            refId: "admin-1",
            nota: "Voto duplicado",
            autor: "admin_dareup",
          }),
          mov("m1"),
          mov("m0", { razon: "CODIGO_NUEVO", refType: null, refId: null }),
        ]}
      />,
    );
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas[0]!.textContent).toContain("Ajuste manual");
    expect(filas[0]!.textContent).toContain("−5");
    expect(filas[0]!.textContent).toContain("por @admin_dareup");
    expect(filas[0]!.textContent).toContain("Voto duplicado");
    expect(filas[1]!.textContent).toContain("Ganó un reto");
    expect(filas[1]!.textContent).toContain("+30");
    // Un código sin traducir se enseña tal cual, sin inventarle un nombre.
    expect(filas[2]!.textContent).toContain("CODIGO_NUEVO");
  });

  it("'Ver más' pide la página siguiente por cursor y la añade", async () => {
    mocks.get.mockResolvedValueOnce(ok({ items: [mov("m9")], nextCursor: null }));
    render(<HistorialPuntos userId="u 1" cursorInicial="c1" inicial={[mov("m1")]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver más movimientos" }));
    });
    expect(mocks.get).toHaveBeenCalledWith("/api/panel/dareup/historial?userId=u%201&cursor=c1");
    expect(screen.getAllByRole("row")).toHaveLength(3); // cabecera + 2
    expect(screen.queryByRole("button", { name: "Ver más movimientos" })).toBeNull();
  });

  it("sin movimientos: vacío honesto", () => {
    render(<HistorialPuntos userId="u1" cursorInicial={null} inicial={[]} />);
    expect(screen.getByText("Sin movimientos de puntos todavía.")).toBeDefined();
  });
});

describe("RankingMesPanel", () => {
  const fila = (n: number, victorias: number, puntos: number) => ({
    userId: `u${n}`,
    username: `persona${n}`,
    displayName: null,
    image: null,
    victorias,
    puntos,
  });

  it("victorias (el orden), puntos y nivel; cada fila abre el inspector", () => {
    const { container } = render(
      <RankingMesPanel filasIniciales={[fila(1, 3, 40), fila(2, 1, 2500)]} cursorInicial={null} />,
    );
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas[0]!.textContent).toContain("@persona1");
    expect(filas[1]!.textContent).toContain("2500"); // es-ES no separa millares con 4 cifras
    expect(filas[1]!.textContent).toContain("Elite");
    expect(within(filas[0]!).getByRole("link").getAttribute("href")).toBe(
      "/panel/ranking?u=u1#inspector",
    );
    expect(container.innerHTML).not.toMatch(/money/);
  });

  it("sin victorias este mes: vacío honesto", () => {
    render(<RankingMesPanel filasIniciales={[]} cursorInicial={null} />);
    expect(screen.getByText(/Aún no ha ganado nadie este mes/)).toBeDefined();
  });
});
