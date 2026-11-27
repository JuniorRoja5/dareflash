/**
 * EL MARCADO DEL ARMAZÓN DEL PORTAL DE EMPRESA, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2b).
 *
 * La navegación (con cada sección activa), el Resumen en cada estado de la empresa (con todos los datos
 * opcionales y sin ellos, con motivo de rechazo y con un tipo de negocio fuera del catálogo), el aviso
 * de correo sin verificar, los Créditos (saldo de uno y de muchos, con y sin movimientos, cada aviso de
 * vuelta de Stripe, la compra bloqueada y sus errores) y la Cuenta. Se confirmó CONTRA EL CÓDIGO DE
 * ANTES: los snapshots de `__snapshots__/` son ese HTML; después de la extracción tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MiEmpresa } from "../../src/server/services/empresas";
import type { MovimientoCreditoEmpresa } from "../../src/server/services/creditos";
import { resolverServidor } from "../helpers/render-servidor";

const H = vi.hoisted(() => ({
  ruta: "/empresa",
  sinVerificar: false,
  estadoAmbito: "VERIFICADA",
  empresa: null as unknown,
  saldo: 0,
  movimientos: [] as unknown[],
  nextCursor: null as string | null,
  enRevision: 0,
  stripe: "" as string,
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
  usePathname: () => H.ruta,
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/server/auth/rbac", () => {
  class AuthError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  return { AuthError };
});
vi.mock("@/server/auth/empresa-actual", async () => {
  const { AuthError } = await import("@/server/auth/rbac");
  class SinEmpresa extends Error {}
  return {
    SinEmpresa,
    requireEmpresa: async () => {
      if (H.sinVerificar)
        throw new (AuthError as never as new (c: string) => Error)("EMAIL_NOT_VERIFIED");
      return { user: { userId: "u1" }, empresaId: "e1", estado: H.estadoAmbito };
    },
  };
});
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => ({ userId: "u1", esCuentaEmpresa: true }),
}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    user: {
      findUnique: async () => ({ email: "ana@bar.test", emailPendiente: null }),
    },
  },
}));
vi.mock("@/server/services/empresas", () => ({ miEmpresa: async () => H.empresa }));
vi.mock("@/server/services/creditos", () => ({
  misCreditos: async () => ({
    saldo: H.saldo,
    movimientos: H.movimientos,
    nextCursor: H.nextCursor,
  }),
}));
vi.mock("@/server/services/retos-empresa", () => ({
  misPropuestasEnRevision: async () => H.enRevision,
}));
vi.mock("@/config/env", () => ({
  env: new Proxy({}, { get: (_o, k) => (k === "STRIPE_SECRET_KEY" ? H.stripe : undefined) }),
}));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import PaginaCuenta from "@/app/(app)/(shell)/empresa/cuenta/page";
import PaginaCreditos from "@/app/(app)/(shell)/empresa/creditos/page";
import { NavPortal } from "@/app/(app)/(shell)/empresa/nav-portal";
import PaginaMiEmpresa from "@/app/(app)/(shell)/empresa/page";

type Respuesta = { ok: boolean; status: number; code: string; data: unknown };
const r = (status: number, data: unknown = {}): Respuesta => ({
  ok: status < 400,
  status,
  code: "",
  data,
});

const DIA = 24 * 60 * 60 * 1000;
const ALTA = Date.UTC(2026, 9, 3, 10);
const empresa = (cambios: Partial<MiEmpresa> = {}): MiEmpresa => ({
  id: "e1",
  nombre: "Bar Ana",
  tipoCuenta: "EMPRESA",
  tipoNegocio: "FISICO",
  estado: "PENDIENTE",
  paisIso: "ES",
  ciudadTexto: null,
  personaContacto: "Ana",
  webUrl: null,
  redes: null,
  direccion: null,
  motivoRechazo: null,
  creadaMs: ALTA,
  verificadaMs: null,
  ...cambios,
});
const movimiento = (
  id: string,
  delta: number,
  concepto: MovimientoCreditoEmpresa["concepto"],
  recibo: string | null = null,
): MovimientoCreditoEmpresa => ({ id, delta, concepto, creadoMs: ALTA + DIA, recibo });

const pintar = async (nodo: React.ReactNode) =>
  render(<>{await resolverServidor(nodo)}</>).container;
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);

beforeEach(() => {
  H.ruta = "/empresa";
  H.sinVerificar = false;
  H.estadoAmbito = "VERIFICADA";
  H.empresa = empresa();
  H.saldo = 0;
  H.movimientos = [];
  H.nextCursor = null;
  H.enRevision = 0;
  H.stripe = "";
});
afterEach(() => H.post.mockReset());

describe("la navegación del portal", () => {
  it.each([
    "/empresa",
    "/empresa/retos/nuevo",
    "/empresa/publicidad",
    "/empresa/creditos",
    "/empresa/cuenta",
  ])("activa en %s", (ruta) => {
    H.ruta = ruta;
    expect(render(<NavPortal />).container.innerHTML).toMatchSnapshot();
  });
});

describe("/empresa", () => {
  it("con el correo sin verificar: el aviso", async () => {
    H.sinVerificar = true;
    expect((await pintar(await PaginaMiEmpresa())).innerHTML).toMatchSnapshot();
  });

  it("pendiente, sin datos opcionales", async () => {
    expect((await pintar(await PaginaMiEmpresa())).innerHTML).toMatchSnapshot();
  });

  it("verificada, con todos los datos y propuestas en revisión", async () => {
    H.empresa = empresa({
      estado: "VERIFICADA",
      tipoCuenta: "MARCA_PERSONAL",
      tipoNegocio: "ONLINE",
      ciudadTexto: "Sevilla",
      webUrl: "https://bar.test",
      redes: "@barana",
      direccion: "Calle Mayor 1",
      verificadaMs: ALTA + 3 * DIA,
    });
    H.saldo = 1234;
    H.enRevision = 2;
    expect((await pintar(await PaginaMiEmpresa())).innerHTML).toMatchSnapshot();
  });

  it.each([
    "DATOS_INSUFICIENTES",
    "WEB_NO_VALIDA",
    "ACTIVIDAD_NO_PERMITIDA",
    "SOSPECHA_FRAUDE",
    "DUPLICADA",
  ] as const)("rechazada por %s", async (motivo) => {
    H.empresa = empresa({ estado: "RECHAZADA", motivoRechazo: motivo });
    expect((await pintar(await PaginaMiEmpresa())).innerHTML).toMatchSnapshot();
  });

  it("suspendida, con un tipo de negocio fuera del catálogo", async () => {
    H.empresa = empresa({ estado: "SUSPENDIDA", tipoNegocio: null, tipoCuenta: "EMPRESA" });
    expect((await pintar(await PaginaMiEmpresa())).innerHTML).toMatchSnapshot();
  });

  it("marca o producto digital", async () => {
    H.empresa = empresa({ estado: "VERIFICADA", tipoNegocio: "MARCA_O_DIGITAL" });
    expect((await pintar(await PaginaMiEmpresa())).innerHTML).toMatchSnapshot();
  });
});

describe("/empresa/creditos", () => {
  it("con el correo sin verificar: el aviso", async () => {
    H.sinVerificar = true;
    expect(
      (await pintar(await PaginaCreditos({ searchParams: sp() }))).innerHTML,
    ).toMatchSnapshot();
  });

  it("sin pagos configurados, sin movimientos, saldo de uno", async () => {
    H.saldo = 1;
    expect(
      (await pintar(await PaginaCreditos({ searchParams: sp() }))).innerHTML,
    ).toMatchSnapshot();
  });

  it("sin verificar la empresa, con movimientos y recibo, y paginada", async () => {
    H.stripe = "configurado";
    H.estadoAmbito = "PENDIENTE";
    H.saldo = 90;
    H.movimientos = [
      movimiento("m1", 100, { razon: "COMPRA", campana: null }, "/api/empresa/creditos/recibo/m1"),
      movimiento("m2", -10, { razon: "CONSUMO", campana: "Pan" }),
    ];
    H.nextCursor = "c2";
    expect(
      (await pintar(await PaginaCreditos({ searchParams: sp() }))).innerHTML,
    ).toMatchSnapshot();
  });

  it.each([
    ["compra", "ok"],
    ["compra", "cancelada"],
    ["recibo", "no-disponible"],
    ["compra", "otra-cosa"],
  ])("al volver con ?%s=%s", async (k, v) => {
    H.empresa = empresa({ estado: "VERIFICADA", tipoNegocio: null });
    expect(
      (await pintar(await PaginaCreditos({ searchParams: sp({ [k]: v }) }))).innerHTML,
    ).toMatchSnapshot();
  });

  it("la compra: abriendo, error con y sin mensaje, y sin conexión", async () => {
    H.stripe = "configurado";
    H.saldo = 5;
    const c = await pintar(await PaginaCreditos({ searchParams: sp() }));
    const seccion = () => c.querySelector('section[aria-labelledby="comprar"]')!;
    expect(seccion().outerHTML).toMatchSnapshot("se puede comprar");
    const botones = () => [...seccion().querySelectorAll("button")];
    for (const [nombre, preparar] of [
      [
        "con mensaje",
        () =>
          H.post.mockResolvedValueOnce(r(400, { error: { code: "X", message: "Del servidor." } })),
      ],
      ["sin mensaje", () => H.post.mockResolvedValueOnce(r(500))],
      ["sin conexión", () => H.post.mockRejectedValueOnce(new Error("red"))],
    ] as const) {
      preparar();
      await act(async () => {
        fireEvent.click(botones()[0]!);
      });
      expect(seccion().outerHTML).toMatchSnapshot(nombre);
    }
    // Abriendo: la promesa no se resuelve, el botón dice que se va.
    H.post.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(botones()[1]!);
    });
    expect(seccion().outerHTML).toMatchSnapshot("abriendo");
  });
});

describe("/empresa/cuenta", () => {
  it("el correo, la contraseña y cerrar sesión", async () => {
    expect((await pintar(await PaginaCuenta())).innerHTML).toMatchSnapshot();
  });
});
