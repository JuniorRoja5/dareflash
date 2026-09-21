/**
 * LOS CONTROLES DE UNA CUENTA — render real. Lo que se fija:
 *  - quién mira decide qué se ofrece: el cambio de rol es del administrador, no del moderador;
 *  - sobre una cuenta suspendida se ofrece LEVANTAR, nunca suspender (y al revés);
 *  - sobre una cuenta privilegiada no se ofrece nada;
 *  - las dos acciones piden confirmación antes de tocar a una persona;
 *  - "no había cambios" es un aviso suave, no un error.
 *
 * Es CONVENIENCIA, no seguridad: la autoridad son las rutas. Por eso aquí se prueba lo que se PINTA y
 * a dónde llama, no si el servidor lo permitiría (eso ya está probado en la pieza A).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/cliente-http", async (orig) => ({
  ...(await orig<typeof import("@/lib/cliente-http")>()),
  postJsonCsrf: mocks.post,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { AccionesCuenta } from "@/app/panel/usuarios/acciones-cuenta";

const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, code: "", data });

function montar(props: Partial<Parameters<typeof AccionesCuenta>[0]> = {}) {
  return render(
    <AccionesCuenta
      userId="u-9"
      handle="marta"
      rolMira="ADMIN"
      rolDestino="USER"
      suspendida={false}
      {...props}
    />,
  );
}
const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre });
const hay = (nombre: string | RegExp) => screen.queryByRole("button", { name: nombre }) !== null;

beforeEach(() => {
  mocks.post.mockReset();
  mocks.refresh.mockReset();
  mocks.post.mockResolvedValue(ok({ ok: true, cambiado: true }));
});

describe("qué se ofrece, según quién mira", () => {
  it("el ADMIN ve el cambio de rol y la suspensión", () => {
    montar();
    expect(hay("Hacer moderador")).toBe(true);
    expect(hay("Suspender")).toBe(true);
  });

  it("el MODERADOR modera, pero NO nombra", () => {
    montar({ rolMira: "MODERATOR" });
    expect(hay("Hacer moderador")).toBe(false);
    expect(hay("Suspender")).toBe(true);
  });

  it("sobre una cuenta SUSPENDIDA se ofrece levantar, no suspender", () => {
    montar({ suspendida: true });
    expect(hay("Levantar suspensión")).toBe(true);
    expect(hay("Suspender")).toBe(false);
  });

  it("sobre un MODERADOR: el admin degrada, pero nadie suspende", () => {
    montar({ rolDestino: "MODERATOR" });
    expect(hay("Quitar moderador")).toBe(true);
    expect(hay("Suspender")).toBe(false);
  });

  it("sobre un ADMIN no se pinta ningún control", () => {
    const { container } = montar({ rolDestino: "ADMIN" });
    expect(container.innerHTML).toBe("");
  });
});

describe("ejecutar", () => {
  it("nombrar moderador pide confirmación y llama a SU ruta con el rol contrario", async () => {
    montar();
    fireEvent.click(boton("Hacer moderador"));

    expect(screen.getByText("¿Hacer moderador a @marta?")).toBeDefined();
    expect(mocks.post).not.toHaveBeenCalled(); // el primer clic no hace nada

    await act(async () => {
      fireEvent.click(boton("Sí, cambiar"));
    });

    expect(mocks.post).toHaveBeenCalledWith("/api/panel/cuentas/u-9/rol", { rol: "MODERATOR" });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("suspender avisa de que se cerrarán sus sesiones, y se puede cancelar", () => {
    montar({ rolMira: "MODERATOR" });
    fireEvent.click(boton("Suspender"));

    expect(screen.getByText(/Se cerrarán sus sesiones/)).toBeDefined();
    fireEvent.click(boton("Cancelar"));

    expect(hay("Suspender")).toBe(true);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("levantar llama a su ruta", async () => {
    montar({ suspendida: true });
    fireEvent.click(boton("Levantar suspensión"));
    await act(async () => {
      fireEvent.click(boton("Sí, levantar"));
    });

    expect(mocks.post).toHaveBeenCalledWith("/api/panel/cuentas/u-9/levantar", {});
  });

  it("'no había cambios' se dice en suave, no como error", async () => {
    mocks.post.mockResolvedValueOnce(ok({ ok: true, cambiado: false }));
    montar();
    fireEvent.click(boton("Hacer moderador"));
    await act(async () => {
      fireEvent.click(boton("Sí, cambiar"));
    });

    expect(screen.getByRole("status").textContent).toContain("No había cambios.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("si el servidor rechaza, se pinta SU mensaje (humano), no un código", async () => {
    mocks.post.mockResolvedValueOnce(
      ok(
        { error: { code: "FORBIDDEN", message: "No puedes cambiar el rol de esta cuenta." } },
        403,
      ),
    );
    montar();
    fireEvent.click(boton("Hacer moderador"));
    await act(async () => {
      fireEvent.click(boton("Sí, cambiar"));
    });

    const aviso = screen.getByRole("status").textContent ?? "";
    expect(aviso).toContain("No puedes cambiar el rol de esta cuenta.");
    expect(aviso).not.toContain("FORBIDDEN");
  });
});
