/**
 * EL MARCADO DE LOS RETOS DEL PORTAL, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2b).
 *
 * «Mis retos» (sin correo, sin verificar, vacía en sus tres formas, recién enviada, cada estado de una
 * propuesta con y sin motivo, una categoría que no existe, el extracto vacío y con filas, de uno y de
 * varios retos) y «Proponer un reto» (sin correo, sin verificar, y el formulario con cada error, los del
 * servidor y el envío). Se confirmó CONTRA EL CÓDIGO DE ANTES: los snapshots de `__snapshots__/` son ese
 * HTML; después de la extracción tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractoEmpresa } from "../../src/server/services/patrocinios";
import type { SolicitudDeEmpresa } from "../../src/server/services/retos-empresa";
import { resolverServidor } from "../helpers/render-servidor";

const H = vi.hoisted(() => ({
  ambito: null as null | { empresaId: string; estado: string },
  solicitudes: { items: [] as unknown[], nextCursor: null as string | null },
  extracto: null as unknown,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/empresa/retos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/cliente-http", async (original) => ({
  ...(await original<typeof import("../../src/lib/cliente-http")>()),
  obtenerCsrfToken: async () => "csrf",
}));
vi.mock("@/app/(app)/(shell)/empresa/ambito-portal", () => ({
  ambitoDelPortal: async () => H.ambito,
}));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/retos-empresa", () => ({
  misSolicitudesReto: async () => H.solicitudes,
}));
vi.mock("@/server/services/patrocinios", () => ({ extractoDeEmpresa: async () => H.extracto }));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import PaginaProponerReto from "@/app/(app)/(shell)/empresa/retos/nuevo/page";
import PaginaMisRetos from "@/app/(app)/(shell)/empresa/retos/page";

const AHORA = new Date("2026-11-20T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

const solicitud = (cambios: Partial<SolicitudDeEmpresa> = {}): SolicitudDeEmpresa => ({
  id: "s1",
  titulo: "Pan de masa madre",
  categoria: "fitness",
  premioCents: 15000,
  aperturaMs: AHORA.getTime() + DIA,
  cierreMs: AHORA.getTime() + 10 * DIA,
  ganadores: 1,
  estado: "EN_REVISION",
  motivoRechazo: null,
  creadaMs: AHORA.getTime() - DIA,
  reto: null,
  ...cambios,
});
const extracto = (filas: ExtractoEmpresa["filas"], retos = filas.length): ExtractoEmpresa => ({
  filas,
  proximoCursor: null,
  totales: {
    retos,
    premiosCents: 15000 * retos,
    totalCents: 18750 * retos,
    moneda: filas.length > 0 ? "USD" : null,
  },
});
const fila = (id: string, cerrado: boolean): ExtractoEmpresa["filas"][number] => ({
  id,
  titulo: `Reto ${id}`,
  premioCents: 15000,
  totalCents: 18750,
  moneda: "USD",
  cerrado,
  deadlineMs: AHORA.getTime() + DIA,
});

const pintar = async (nodo: React.ReactNode) =>
  render(<>{await resolverServidor(nodo)}</>).container;
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const lista = (o: Record<string, string> = {}) => PaginaMisRetos({ searchParams: sp(o) });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  H.ambito = { empresaId: "e1", estado: "VERIFICADA" };
  H.solicitudes = { items: [], nextCursor: null };
  H.extracto = extracto([]);
});
afterEach(() => vi.unstubAllGlobals());

describe("/empresa/retos", () => {
  it("sin correo verificado", async () => {
    H.ambito = null;
    expect((await pintar(await lista())).innerHTML).toMatchSnapshot();
  });

  it("vacía, verificada", async () => {
    expect((await pintar(await lista())).innerHTML).toMatchSnapshot();
  });

  it("vacía, sin verificar", async () => {
    H.ambito = { empresaId: "e1", estado: "PENDIENTE" };
    expect((await pintar(await lista())).innerHTML).toMatchSnapshot();
  });

  it("vacía en una página posterior, recién enviada", async () => {
    expect((await pintar(await lista({ cursor: "c2", enviada: "1" }))).innerHTML).toMatchSnapshot();
  });

  it("con una propuesta en cada estado y un extracto de varios retos", async () => {
    H.solicitudes = {
      items: [
        solicitud({ id: "a" }),
        solicitud({ id: "b", estado: "RECHAZADA", motivoRechazo: "FECHAS_NO_VIABLES" }),
        solicitud({ id: "c", estado: "RECHAZADA", motivoRechazo: "PREMIO_NO_ADECUADO" }),
        solicitud({ id: "d", estado: "RECHAZADA", motivoRechazo: "CONTENIDO_NO_PERMITIDO" }),
        solicitud({ id: "e", estado: "RECHAZADA", motivoRechazo: "DATOS_INSUFICIENTES" }),
        solicitud({ id: "f", estado: "RECHAZADA", motivoRechazo: "DUPLICADA" }),
        solicitud({ id: "g", estado: "CADUCADA", categoria: "no-existe" }),
        solicitud({ id: "h", estado: "APROBADA" }),
        solicitud({ id: "i", estado: "PUBLICADA", reto: { publicCode: "AB12", slug: "pan" } }),
      ],
      nextCursor: "c2",
    };
    H.extracto = extracto([fila("x", true), fila("y", false)]);
    expect((await pintar(await lista())).innerHTML).toMatchSnapshot();
  });

  it("el extracto de un solo reto", async () => {
    H.extracto = extracto([fila("x", false)]);
    const c = await pintar(await lista());
    expect(c.querySelector('section[aria-labelledby="extracto"]')!.outerHTML).toMatchSnapshot();
  });
});

describe("/empresa/retos/nuevo", () => {
  it("sin correo verificado", async () => {
    H.ambito = null;
    expect((await pintar(await PaginaProponerReto())).innerHTML).toMatchSnapshot();
  });

  it("sin verificar la empresa", async () => {
    H.ambito = { empresaId: "e1", estado: "PENDIENTE" };
    expect((await pintar(await PaginaProponerReto())).innerHTML).toMatchSnapshot();
  });

  it("verificada: el formulario, cada error y el envío", async () => {
    const c = await pintar(await PaginaProponerReto());
    expect(c.innerHTML).toMatchSnapshot("la página");
    const form = () => c.querySelector("form")!;
    const escribir = (id: string, v: string) =>
      fireEvent.change(c.querySelector(`#${id}`)!, { target: { value: v } });
    const enviar = async () => {
      await act(async () => {
        fireEvent.submit(form());
      });
    };
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("título corto");
    escribir("title", "Pan de masa madre");
    escribir("premio", "abc");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("premio no válido");
    escribir("premio", "50");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("faltan las fechas");
    escribir("startsAt", "2026-12-10T10:00");
    escribir("deadline", "2026-12-01T10:00");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("cierre antes de la apertura");
    escribir("startsAt", "2026-11-01T10:00");
    escribir("deadline", "2026-11-02T10:00");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("cierre en el pasado");
    escribir("startsAt", "2026-12-01T10:00");
    escribir("deadline", "2026-12-10T10:00");
    for (const [nombre, respuesta] of [
      [
        "con mensaje",
        { ok: false, json: async () => ({ error: { code: "X", message: "Del servidor." } }) },
      ],
      ["sin mensaje", { ok: false, json: async () => ({}) }],
      ["sin conexión", null],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        respuesta === null
          ? vi.fn().mockRejectedValue(new Error("red"))
          : vi.fn().mockResolvedValue(respuesta),
      );
      await enviar();
      expect(form().outerHTML).toMatchSnapshot(nombre);
    }
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("enviando");
  });
});
