/**
 * EL MARCADO DE NOTIFICACIONES, BUSCAR, DESTACADOS, RANKING Y CREAR, FIJADO ANTES DE SACAR SUS TEXTOS
 * (Fase 11 · P5b2a).
 *
 * Las listas vacías y con más páginas, el buscador en cada pestaña y estado (escribiendo, buscando, sin
 * resultados, error, cargando más), el podio con uno, dos y tres puestos, y la ventana de subir un vídeo
 * en todos los pasos que se pueden alcanzar sin red (validación, fichero demasiado grande o largo,
 * miniatura rechazada, permiso denegado, subiendo, fallo, en cola). Se confirmó CONTRA EL CÓDIGO DE
 * ANTES: los snapshots de `__snapshots__/` son ese HTML; después de la extracción tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

type OpcionesTus = {
  onProgress: (subido: number, total: number) => void;
  onError: (e: unknown) => void;
  onSuccess: () => void;
};
const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  postJsonCsrf: vi.fn(),
  tus: null as null | OpcionesTus,
  pagina: { items: [] as unknown[], nextCursor: null as string | null },
  destacados: { items: [] as unknown[], nextCursor: null as string | null },
}));
vi.mock("@/lib/cliente-http", async (original) => ({
  ...(await original<typeof import("../../src/lib/cliente-http")>()),
  getJson: mocks.getJson,
  postJsonCsrf: mocks.postJsonCsrf,
  obtenerCsrfToken: async () => "csrf",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("tus-js-client", () => ({
  Upload: class {
    constructor(_f: unknown, o: OpcionesTus) {
      mocks.tus = o;
    }
    start() {}
    abort() {}
  },
}));
vi.mock("@/server/auth/solo-participante", () => ({ apartarCuentaEmpresa: async () => {} }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: async () => ({ userId: "u1" }) }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/notificaciones", () => ({
  listarNotificaciones: async () => mocks.pagina,
}));
vi.mock("@/server/services/boost-destacados", () => ({
  paginaDestacados: async () => mocks.destacados,
}));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  // La página pide el idioma de los avisos (P5b4); `listarNotificaciones` está simulado y no lo usa.
  idiomaDeTextosDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import BuscarPage from "@/app/(app)/(shell)/buscar/page";
import CrearPage from "@/app/(app)/(shell)/crear/page";
import { ModalSubida } from "@/app/(app)/(shell)/crear/modal-subida";
import DestacadosPage from "@/app/(app)/(shell)/destacados/page";
import NotificacionesPage from "@/app/(app)/(shell)/notificaciones/page";
import { PodioRanking } from "@/app/(app)/(shell)/ranking/podio-ranking";
import { RankingVistas } from "@/app/(app)/(shell)/ranking/ranking-vistas";

type Respuesta = { ok: boolean; status: number; code: string; data: unknown };
const r = (status: number, code = "", data: unknown = {}): Respuesta => ({
  ok: status < 400,
  status,
  code,
  data,
});
const pulsar = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const AHORA = new Date("2026-03-10T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(AHORA);
  mocks.pagina = { items: [], nextCursor: null };
  mocks.destacados = { items: [], nextCursor: null };
  mocks.tus = null;
});
afterEach(() => {
  vi.useRealTimers();
  mocks.getJson.mockReset();
  mocks.postJsonCsrf.mockReset();
  vi.restoreAllMocks();
});

describe("/notificaciones", () => {
  const pintar = async (cursor?: string) =>
    render(
      <>
        {await resolverServidor(
          await NotificacionesPage({ searchParams: Promise.resolve({ cursor }) }),
        )}
      </>,
    ).container.innerHTML;

  it("vacía, vacía al ir hacia atrás, con avisos y con más páginas", async () => {
    // Al verse, la página marca los avisos como leídos: aquí la respuesta no importa.
    mocks.postJsonCsrf.mockResolvedValue(r(200, "", {}));
    expect(await pintar()).toMatchSnapshot("vacía");
    expect(await pintar("c1")).toMatchSnapshot("vacía con cursor");
    mocks.pagina = {
      items: [
        {
          id: "n1",
          href: "/retos",
          texto: "Tu vídeo ya está publicado.",
          leida: false,
          creadaMs: AHORA - 60_000,
        },
        {
          id: "n2",
          href: "/perfil",
          texto: "Has ganado un reto.",
          leida: true,
          creadaMs: AHORA - 3_600_000,
        },
      ],
      nextCursor: "c2",
    };
    expect(await pintar()).toMatchSnapshot("con avisos");
    expect(await pintar("c1")).toMatchSnapshot("con avisos y cursor");
  });
});

describe("/buscar", () => {
  const pagina = async (sp: Record<string, string> = {}) =>
    render(<>{await resolverServidor(await BuscarPage({ searchParams: Promise.resolve(sp) }))}</>)
      .container;
  const buscar = async (c: HTMLElement, q: string) => {
    fireEvent.change(c.querySelector('input[type="search"]')!, { target: { value: q } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
  };

  it("escribiendo, buscando, sin resultados, error y sin conexión", async () => {
    const c = await pagina();
    expect(c.innerHTML).toMatchSnapshot("inicial");
    await buscar(c, "a");
    expect(c.innerHTML).toMatchSnapshot("una letra");
    mocks.getJson.mockReturnValueOnce(new Promise(() => {}));
    await buscar(c, "an");
    expect(c.innerHTML).toMatchSnapshot("buscando");
    mocks.getJson.mockResolvedValueOnce(r(200, "", { items: [], proximoCursor: null }));
    await buscar(c, "ana");
    expect(c.innerHTML).toMatchSnapshot("sin resultados");
    mocks.getJson.mockResolvedValueOnce(r(429, "RATE_LIMITED"));
    await buscar(c, "anab");
    expect(c.innerHTML).toMatchSnapshot("error");
    mocks.getJson.mockRejectedValueOnce(new Error("red"));
    await buscar(c, "anabe");
    expect(c.innerHTML).toMatchSnapshot("sin conexión");
  });

  it("personas, retos con más páginas (cargando) y categorías", async () => {
    const c = await pagina({ q: "", tipo: "usuarios" });
    mocks.getJson.mockResolvedValueOnce(
      r(200, "", {
        items: [
          {
            id: "u1",
            username: "ana",
            displayName: "Ana",
            image: null,
            puntos: 10,
            esVip: false,
            colorNombre: null,
          },
          {
            id: "u2",
            username: "bea",
            displayName: null,
            image: null,
            puntos: 0,
            esVip: true,
            colorNombre: null,
          },
        ],
        proximoCursor: null,
      }),
    );
    await buscar(c, "an");
    expect(c.innerHTML).toMatchSnapshot("personas");
    await pulsar(screen.getByRole("button", { name: "Retos" }));
    mocks.getJson.mockResolvedValueOnce(
      r(200, "", {
        items: [
          {
            id: "r1",
            publicCode: "abc",
            slug: "salto",
            title: "Salto",
            category: "fitness",
            deadline: "2026-04-01",
          },
        ],
        proximoCursor: "c1",
      }),
    );
    await buscar(c, "sal");
    expect(c.innerHTML).toMatchSnapshot("retos");
    mocks.getJson.mockReturnValueOnce(new Promise(() => {}));
    await pulsar(screen.getByRole("button", { name: "Cargar más" }));
    expect(c.innerHTML).toMatchSnapshot("cargando más");
    await pulsar(screen.getByRole("button", { name: "Categorías" }));
    expect(c.innerHTML).toMatchSnapshot("categorías");
  });
});

describe("/destacados", () => {
  const pintar = async (sp: Record<string, string> = {}) =>
    render(
      <>{await resolverServidor(await DestacadosPage({ searchParams: Promise.resolve(sp) }))}</>,
    ).container.innerHTML;

  it("vacía, y con perfiles y más páginas", async () => {
    expect(await pintar()).toMatchSnapshot("vacía");
    mocks.destacados = {
      items: [
        {
          activacionId: "a1",
          userId: "u1",
          username: "ana",
          displayName: "Ana",
          imagen: null,
          puntos: 900,
          destacadoDesdeMs: AHORA - 60_000,
          expiraEnMs: AHORA + 3_000_000,
          esVip: true,
          carril: 0,
          colorNombre: null,
        },
      ],
      nextCursor: "c2",
    };
    expect(await pintar()).toMatchSnapshot("con perfiles");
  });
});

describe("/ranking", () => {
  const fila = (n: number) => ({
    userId: `u${n}`,
    username: `persona${n}`,
    displayName: null,
    image: null,
    victorias: n === 1 ? 1 : 10 - n,
    puntos: 100 * n,
    esVip: false,
    colorNombre: null,
  });

  it("vacía, con lista y más páginas (cargando), y el último reto", async () => {
    const vacia = render(
      <RankingVistas datos={{ mensual: [], cursorInicial: null, reto: null, yo: null }} />,
    );
    expect(vacia.container.innerHTML).toMatchSnapshot("vacía");
    vacia.unmount();

    const { container } = render(
      <RankingVistas
        datos={{
          mensual: [1, 2, 3, 4, 5].map(fila),
          cursorInicial: "c1",
          reto: {
            titulo: "Salto largo",
            codigo: "ABC234",
            top: [
              {
                submissionId: "s1",
                userId: "u2",
                username: "mario",
                image: null,
                votos: 1,
                puesto: 1,
                esVip: false,
                colorNombre: null,
              },
              {
                submissionId: "s2",
                userId: "u3",
                username: "ana",
                image: null,
                votos: 7,
                puesto: 2,
                esVip: false,
                colorNombre: null,
              },
            ],
          },
          yo: "u4",
        }}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot("con lista");
    mocks.getJson.mockReturnValueOnce(new Promise(() => {}));
    await pulsar(screen.getByRole("button", { name: "Ver más" }));
    expect(container.innerHTML).toMatchSnapshot("cargando");
    await pulsar(screen.getByRole("button", { name: "Último reto" }));
    expect(container.innerHTML).toMatchSnapshot("último reto");
  });

  it("el podio con uno, dos y tres", () => {
    for (const n of [1, 2, 3]) {
      const { container, unmount } = render(<PodioRanking top={[1, 2, 3].slice(0, n).map(fila)} />);
      expect(container.innerHTML).toMatchSnapshot(String(n));
      unmount();
    }
  });
});

describe("/crear y la ventana de subir", () => {
  const credencial = {
    libraryId: "l",
    videoId: "v",
    signature: "s",
    expirationTime: 9_999_999_999,
    endpointTus: "https://tus.test",
    videoDbId: "db1",
    esReemplazo: false,
  };
  const dialogo = () => document.querySelector('[role="dialog"]')!.outerHTML;
  const elegirVideo = async (f: File) => {
    await act(async () => {
      fireEvent.change(document.querySelector('input[accept="video/*"]')!, {
        target: { files: [f] },
      });
    });
  };
  const video = (bytes = 1000) => {
    const f = new File(["x"], "salto.mp4", { type: "video/mp4" });
    Object.defineProperty(f, "size", { value: bytes });
    return f;
  };
  /** jsdom no carga vídeo: un `<video>` falso que «lee» la duración que se le diga. */
  const conDuracion = (segundos: number) => {
    const crear = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      (tag: string, o?: ElementCreationOptions) => {
        if (tag !== "video") return crear(tag, o);
        const falso = {
          preload: "",
          duration: segundos,
          onloadedmetadata: null as null | (() => void),
          onerror: null,
          removeAttribute() {},
          load() {},
          set src(_v: string) {
            setTimeout(() => falso.onloadedmetadata?.(), 0);
          },
        };
        return falso as unknown as HTMLElement;
      },
    );
  };
  const titulo = (t: string) =>
    fireEvent.change(document.querySelector("#subida-titulo")!, { target: { value: t } });
  const publicar = async () => {
    await act(async () => {
      fireEvent.submit(document.querySelector('[role="dialog"] form')!);
    });
  };

  it("la página y el lanzador", async () => {
    const c = render(<>{await resolverServidor(await CrearPage())}</>).container;
    expect(c.innerHTML).toMatchSnapshot("página");
    await pulsar(screen.getByRole("button", { name: "Subir un vídeo" }));
    expect(dialogo()).toMatchSnapshot("abierta");
  });

  it("participar: título vacío, sin vídeo, vídeo grande, vídeo largo, y las miniaturas", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
    );
    render(<ModalSubida challengeId="r1" onCerrar={() => {}} />);
    expect(dialogo()).toMatchSnapshot("participar");
    await publicar();
    expect(dialogo()).toMatchSnapshot("título vacío");
    titulo("Mi salto");
    await publicar();
    expect(dialogo()).toMatchSnapshot("sin vídeo");
    await elegirVideo(video(2 * 1024 * 1024 * 1024));
    expect(dialogo()).toMatchSnapshot("grande");
    conDuracion(200);
    await elegirVideo(video());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });
    expect(dialogo()).toMatchSnapshot("largo");
    const mini = document.querySelector<HTMLInputElement>(
      'input[accept="image/jpeg,image/png,image/webp"]',
    )!;
    fireEvent.change(mini, {
      target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] },
    });
    expect(dialogo()).toMatchSnapshot("miniatura tipo");
    const grande = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(grande, "size", { value: 50 * 1024 * 1024 });
    fireEvent.change(mini, { target: { files: [grande] } });
    expect(dialogo()).toMatchSnapshot("miniatura grande");
    fireEvent.change(mini, {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
    expect(dialogo()).toMatchSnapshot("miniatura elegida");
  });

  it("permiso denegado (401, con mensaje, credencial rota)", async () => {
    render(<ModalSubida onCerrar={() => {}} />);
    titulo("Mi salto");
    conDuracion(30);
    await elegirVideo(video());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });
    expect(dialogo()).toMatchSnapshot("con vídeo");
    for (const [nombre, resp] of [
      ["401", r(401)],
      ["con mensaje", r(403, "X", { error: { code: "X", message: "Del servidor." } })],
      ["credencial rota", r(200, "", { videoDbId: "db1" })],
    ] as const) {
      mocks.postJsonCsrf.mockResolvedValueOnce(resp);
      await publicar();
      expect(dialogo()).toMatchSnapshot(nombre);
    }
  });

  it("subiendo, fallo que se reintenta, y en cola con la miniatura rechazada", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
    );
    render(<ModalSubida onCerrar={() => {}} />);
    titulo("Mi salto");
    conDuracion(30);
    await elegirVideo(video());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });
    const mini = document.querySelector<HTMLInputElement>(
      'input[accept="image/jpeg,image/png,image/webp"]',
    )!;
    fireEvent.change(mini, {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
    mocks.postJsonCsrf.mockResolvedValueOnce(r(200, "", credencial));
    await publicar();
    expect(dialogo()).toMatchSnapshot("preparando");
    await act(async () => {
      mocks.tus!.onProgress(450, 1000);
    });
    expect(dialogo()).toMatchSnapshot("subiendo");
    await act(async () => {
      mocks.tus!.onError({ originalResponse: { getStatus: () => 503 } });
    });
    expect(dialogo()).toMatchSnapshot("fallo");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    mocks.getJson.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      mocks.tus!.onSuccess();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });
    expect(dialogo()).toMatchSnapshot("en cola");
  });
});
