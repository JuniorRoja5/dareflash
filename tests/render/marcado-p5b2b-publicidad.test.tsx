/**
 * EL MARCADO DE LA PUBLICIDAD DEL PORTAL, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2b).
 *
 * La lista (vacía en sus tres formas, con campañas, sin verificar), «Nueva campaña» (sin correo, sin
 * verificar, tipo fuera del catálogo, negocio local y online), el formulario (cada alcance, cada error de
 * lo que falta, la barra del coste con y sin saldo, el aviso de muchos países, los errores del servidor),
 * el buscador de ciudad en cada estado, la ficha en cada estado (estimación en sus cuatro formas, motivo
 * de retirada, informe con días y sin ellos) y sus acciones (confirmar, zona llena, errores). Se confirmó
 * CONTRA EL CÓDIGO DE ANTES: los snapshots de `__snapshots__/` son ese HTML; después tiene que dar igual.
 *
 * La FECHA va congelada: la hora a la que empieza cada día de campaña depende del horario de verano.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MiEmpresa } from "../../src/server/services/empresas";
import type { CampanaDeEmpresa, Estimacion } from "../../src/server/services/publicidad";
import type { InformeDeCampana } from "../../src/server/services/publicidad-metricas";
import { resolverServidor } from "../helpers/render-servidor";

const H = vi.hoisted(() => ({
  ambito: null as null | { empresaId: string; estado: string },
  empresa: null as unknown,
  lista: { items: [] as unknown[], nextCursor: null as string | null },
  saldo: { saldo: 0, comprometido: 0 },
  campana: null as unknown,
  estimacion: null as unknown,
  informe: null as unknown,
  regiones: [] as { codigo: string; nombre: string }[],
  catalogo: new Set<string>(),
  getJson: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  post: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
  del: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));
vi.mock("@/lib/cliente-http", async (original) => {
  const { vi: v } = await import("vitest");
  H.getJson = v.fn();
  H.post = v.fn();
  H.del = v.fn();
  return {
    ...(await original<typeof import("../../src/lib/cliente-http")>()),
    getJson: H.getJson,
    postJsonCsrf: H.post,
    delCsrf: H.del,
    obtenerCsrfToken: async () => "csrf",
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/empresa/publicidad",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/app/(app)/(shell)/empresa/ambito-portal", () => ({
  ambitoDelPortal: async () => H.ambito,
}));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/empresas", () => ({ miEmpresa: async () => H.empresa }));
vi.mock("@/server/services/publicidad", () => ({
  misPublicidades: async () => H.lista,
  saldoCreditosDe: async () => H.saldo,
  miPublicidad: async () => H.campana,
  estimacionDeMiPublicidad: async () => H.estimacion,
  paisesDelCatalogo: async () => H.catalogo,
  regionesDePais: async () => H.regiones,
}));
vi.mock("@/server/services/publicidad-metricas", () => ({
  informeDeMiCampana: async () => H.informe,
}));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import { InformeCampana } from "@/app/(app)/(shell)/empresa/publicidad/[id]/informe-campana";
import PaginaCampana from "@/app/(app)/(shell)/empresa/publicidad/[id]/page";
import PaginaNuevaCampana from "@/app/(app)/(shell)/empresa/publicidad/nueva/page";
import PaginaPublicidad from "@/app/(app)/(shell)/empresa/publicidad/page";

type Respuesta = { ok: boolean; status: number; code: string; data: unknown };
const r = (status: number, data: unknown = {}, code = ""): Respuesta => ({
  ok: status < 400,
  status,
  code,
  data,
});
const conMensaje = (status: number, code = "X") =>
  r(status, { error: { code, message: "Del servidor." } }, code);

const AHORA = new Date("2026-11-20T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;
const HOY = Date.UTC(2026, 10, 20);

const empresa = (cambios: Partial<MiEmpresa> = {}): MiEmpresa => ({
  id: "e1",
  nombre: "Bar Ana",
  tipoCuenta: "EMPRESA",
  tipoNegocio: "FISICO",
  estado: "VERIFICADA",
  paisIso: "ES",
  ciudadTexto: null,
  personaContacto: "Ana",
  webUrl: null,
  redes: null,
  direccion: null,
  motivoRechazo: null,
  creadaMs: HOY - 30 * DIA,
  verificadaMs: HOY - 20 * DIA,
  ...cambios,
});
const campana = (cambios: Partial<CampanaDeEmpresa> = {}): CampanaDeEmpresa => ({
  id: "campana0000001",
  nombre: "Pan de masa madre",
  estado: "BORRADOR",
  alcance: "CIUDAD",
  zona: "Sevilla y alrededores",
  texto: "El mejor pan del barrio",
  destinoUrl: "https://bar.test",
  imagen: null,
  inicioMs: HOY + 2 * DIA,
  finMs: null,
  diasContratados: 7,
  diasTenidos: 0,
  creditosPorDia: 1,
  creadaMs: HOY - DIA,
  motivoRetirada: null,
  ...cambios,
});
const informe = (dias: InformeDeCampana["dias"]): InformeDeCampana => ({
  totales: { vistas: 1234, clics: 25 },
  dias,
  nextCursor: dias.length > 0 ? "2026-11-18" : null,
});

// El informe es de servidor y SÍNCRONO, con la paginación (asíncrona) dentro: se llama también.
const pintar = async (nodo: React.ReactNode) =>
  render(<>{await resolverServidor(nodo, { tambien: [InformeCampana] })}</>).container;
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const ficha = () =>
  PaginaCampana({ params: Promise.resolve({ id: "campana0000001" }), searchParams: sp() });
const escribir = (c: HTMLElement, sel: string, valor: string) =>
  fireEvent.change(c.querySelector(sel)!, { target: { value: valor } });

// Los ids de `useId` (`_r_2_`) cuentan los renders de TODO el fichero: se igualan, para que el marcado
// fijado no cambie al añadir o quitar un caso.
expect.addSnapshotSerializer({
  test: (v) => typeof v === "string" && /_r_[0-9a-z]+_/.test(v),
  serialize: (v: string) => `"${v.replace(/_r_[0-9a-z]+_/g, "_id_")}"`,
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  H.ambito = { empresaId: "e1", estado: "VERIFICADA" };
  H.empresa = empresa();
  H.lista = { items: [], nextCursor: null };
  H.saldo = { saldo: 0, comprometido: 0 };
  H.campana = campana();
  H.estimacion = null;
  H.informe = null;
  H.regiones = [
    { codigo: "AN", nombre: "Andalucía" },
    { codigo: "MD", nombre: "Madrid" },
  ];
  H.catalogo = new Set(["ES", "PT", "FR", "IT"]);
});
afterEach(() => {
  H.getJson.mockReset();
  H.post.mockReset();
  H.del.mockReset();
  vi.unstubAllGlobals();
});

describe("/empresa/publicidad", () => {
  it("sin correo verificado", async () => {
    H.ambito = null;
    expect(
      (await pintar(await PaginaPublicidad({ searchParams: sp() }))).innerHTML,
    ).toMatchSnapshot();
  });

  it("vacía, verificada y con saldo de uno", async () => {
    H.saldo = { saldo: 1, comprometido: 0 };
    expect(
      (await pintar(await PaginaPublicidad({ searchParams: sp() }))).innerHTML,
    ).toMatchSnapshot();
  });

  it("vacía, sin verificar", async () => {
    H.ambito = { empresaId: "e1", estado: "PENDIENTE" };
    expect(
      (await pintar(await PaginaPublicidad({ searchParams: sp() }))).innerHTML,
    ).toMatchSnapshot();
  });

  it("vacía en una página posterior", async () => {
    expect(
      (await pintar(await PaginaPublicidad({ searchParams: sp({ cursor: "c2" }) }))).innerHTML,
    ).toMatchSnapshot();
  });

  it("con campañas (borrador de un día y de varios, activa) y saldo comprometido", async () => {
    H.saldo = { saldo: 90, comprometido: 20 };
    H.lista = {
      items: [
        campana({ id: "c1", diasContratados: 1 }),
        campana({ id: "c2", nombre: "Otra", diasContratados: 5 }),
        campana({
          id: "c3",
          estado: "ACTIVA",
          inicioMs: HOY - 2 * DIA,
          finMs: HOY + 4 * DIA,
          creditosPorDia: 2,
        }),
      ],
      nextCursor: "c4",
    };
    expect(
      (await pintar(await PaginaPublicidad({ searchParams: sp() }))).innerHTML,
    ).toMatchSnapshot();
  });
});

describe("/empresa/publicidad/nueva", () => {
  it("sin correo verificado", async () => {
    H.ambito = null;
    expect((await pintar(await PaginaNuevaCampana())).innerHTML).toMatchSnapshot();
  });

  it("sin verificar la empresa (negocio online)", async () => {
    H.ambito = { empresaId: "e1", estado: "PENDIENTE" };
    H.empresa = empresa({ tipoNegocio: "ONLINE" });
    expect((await pintar(await PaginaNuevaCampana())).innerHTML).toMatchSnapshot();
  });

  it("con un tipo de negocio fuera del catálogo", async () => {
    H.empresa = empresa({ tipoNegocio: null });
    expect((await pintar(await PaginaNuevaCampana())).innerHTML).toMatchSnapshot();
  });

  it("un negocio local", async () => {
    H.saldo = { saldo: 30, comprometido: 0 };
    expect((await pintar(await PaginaNuevaCampana())).innerHTML).toMatchSnapshot();
  });

  it("un negocio online de un país con varias zonas (el día empieza la víspera)", async () => {
    H.empresa = empresa({ tipoNegocio: "ONLINE", paisIso: "BR" });
    expect((await pintar(await PaginaNuevaCampana())).innerHTML).toMatchSnapshot();
  });

  it("un negocio local de un país sin zona conocida, víspera en hora local", async () => {
    H.empresa = empresa({ paisIso: "CO" });
    expect((await pintar(await PaginaNuevaCampana())).innerHTML).toMatchSnapshot();
  });

  it("un negocio online", async () => {
    H.empresa = empresa({ tipoNegocio: "MARCA_O_DIGITAL" });
    H.saldo = { saldo: 30, comprometido: 10 };
    expect((await pintar(await PaginaNuevaCampana())).innerHTML).toMatchSnapshot();
  });
});

describe("el formulario de campaña", () => {
  it("local: lo que falta, la región, el coste y no llegar", async () => {
    H.saldo = { saldo: 5, comprometido: 2 };
    const c = await pintar(await PaginaNuevaCampana());
    const form = () => c.querySelector("form")!;
    const enviar = async () => {
      await act(async () => {
        fireEvent.submit(form());
      });
    };
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("falta la ciudad");
    fireEvent.click(c.querySelector('input[value="ESTADO"]')!);
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("falta la región");
    escribir(c, "#region", "AN");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("falta el nombre");
    escribir(c, "#nombre", "Pan");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("falta el texto");
    escribir(c, "#texto", "El mejor pan");
    escribir(c, "#destino", "bar");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("enlace no válido");
    escribir(c, "#destino", "https://bar.test");
    escribir(c, "#dias", "0");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("días fuera de rango");
    escribir(c, "#dias", "7");
    await enviar();
    expect(form().outerHTML).toMatchSnapshot("falta la imagen (y no le llega)");
  });

  it("online: países, el aviso de Todo el mundo y el envío", async () => {
    H.empresa = empresa({ tipoNegocio: "ONLINE" });
    H.saldo = { saldo: 500, comprometido: 0 };
    const c = await pintar(await PaginaNuevaCampana());
    const form = () => c.querySelector("form")!;
    await act(async () => {
      fireEvent.submit(form());
    });
    expect(form().outerHTML).toMatchSnapshot("falta un país");
    for (const iso of ["ES", "PT", "FR"]) {
      escribir(c, "#pais-anadir", iso);
      fireEvent.click([...c.querySelectorAll("button")].find((b) => b.textContent === "Añadir")!);
    }
    expect(form().outerHTML).toMatchSnapshot("tres países");
    escribir(c, "#nombre", "Pan");
    escribir(c, "#texto", "El mejor pan");
    escribir(c, "#destino", "https://bar.test");
    fireEvent.change(c.querySelector("#imagen")!, {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
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
      await act(async () => {
        fireEvent.submit(form());
      });
      expect(form().outerHTML).toMatchSnapshot(nombre);
    }
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    await act(async () => {
      fireEvent.submit(form());
    });
    expect(form().outerHTML).toMatchSnapshot("creando");
  });
});

describe("el buscador de ciudad", () => {
  const esperar = () =>
    act(async () => {
      await new Promise((ok) => setTimeout(ok, 300));
    });

  it("al empezar, buscando, sin resultados, con error y elegida", async () => {
    const c = await pintar(await PaginaNuevaCampana());
    const caja = () => c.querySelector('[role="combobox"]')!.parentElement!;
    expect(caja().outerHTML).toMatchSnapshot("al empezar");
    H.getJson.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.change(c.querySelector('[role="combobox"]')!, { target: { value: "Se" } });
    await esperar();
    expect(caja().outerHTML).toMatchSnapshot("buscando");
    H.getJson.mockResolvedValueOnce({ ok: true, status: 200, code: "", data: { items: [] } });
    fireEvent.change(c.querySelector('[role="combobox"]')!, { target: { value: "Sev" } });
    await esperar();
    expect(caja().outerHTML).toMatchSnapshot("sin resultados");
    H.getJson.mockResolvedValueOnce({ ok: false, status: 500, code: "", data: {} });
    fireEvent.change(c.querySelector('[role="combobox"]')!, { target: { value: "Sevi" } });
    await esperar();
    expect(caja().outerHTML).toMatchSnapshot("error");
    H.getJson.mockResolvedValueOnce({
      ok: true,
      status: 200,
      code: "",
      data: { items: [{ id: 7, etiqueta: "Sevilla, Andalucía, España" }] },
    });
    fireEvent.change(c.querySelector('[role="combobox"]')!, { target: { value: "Sevil" } });
    await esperar();
    expect(caja().outerHTML).toMatchSnapshot("con opciones");
    fireEvent.mouseDown(c.querySelector('[role="option"]')!);
    expect(caja().outerHTML).toMatchSnapshot("elegida");
  });
});

describe("/empresa/publicidad/[id]", () => {
  it("sin correo verificado", async () => {
    H.ambito = null;
    expect((await pintar(await ficha())).innerHTML).toMatchSnapshot();
  });

  const casos: [string, Partial<CampanaDeEmpresa>, Estimacion | null, boolean][] = [
    ["borrador con estimación de zona", {}, { tipo: "zona", personas: 1234 }, false],
    [
      "borrador que empieza hoy, menos de una persona",
      { inicioMs: HOY },
      { tipo: "zona", personas: 0 },
      false,
    ],
    [
      "programada",
      { estado: "PROGRAMADA", inicioMs: HOY + 2 * DIA, finMs: HOY + 8 * DIA, diasTenidos: 7 },
      null,
      false,
    ],
    [
      "activa con informe",
      {
        estado: "ACTIVA",
        inicioMs: HOY - 2 * DIA,
        finMs: HOY + 4 * DIA,
        diasTenidos: 7,
        creditosPorDia: 2,
      },
      null,
      true,
    ],
    [
      "pausada con estimación de respaldo",
      { estado: "PAUSADA", inicioMs: HOY - 2 * DIA, finMs: HOY + 4 * DIA, diasTenidos: 3 },
      { tipo: "respaldo", zonaSinDatos: "Sevilla", nivelNombre: "Andalucía", personas: 300 },
      false,
    ],
    [
      "en revisión, sin datos",
      {
        estado: "EN_REVISION",
        inicioMs: HOY - 2 * DIA,
        finMs: HOY + 4 * DIA,
        diasTenidos: 3,
        alcance: "ESTADO",
      },
      { tipo: "sin-datos", zonaSinDatos: "Andalucía" },
      false,
    ],
    [
      "finalizada",
      {
        estado: "FINALIZADA",
        inicioMs: HOY - 9 * DIA,
        finMs: HOY - 2 * DIA,
        diasTenidos: 7,
        alcance: "PAIS",
      },
      null,
      true,
    ],
    [
      "terminada",
      {
        estado: "TERMINADA",
        inicioMs: HOY - 9 * DIA,
        finMs: HOY - 6 * DIA,
        diasTenidos: 3,
        alcance: "GLOBAL",
      },
      null,
      false,
    ],
    [
      "retirada con su motivo",
      {
        estado: "RETIRADA",
        inicioMs: HOY - 9 * DIA,
        finMs: HOY - 6 * DIA,
        diasTenidos: 3,
        motivoRetirada: "El anuncio engaña.",
      },
      null,
      false,
    ],
  ];
  it.each(casos)("%s", async (_n, cambios, estimacion, conInforme) => {
    H.saldo = { saldo: 40, comprometido: 5 };
    H.campana = campana(cambios);
    H.estimacion = estimacion;
    H.informe = conInforme
      ? informe([
          { dia: "2026-11-20", vistas: 1, clics: 1 },
          { dia: "2026-11-19", vistas: 300, clics: 0 },
          { dia: "2026-11-18", vistas: 0, clics: 0 },
        ])
      : informe([]);
    expect((await pintar(await ficha())).innerHTML).toMatchSnapshot();
  });

  it("el informe vacío en una página posterior", async () => {
    H.campana = campana({
      estado: "ACTIVA",
      inicioMs: HOY - 2 * DIA,
      finMs: HOY + 4 * DIA,
      diasTenidos: 7,
    });
    H.informe = informe([]);
    const c = await pintar(
      await PaginaCampana({
        params: Promise.resolve({ id: "campana0000001" }),
        searchParams: sp({ cursor: "2026-11-10" }),
      }),
    );
    expect(c.querySelector('section[aria-labelledby="resultados"]')!.outerHTML).toMatchSnapshot();
  });
});

describe("las acciones de la campaña", () => {
  it("activar: zona llena con fecha, error con y sin mensaje, sin conexión y en curso", async () => {
    const c = await pintar(await ficha());
    const caja = () =>
      [...c.querySelectorAll("h2")].find((h) => h.textContent === "Qué quieres hacer")!
        .parentElement!;
    const boton = (t: string) =>
      [...caja().querySelectorAll("button")].find((b) => b.textContent === t)!;
    expect(caja().outerHTML).toMatchSnapshot("borrador");
    H.post.mockResolvedValueOnce(
      r(
        409,
        { error: { code: "ZONA_LLENA", message: "Del servidor." }, primeraLibre: "2026-12-01" },
        "ZONA_LLENA",
      ),
    );
    await act(async () => {
      fireEvent.click(boton("Programar"));
    });
    expect(caja().outerHTML).toMatchSnapshot("zona llena");
    for (const [nombre, preparar] of [
      ["con mensaje", () => H.post.mockResolvedValueOnce(conMensaje(400))],
      ["sin mensaje", () => H.post.mockResolvedValueOnce(r(500))],
      ["sin conexión", () => H.post.mockRejectedValueOnce(new Error("red"))],
    ] as const) {
      preparar();
      await act(async () => {
        fireEvent.click(boton("Programar"));
      });
      expect(caja().outerHTML).toMatchSnapshot(nombre);
    }
    H.post.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(boton("Programar"));
    });
    expect(caja().outerHTML).toMatchSnapshot("en curso");
  });

  it("terminar y borrar piden confirmación (y sin ella no hacen nada)", async () => {
    const confirmar = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirmar);
    H.campana = campana({
      estado: "ACTIVA",
      inicioMs: HOY - 2 * DIA,
      finMs: HOY + 4 * DIA,
      diasTenidos: 7,
    });
    H.informe = informe([]);
    const c = await pintar(await ficha());
    const caja = () =>
      [...c.querySelectorAll("h2")].find((h) => h.textContent === "Qué quieres hacer")!
        .parentElement!;
    expect(caja().outerHTML).toMatchSnapshot("activa");
    await act(async () => {
      fireEvent.click(
        [...caja().querySelectorAll("button")].find((b) => b.textContent === "Terminar ya")!,
      );
    });
    H.campana = campana();
    const b = await pintar(await ficha());
    await act(async () => {
      fireEvent.click(
        [...b.querySelectorAll("button")].find((x) => x.textContent === "Borrar borrador")!,
      );
    });
    expect(confirmar.mock.calls).toMatchSnapshot("las preguntas");
    expect(H.post).not.toHaveBeenCalled();
    expect(H.del).not.toHaveBeenCalled();
  });

  it("pausada: reanudar", async () => {
    H.campana = campana({
      estado: "PAUSADA",
      inicioMs: HOY - 2 * DIA,
      finMs: HOY + 4 * DIA,
      diasTenidos: 3,
    });
    H.informe = informe([]);
    const c = await pintar(await ficha());
    const caja = [...c.querySelectorAll("h2")].find(
      (h) => h.textContent === "Qué quieres hacer",
    )!.parentElement!;
    expect(caja.outerHTML).toMatchSnapshot();
  });
});
