/**
 * EL MARCADO DE /vip Y /boosts, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2a).
 *
 * VIP: sin plan (con y sin pagos), con el plan que se renueva y con el que termina (con y sin fecha), la
 * vuelta de Stripe en sus dos sentidos, el botón de suscribirse y la baja en cada paso. Boost: sin
 * saldo, con saldo y destacado, con el cupo lleno, con el límite del día gastado, sin pagos, el
 * historial con cada motivo, la vuelta de la compra, activar y comprar con cada respuesta. Se confirmó
 * CONTRA EL CÓDIGO DE ANTES: los snapshots de `__snapshots__/` son ese HTML; después de la extracción
 * tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

const H = vi.hoisted(() => ({
  verificado: true as boolean,
  stripe: "sk" as string | undefined,
  vip: { activo: false, terminaAlFinal: false, hasta: null as Date | null, estado: null },
  saldo: 0,
  historial: { items: [] as unknown[], proximoCursor: null as string | null },
  comprados: 0,
  estado: { usadasHoy: 0, vigenteHastaMs: null as number | null },
  cupo: { lleno: false, minutosParaHueco: null as number | null },
  post: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));
vi.mock("@/lib/cliente-http", async (original) => {
  const { vi: v } = await import("vitest");
  H.post = v.fn();
  return {
    ...(await original<typeof import("../../src/lib/cliente-http")>()),
    postJsonCsrf: H.post,
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/vip",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/auth/solo-participante", () => ({ apartarCuentaEmpresa: async () => {} }));
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => ({ userId: "u1", emailVerified: H.verificado ? new Date() : null }),
}));
vi.mock("@/config/env", () => ({
  env: new Proxy({}, { get: (_o, k) => (k === "STRIPE_SECRET_KEY" ? H.stripe : undefined) }),
}));
vi.mock("@/server/db/client", () => ({
  prisma: { user: { findUnique: async () => ({ boostBalance: H.saldo }) } },
}));
vi.mock("@/server/services/vip", () => ({ vipDe: async () => H.vip }));
vi.mock("@/server/services/boost-historial", () => ({
  boostsComprados: async () => H.comprados,
  miHistorialBoosts: async () => H.historial,
}));
vi.mock("@/server/services/boost-activacion", () => ({
  estadoCupo: async () => H.cupo,
  miEstadoBoost: async () => H.estado,
}));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import BoostsPage from "@/app/(app)/(shell)/boosts/page";
import VipPage from "@/app/(app)/(shell)/vip/page";
import { BOOST_DAILY_LIMIT } from "@/config/constants";

type Respuesta = { ok: boolean; status: number; code: string; data: unknown };
const r = (status: number, data: unknown = {}): Respuesta => ({
  ok: status < 400,
  status,
  code: "",
  data,
});
const pulsar = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const T0 = new Date("2026-03-01T10:00:00Z");
const pintar = async (Pagina: typeof VipPage, sp: Record<string, string> = {}) =>
  render(<>{await resolverServidor(await Pagina({ searchParams: Promise.resolve(sp) }))}</>)
    .container;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(T0);
  H.verificado = true;
  H.stripe = "sk";
  H.vip = { activo: false, terminaAlFinal: false, hasta: null, estado: null };
  H.saldo = 0;
  H.historial = { items: [], proximoCursor: null };
  H.comprados = 0;
  H.estado = { usadasHoy: 0, vigenteHastaMs: null };
  H.cupo = { lleno: false, minutosParaHueco: null };
  H.post.mockReset();
});

describe("/vip", () => {
  it("sin plan: con pagos, sin pagos y sin el correo verificado", async () => {
    expect((await pintar(VipPage)).innerHTML).toMatchSnapshot("con pagos");
    H.stripe = undefined;
    expect((await pintar(VipPage)).innerHTML).toMatchSnapshot("sin pagos");
    H.stripe = "sk";
    H.verificado = false;
    expect((await pintar(VipPage)).innerHTML).toMatchSnapshot("sin verificar");
  });

  it("con el plan: se renueva (con y sin fecha), y termina (con y sin fecha)", async () => {
    for (const [nombre, terminaAlFinal, hasta] of [
      ["se renueva", false, T0],
      ["se renueva sin fecha", false, null],
      ["termina", true, T0],
      ["termina sin fecha", true, null],
    ] as const) {
      H.vip = { activo: true, terminaAlFinal, hasta, estado: null };
      expect((await pintar(VipPage)).innerHTML).toMatchSnapshot(nombre);
    }
  });

  it("la vuelta de Stripe, en sus dos sentidos", async () => {
    expect((await pintar(VipPage, { suscripcion: "ok" })).innerHTML).toMatchSnapshot("ok");
    expect((await pintar(VipPage, { suscripcion: "cancelada" })).innerHTML).toMatchSnapshot(
      "cancelada",
    );
  });

  it("suscribirse: abriendo, error con y sin mensaje, sin conexión", async () => {
    const c = await pintar(VipPage);
    const seccion = () => c.querySelector('section[aria-labelledby="vip-hazte"]')!.outerHTML;
    H.post.mockReturnValueOnce(new Promise(() => {}));
    await pulsar(screen.getByRole("button", { name: "Hazte VIP Mythic" }));
    expect(seccion()).toMatchSnapshot("abriendo");
    c.remove();
    for (const [nombre, preparar] of [
      [
        "con mensaje",
        () =>
          H.post.mockResolvedValueOnce(r(400, { error: { code: "X", message: "Del servidor." } })),
      ],
      ["sin mensaje", () => H.post.mockResolvedValueOnce(r(500))],
      ["sin conexión", () => H.post.mockRejectedValueOnce(new Error("red"))],
    ] as const) {
      const d = await pintar(VipPage);
      preparar();
      await pulsar(screen.getByRole("button", { name: "Hazte VIP Mythic" }));
      expect(d.querySelector('section[aria-labelledby="vip-hazte"]')!.outerHTML).toMatchSnapshot(
        nombre,
      );
      d.remove();
    }
  });

  it("darse de baja: confirmar, error, sin conexión y pedida (con y sin mensaje)", async () => {
    H.vip = { activo: true, terminaAlFinal: false, hasta: T0, estado: null };
    for (const [nombre, preparar] of [
      ["error", () => H.post.mockResolvedValueOnce(r(500))],
      ["sin conexión", () => H.post.mockRejectedValueOnce(new Error("red"))],
      [
        "pedida con mensaje",
        () => H.post.mockResolvedValueOnce(r(200, { mensaje: "Del servidor." })),
      ],
      ["pedida sin mensaje", () => H.post.mockResolvedValueOnce(r(200))],
    ] as const) {
      const c = await pintar(VipPage);
      const tarjeta = () => c.querySelector("[data-eres-vip]")!.outerHTML;
      await pulsar(screen.getByRole("button", { name: "Cancelar suscripción" }));
      if (nombre === "error") expect(tarjeta()).toMatchSnapshot("confirmando");
      preparar();
      await pulsar(screen.getByRole("button", { name: "Sí, dar de baja" }));
      expect(tarjeta()).toMatchSnapshot(nombre);
      c.remove();
    }
  });
});

describe("/boosts", () => {
  it("sin saldo ni compras, y sin pagos", async () => {
    expect((await pintar(BoostsPage)).innerHTML).toMatchSnapshot("vacío");
    H.stripe = undefined;
    expect((await pintar(BoostsPage)).innerHTML).toMatchSnapshot("sin pagos");
    H.stripe = "sk";
    H.verificado = false;
    expect((await pintar(BoostsPage)).innerHTML).toMatchSnapshot("sin verificar");
  });

  it("con saldo, destacado, con historial de cada motivo y más páginas", async () => {
    H.saldo = 4;
    H.comprados = 10;
    H.estado = { usadasHoy: 1, vigenteHastaMs: T0.getTime() + 3_600_000 };
    H.historial = {
      items: [
        ["PURCHASE", 10, 900, "USD"],
        ["VIP_WEEKLY", 1, null, null],
        ["ACTIVATION", -1, null, null],
        ["REFUND", -5, 450, "USD"],
        ["ADMIN_ADJUST", 2, null, null],
        ["ADMIN_ADJUST", -1, null, null],
        ["RAZON_RARA", 1, 100, null],
      ].map(([razon, delta, importeCents, moneda], i) => ({
        id: `b${i}`,
        razon,
        delta,
        importeCents,
        moneda,
        creadoEnMs: T0.getTime() - i * 86_400_000,
      })),
      proximoCursor: "c2",
    };
    expect((await pintar(BoostsPage)).innerHTML).toMatchSnapshot();
  });

  it("con el cupo lleno, y con el límite del día gastado", async () => {
    H.saldo = 2;
    H.cupo = { lleno: true, minutosParaHueco: 7 };
    expect((await pintar(BoostsPage)).innerHTML).toMatchSnapshot("cupo lleno");
    H.cupo = { lleno: false, minutosParaHueco: null };
    H.estado = { usadasHoy: BOOST_DAILY_LIMIT, vigenteHastaMs: null };
    expect((await pintar(BoostsPage)).innerHTML).toMatchSnapshot("límite gastado");
  });

  it("la vuelta de la compra, en sus dos sentidos", async () => {
    expect((await pintar(BoostsPage, { compra: "ok" })).innerHTML).toMatchSnapshot("ok");
    expect((await pintar(BoostsPage, { compra: "cancelada" })).innerHTML).toMatchSnapshot(
      "cancelada",
    );
  });

  it("activar: hecho, repetida, error con y sin mensaje, sin conexión", async () => {
    H.saldo = 2;
    for (const [nombre, preparar] of [
      ["activado", () => H.post.mockResolvedValueOnce(r(200, { estado: "activado" }))],
      ["repetida", () => H.post.mockResolvedValueOnce(r(200, { estado: "repetida" }))],
      ["con mensaje", () => H.post.mockResolvedValueOnce(r(409, { mensaje: "Del servidor." }))],
      ["sin mensaje", () => H.post.mockResolvedValueOnce(r(500))],
      ["sin conexión", () => H.post.mockRejectedValueOnce(new Error("red"))],
    ] as const) {
      const c = await pintar(BoostsPage);
      preparar();
      await pulsar(screen.getByRole("button", { name: "Destacar mi perfil ahora" }));
      expect(c.querySelector('section[aria-labelledby="mis-boosts"]')!.outerHTML).toMatchSnapshot(
        nombre,
      );
      c.remove();
    }
  });

  it("comprar: abriendo, error con y sin mensaje, sin conexión", async () => {
    for (const [nombre, preparar] of [
      ["abriendo", () => H.post.mockReturnValueOnce(new Promise(() => {}))],
      [
        "con mensaje",
        () =>
          H.post.mockResolvedValueOnce(r(400, { error: { code: "X", message: "Del servidor." } })),
      ],
      ["sin mensaje", () => H.post.mockResolvedValueOnce(r(500))],
      ["sin conexión", () => H.post.mockRejectedValueOnce(new Error("red"))],
    ] as const) {
      const c = await pintar(BoostsPage);
      preparar();
      await pulsar(screen.getAllByRole("button", { name: "Comprar" })[0]!);
      expect(c.querySelector('section[aria-labelledby="paquetes"]')!.outerHTML).toMatchSnapshot(
        nombre,
      );
      c.remove();
    }
  });
});
