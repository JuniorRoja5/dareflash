/**
 * EL MARCADO DE /puntos Y /referidos, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2a).
 *
 * Los puntos en sus tres situaciones (empezando, a medio camino con racha de uno, y en el nivel máximo
 * con racha), el historial con cada motivo —también el ajuste del equipo que suma y el que resta—, la
 * pantalla de error, y los referidos vacíos, con gente cobrada y pendiente, y sin enlace. Se confirmó
 * CONTRA EL CÓDIGO DE ANTES: los snapshots de `__snapshots__/` son ese HTML; después de la extracción
 * tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

const H = vi.hoisted(() => ({
  puntos: 0,
  racha: 0,
  historial: { items: [] as unknown[], nextCursor: null as string | null },
  codigo: "ABC123" as string | null,
  referidos: { items: [] as unknown[], proximoCursor: null as string | null },
  resumen: { invitados: 0, puntosGanados: 0, pendientes: 0 },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/puntos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/auth/solo-participante", () => ({ apartarCuentaEmpresa: async () => {} }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: async () => ({ userId: "u1" }) }));
vi.mock("@/server/db/client", () => ({
  prisma: {
    user: {
      findUnique: async (q: { select: Record<string, boolean> }) =>
        q.select.referralCode
          ? H.codigo
            ? { referralCode: H.codigo }
            : null
          : { pointsBalance: H.puntos },
    },
  },
}));
vi.mock("@/server/services/puntos", () => ({ miHistorialPuntos: async () => H.historial }));
vi.mock("@/server/services/racha", () => ({ rachaDe: async () => H.racha }));
vi.mock("@/config/env", () => ({ env: { APP_URL: "https://app.test" } }));
vi.mock("@/server/services/referidos", () => ({
  enlaceReferido: (base: string, c: string) => `${base}/entrar?ref=${c}`,
  misReferidos: async () => H.referidos,
  resumenReferidos: async () => H.resumen,
}));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import ErrorPuntos from "@/app/(app)/(shell)/puntos/error";
import PuntosPage from "@/app/(app)/(shell)/puntos/page";
import ReferidosPage from "@/app/(app)/(shell)/referidos/page";

const DIA = 86_400_000;
const T0 = new Date("2026-03-01T10:00:00Z").getTime();
const pintar = async (Pagina: typeof PuntosPage, sp: Record<string, string> = {}) =>
  render(<>{await resolverServidor(await Pagina({ searchParams: Promise.resolve(sp) }))}</>)
    .container.innerHTML;

beforeEach(() => {
  H.puntos = 0;
  H.racha = 0;
  H.historial = { items: [], nextCursor: null };
  H.codigo = "ABC123";
  H.referidos = { items: [], proximoCursor: null };
  H.resumen = { invitados: 0, puntosGanados: 0, pendientes: 0 };
});

describe("/puntos", () => {
  it("empezando: sin puntos, sin racha y sin movimientos", async () => {
    expect(await pintar(PuntosPage)).toMatchSnapshot();
  });

  it("a medio camino, racha de uno, con cada motivo del historial y más páginas", async () => {
    H.puntos = 905;
    H.racha = 1;
    const motivos: [string, number, string][] = [
      ["WIN_CHALLENGE", 100, "Salto largo"],
      ["TOP20", 20, "—"],
      ["VIDEOS_PUBLICADOS", 30, "—"],
      ["INVITE_FRIEND", 50, "@bea"],
      ["REGISTERED_WITH_REFERRAL", 50, "—"],
      ["RACHA_7_DIAS", 25, "—"],
      ["VIDEO_50_LIKES", 40, "Mi vídeo"],
      ["ADMIN_AJUSTE", 40, "—"],
      ["ADMIN_AJUSTE", -20, "—"],
      ["RAZON_QUE_NO_EXISTE", 5, "—"],
    ];
    H.historial = {
      items: motivos.map(([razon, delta, referencia], i) => ({
        id: `m${i}`,
        razon,
        delta,
        referencia,
        creadoEnMs: T0 - i * DIA,
      })),
      nextCursor: "c2",
    };
    expect(await pintar(PuntosPage)).toMatchSnapshot();
  });

  it("en el nivel máximo, con racha", async () => {
    H.puntos = 999_999;
    H.racha = 5;
    expect(await pintar(PuntosPage, { cursor: "c1" })).toMatchSnapshot();
  });

  it("la pantalla de error", () => {
    expect(
      render(<ErrorPuntos error={new Error("x")} retry={() => {}} />).container.innerHTML,
    ).toMatchSnapshot();
  });
});

describe("/referidos", () => {
  it("vacío en la primera página, y vacío más adelante", async () => {
    expect(await pintar(ReferidosPage)).toMatchSnapshot("primera");
    expect(await pintar(ReferidosPage, { cursor: "c1" })).toMatchSnapshot("más adelante");
  });

  it("con gente cobrada y pendiente, y pendientes en el resumen", async () => {
    H.resumen = { invitados: 2, puntosGanados: 50, pendientes: 1 };
    H.referidos = {
      items: [
        {
          id: "r1",
          username: "bea",
          displayName: "Bea",
          imagen: null,
          puntos: 100,
          esVip: false,
          colorNombre: null,
          altaMs: T0,
          cobrado: true,
        },
        {
          id: "r2",
          username: "cai",
          displayName: null,
          imagen: null,
          puntos: 0,
          esVip: true,
          colorNombre: null,
          altaMs: T0 - DIA,
          cobrado: false,
        },
      ],
      proximoCursor: "c2",
    };
    expect(await pintar(ReferidosPage)).toMatchSnapshot();
  });

  it("sin enlace (no se pudo cargar el código)", async () => {
    H.codigo = null;
    expect(await pintar(ReferidosPage)).toMatchSnapshot();
  });
});
