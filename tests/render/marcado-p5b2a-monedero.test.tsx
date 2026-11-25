/**
 * EL MARCADO DEL MONEDERO, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2a).
 *
 * El saldo a cero, por debajo y por encima del mínimo; cada estado de una solicitud (también la
 * rechazada con su motivo y sin él), cada concepto de un movimiento, los métodos de cobro (vacío,
 * con uno, con dos, reemplazando) y los formularios con sus errores y su confirmación. Se confirmó
 * CONTRA EL CÓDIGO DE ANTES: los snapshots de `__snapshots__/` son ese HTML; después de la extracción
 * tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

const H = vi.hoisted(() => ({
  saldo: 0,
  metodos: [] as unknown[],
  historial: { items: [] as unknown[], nextCursor: null as string | null },
  movimientos: [] as unknown[],
  porEstado: [] as unknown[],
  getJson: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  post: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  put: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  del: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));
vi.mock("@/lib/cliente-http", async (original) => {
  const { vi: v } = await import("vitest");
  H.getJson = v.fn();
  H.post = v.fn();
  H.put = v.fn();
  H.del = v.fn();
  return {
    ...(await original<typeof import("../../src/lib/cliente-http")>()),
    getJson: H.getJson,
    postJsonCsrf: H.post,
    putJsonCsrf: H.put,
    delCsrf: H.del,
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/wallet",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/auth/solo-participante", () => ({ apartarCuentaEmpresa: async () => {} }));
vi.mock("@/server/auth/rbac", () => ({
  requireVerifiedUser: async () => ({ userId: "u1" }),
  AuthError: class extends Error {},
}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    user: { findUniqueOrThrow: async () => ({ walletBalanceCents: H.saldo }) },
    withdrawal: { groupBy: async () => H.porEstado },
  },
}));
vi.mock("@/server/services/retirada", () => ({
  misMovimientosMonedero: async () => H.movimientos,
  misRetiradas: async () => H.historial,
}));
vi.mock("@/server/services/metodos-pago", () => ({ misMetodosPago: async () => H.metodos }));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import ErrorMonedero from "@/app/(app)/(shell)/wallet/error";
import WalletPage from "@/app/(app)/(shell)/wallet/page";

type Respuesta = { ok: boolean; status: number; code: string; data: unknown };
const r = (status: number, data: unknown = {}): Respuesta => ({
  ok: status < 400,
  status,
  code: "",
  data,
});
const conMensaje = (status: number) =>
  r(status, { error: { code: "X", message: "Del servidor." } });
const pulsar = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const T0 = new Date("2026-03-01T10:00:00Z");
const pagina = async () => render(<>{await resolverServidor(await WalletPage())}</>).container;

const metodo = (id: string, pista: string) => ({ id, metodo: "BANK", pista, createdAt: T0 });
const retirada = (id: string, status: string, motivoRechazo: string | null = null) => ({
  id,
  amountCents: 6000,
  currency: "USD",
  status,
  metodo: status === "PAID" ? "OTRO" : "BANK",
  pista: "1332",
  createdAt: T0,
  actualizadaEn: status === "PENDING" ? null : T0,
  motivoRechazo,
});

beforeEach(() => {
  H.saldo = 0;
  H.metodos = [];
  H.historial = { items: [], nextCursor: null };
  H.movimientos = [];
  H.porEstado = [];
  for (const m of [H.getJson, H.post, H.put, H.del]) m.mockReset();
});

describe("/wallet", () => {
  it("vacío: sin saldo, sin métodos (el formulario abierto), sin solicitudes ni movimientos", async () => {
    expect((await pagina()).innerHTML).toMatchSnapshot();
  });

  it("por debajo del mínimo, con un método, y un movimiento de cada concepto", async () => {
    H.saldo = 1234;
    H.metodos = [metodo("m1", "1332")];
    H.movimientos = ["PRIZE", "WITHDRAWAL", "WITHDRAWAL_REFUND", "ADMIN", "RARO", null].map(
      (concepto, i) => ({
        id: `mv${i}`,
        amountCents: i % 2 === 0 ? 5000 : -2500,
        currency: "USD",
        concepto,
        createdAt: T0,
      }),
    );
    expect((await pagina()).innerHTML).toMatchSnapshot();
  });

  it("por encima del mínimo: pedir cobro, dos métodos, cada estado y más páginas", async () => {
    H.saldo = 9000;
    H.metodos = [metodo("m1", "1332"), metodo("m2", "9876")];
    H.porEstado = [
      { status: "PENDING", _sum: { amountCents: 6000 } },
      { status: "PAID", _sum: { amountCents: 12000 } },
    ];
    H.historial = {
      items: [
        retirada("w1", "PENDING"),
        retirada("w2", "APPROVED"),
        retirada("w3", "PROCESSING"),
        retirada("w4", "PAID"),
        retirada("w5", "REJECTED", "El IBAN no corresponde al titular."),
        retirada("w6", "REJECTED"),
      ],
      nextCursor: "c2",
    };
    const c = await pagina();
    expect(c.innerHTML).toMatchSnapshot("página");

    H.getJson.mockResolvedValueOnce(r(500));
    await pulsar(screen.getByRole("button", { name: "Ver más" }));
    expect(c.innerHTML).toMatchSnapshot("ver más falla");
    H.getJson.mockReturnValueOnce(new Promise(() => {}));
    await pulsar(screen.getByRole("button", { name: "Ver más" }));
    expect(c.innerHTML).toMatchSnapshot("cargando");
  });

  it("los métodos: reemplazar, guardar con error, borrar con error", async () => {
    H.saldo = 9000;
    H.metodos = [metodo("m1", "1332")];
    const c = await pagina();
    const seccion = () => c.querySelector('section[aria-labelledby="donde-cobrar"]')!.outerHTML;
    await pulsar(screen.getByRole("button", { name: "Reemplazar" }));
    expect(seccion()).toMatchSnapshot("reemplazando");
    fireEvent.change(c.querySelector("#iban")!, { target: { value: "ES9121000418450200051332" } });
    fireEvent.change(c.querySelector("#titular")!, { target: { value: "Ana Ríos" } });
    H.put.mockResolvedValueOnce(conMensaje(400));
    await act(async () => {
      fireEvent.submit(c.querySelector('section[aria-labelledby="donde-cobrar"] form')!);
    });
    expect(seccion()).toMatchSnapshot("guardar con mensaje");
    H.put.mockResolvedValueOnce(r(500));
    await act(async () => {
      fireEvent.submit(c.querySelector('section[aria-labelledby="donde-cobrar"] form')!);
    });
    expect(seccion()).toMatchSnapshot("guardar sin mensaje");
    H.del.mockResolvedValueOnce(r(500));
    await pulsar(screen.getByRole("button", { name: "Borrar" }));
    expect(seccion()).toMatchSnapshot("borrar falla");
    await pulsar(screen.getByRole("button", { name: "Cancelar" }));
    expect(seccion()).toMatchSnapshot("cancelado");
  });

  it("pedir un cobro: error con y sin mensaje, y hecho", async () => {
    H.saldo = 9000;
    H.metodos = [metodo("m1", "1332")];
    const c = await pagina();
    const form = () => c.querySelector('form[aria-label="Pedir un cobro"]')!;
    for (const [nombre, resp] of [
      ["con mensaje", conMensaje(400)],
      ["sin mensaje", r(500)],
      ["hecho", r(200)],
    ] as const) {
      fireEvent.change(c.querySelector("#importe")!, { target: { value: "60" } });
      H.post.mockResolvedValueOnce(resp);
      await act(async () => {
        fireEvent.submit(form());
      });
      expect(form().outerHTML).toMatchSnapshot(nombre);
    }
  });

  it("la pantalla de error", () => {
    expect(
      render(<ErrorMonedero error={new Error("x")} retry={() => {}} />).container.innerHTML,
    ).toMatchSnapshot();
  });
});
