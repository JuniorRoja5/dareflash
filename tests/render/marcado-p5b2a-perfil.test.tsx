/**
 * EL MARCADO DEL PERFIL, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2a).
 *
 * El perfil (propio, de otra persona, VIP, con racha), su rejilla de vídeos (vacía, con más páginas), la
 * celda de cada estado de un vídeo, el diálogo de borrar y la pantalla de editar (sin sesión, y sus tres
 * formularios: perfil y foto, correo, contraseña) con los mensajes que solo salen al pulsar. Se confirmó
 * CONTRA EL CÓDIGO DE ANTES: los snapshots de `__snapshots__/` son ese HTML; después de la extracción
 * tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

const mocks = vi.hoisted(() => ({
  getJson: vi.fn(),
  delCsrf: vi.fn(),
  postJsonCsrf: vi.fn(),
  patchJsonCsrf: vi.fn(),
  usuario: null as null | { userId: string },
  perfil: null as null | Record<string, unknown>,
}));
vi.mock("@/lib/cliente-http", async (original) => ({
  ...(await original<typeof import("../../src/lib/cliente-http")>()),
  getJson: mocks.getJson,
  delCsrf: mocks.delCsrf,
  postJsonCsrf: mocks.postJsonCsrf,
  patchJsonCsrf: mocks.patchJsonCsrf,
  obtenerCsrfToken: async () => "csrf",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/perfil",
  useSearchParams: () => new URLSearchParams(),
}));
// Igual que en `vip-perfil`: el bloque del perfil propio monta un componente de SERVIDOR que en jsdom
// suspende y dejaría el contenedor vacío.
vi.mock("@/components/ui/conmutador-tema-servidor", () => ({
  ConmutadorTemaServidor: () => <button type="button">Tema</button>,
}));
vi.mock("@/server/auth/solo-participante", () => ({ apartarCuentaEmpresa: async () => {} }));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: async () => mocks.usuario }));
vi.mock("@/server/db/client", () => ({
  prisma: { user: { findUnique: async () => mocks.perfil } },
}));

import EditarPerfilPage from "@/app/(app)/(shell)/perfil/editar/page";
import { BorrarVideo } from "@/app/(app)/(shell)/perfil/borrar-video";
import { CeldaVideo } from "@/app/(app)/(shell)/perfil/celda-video";
import { PerfilVista } from "@/app/(app)/(shell)/perfil/perfil-vista";
import { RejillaVideos } from "@/app/(app)/(shell)/perfil/rejilla-videos";

type Respuesta = { ok: boolean; status: number; code: string; data: unknown };
const r = (status: number, code = "", data: unknown = {}): Respuesta => ({
  ok: status < 400,
  status,
  code,
  data,
});
const conMensaje = (status: number) =>
  r(status, "X", { error: { code: "X", message: "Del servidor." } });
const pulsar = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const enviar = async (form: HTMLElement) => {
  await act(async () => {
    fireEvent.submit(form);
  });
};
const escribir = (el: Element, valor: string) => fireEvent.change(el, { target: { value: valor } });

beforeEach(() => {
  mocks.usuario = null;
  mocks.perfil = null;
});
afterEach(() => {
  for (const m of [mocks.getJson, mocks.delCsrf, mocks.postJsonCsrf, mocks.patchJsonCsrf])
    m.mockReset();
  vi.unstubAllGlobals();
});

const BASE = {
  displayName: "Ana Ríos",
  handle: "ana",
  imagen: null,
  bio: "Hago retos.",
  website: "https://www.ana.test/x",
  instagram: "ana_ig",
  youtube: "anayt",
  puntos: 4200,
  retosGanados: 2,
  totalVideos: 3,
  videos: [],
  idioma: "es" as const,
  videosUrl: "/api/perfil/videos",
};
const pintarPerfil = async (props: Parameters<typeof PerfilVista>[0]) =>
  render(<>{await resolverServidor(<PerfilVista {...props} />)}</>).container.innerHTML;

describe("el perfil", () => {
  it("propio (con racha de 5 y de 1), propio VIP, ajeno con toque y ajeno VIP sin enlaces", async () => {
    expect(await pintarPerfil({ ...BASE, esPropio: true, racha: 5 })).toMatchSnapshot("propio");
    expect(await pintarPerfil({ ...BASE, esPropio: true, racha: 1 })).toMatchSnapshot("racha 1");
    expect(await pintarPerfil({ ...BASE, esPropio: true, esVip: true })).toMatchSnapshot("vip");
    expect(
      await pintarPerfil({ ...BASE, esPropio: false, puedeTocar: true, userId: "u1" }),
    ).toMatchSnapshot("ajeno");
    expect(
      await pintarPerfil({
        ...BASE,
        displayName: null,
        bio: null,
        website: null,
        instagram: null,
        youtube: null,
        esPropio: false,
        esVip: true,
      }),
    ).toMatchSnapshot("ajeno vip");
  });
});

describe("la rejilla y sus celdas", () => {
  it("vacía (propia y ajena) y con más páginas, cargando", async () => {
    for (const esPropio of [true, false]) {
      const { container, unmount } = render(
        <RejillaVideos inicial={[]} cursorInicial={null} url="/x" esPropio={esPropio} />,
      );
      expect(container.innerHTML).toMatchSnapshot(esPropio ? "vacía propia" : "vacía ajena");
      unmount();
    }
    mocks.getJson.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <RejillaVideos
        inicial={[{ id: "v1", title: "Uno", poster: "p.jpg", categoria: "humor" }]}
        cursorInicial="c1"
        url="/x"
        esPropio={false}
      />,
    );
    expect(container.innerHTML).toMatchSnapshot("con más");
    await pulsar(screen.getByRole("button", { name: "Ver más vídeos" }));
    expect(container.innerHTML).toMatchSnapshot("cargando");
  });

  it("cada estado de un vídeo, y el publicado con y sin título", () => {
    const estados = [
      "procesando",
      "publicado",
      "demasiado-largo",
      "no-disponible",
      "error",
    ] as const;
    for (const estado of estados) {
      const { container, unmount } = render(
        <CeldaVideo
          video={{ id: "v", title: null, poster: estado === "publicado" ? "p.jpg" : "", estado }}
          esPropio
        />,
      );
      expect(container.innerHTML).toMatchSnapshot(estado);
      unmount();
    }
    const { container } = render(
      <CeldaVideo video={{ id: "v", title: "Mi salto", poster: "p.jpg" }} />,
    );
    expect(container.innerHTML).toMatchSnapshot("con título");
  });
});

describe("borrar un vídeo", () => {
  it("el botón (con y sin título), el diálogo y sus errores", async () => {
    const sinTitulo = render(<BorrarVideo videoId="v1" titulo={null} />);
    expect(sinTitulo.container.innerHTML).toMatchSnapshot("sin título");
    sinTitulo.unmount();

    render(<BorrarVideo videoId="v1" titulo="Mi salto" />);
    await pulsar(screen.getByRole("button"));
    const dialogo = () => document.querySelector('[role="dialog"]')!.outerHTML;
    expect(dialogo()).toMatchSnapshot("diálogo");
    for (const [nombre, preparar] of [
      ["401", () => mocks.delCsrf.mockResolvedValueOnce(r(401))],
      ["500", () => mocks.delCsrf.mockResolvedValueOnce(r(500))],
      ["sin sesión", () => mocks.delCsrf.mockRejectedValueOnce(new Error("SIN_SESION"))],
      ["sin conexión", () => mocks.delCsrf.mockRejectedValueOnce(new Error("red"))],
    ] as const) {
      preparar();
      await pulsar(screen.getByRole("button", { name: "Borrar" }));
      expect(dialogo()).toMatchSnapshot(nombre);
    }
    mocks.delCsrf.mockReturnValueOnce(new Promise(() => {}));
    await pulsar(screen.getByRole("button", { name: "Borrar" }));
    expect(dialogo()).toMatchSnapshot("borrando");
  });
});

describe("/perfil/editar", () => {
  it("sin sesión", async () => {
    const c = render(<>{await resolverServidor(await EditarPerfilPage())}</>).container;
    expect(c.innerHTML).toMatchSnapshot();
  });

  it("con sesión: la pantalla entera, con un cambio de correo pendiente", async () => {
    mocks.usuario = { userId: "u1" };
    mocks.perfil = {
      email: "ana@x.test",
      emailPendiente: "nueva@x.test",
      displayName: "Ana",
      username: "ana",
      image: null,
      bio: "",
      website: "",
      instagram: "",
      youtube: "",
      pointsBalance: 600,
    };
    const c = render(<>{await resolverServidor(await EditarPerfilPage())}</>).container;
    expect(c.innerHTML).toMatchSnapshot();
  });

  async function pantalla(): Promise<HTMLElement> {
    mocks.usuario = { userId: "u1" };
    mocks.perfil = {
      email: "ana@x.test",
      emailPendiente: null,
      displayName: "Ana",
      username: "ana",
      image: "https://cdn.test/a.webp",
      bio: "",
      website: "",
      instagram: "",
      youtube: "",
      pointsBalance: 600,
    };
    return render(<>{await resolverServidor(await EditarPerfilPage())}</>).container;
  }

  it("el formulario del perfil: validación, cada error del servidor y guardado", async () => {
    const c = await pantalla();
    const form = c.querySelectorAll("form")[0]!;
    escribir(form.querySelector("#perfil-nombre")!, "!");
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("nombre inválido");
    escribir(form.querySelector("#perfil-nombre")!, "Ana");
    escribir(form.querySelector("#perfil-username")!, "A");
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("usuario inválido");
    escribir(form.querySelector("#perfil-username")!, "ana");
    for (const [nombre, resp] of [
      ["401", r(401)],
      ["ocupado", r(409, "USERNAME_TAKEN")],
      ["429", r(429)],
      ["otro con mensaje", conMensaje(400)],
      ["otro sin mensaje", r(500)],
    ] as const) {
      mocks.patchJsonCsrf.mockResolvedValueOnce(resp);
      await enviar(form);
      expect(form.outerHTML).toMatchSnapshot(nombre);
      escribir(form.querySelector("#perfil-username")!, "ana");
    }
    mocks.patchJsonCsrf.mockRejectedValueOnce(new Error("SIN_SESION"));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("sin sesión");
    mocks.patchJsonCsrf.mockRejectedValueOnce(new Error("red"));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("sin conexión");
    mocks.patchJsonCsrf.mockResolvedValueOnce(r(200, "", { displayName: "Ana", username: "ana" }));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("guardado");
  });

  it("la foto: tipo, tamaño, y cada respuesta al subir", async () => {
    const c = await pantalla();
    const seccion = () => c.querySelector("section")!.outerHTML;
    const input = c.querySelector<HTMLInputElement>("#avatar-file")!;
    const elegir = (f: File) => fireEvent.change(input, { target: { files: [f] } });
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
    );
    elegir(new File(["x"], "a.gif", { type: "image/gif" }));
    expect(seccion()).toMatchSnapshot("tipo");
    elegir(new File([new Uint8Array(6 * 1024 * 1024)], "a.png", { type: "image/png" }));
    expect(seccion()).toMatchSnapshot("tamaño");
    elegir(new File(["x"], "a.png", { type: "image/png" }));
    expect(seccion()).toMatchSnapshot("elegida");
    for (const [nombre, status, cuerpo] of [
      ["hecho", 200, {}],
      ["401", 401, {}],
      ["429", 429, {}],
      ["otro con mensaje", 400, { error: { code: "X", message: "Del servidor." } }],
      ["otro sin mensaje", 500, {}],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })),
      );
      await pulsar(screen.getByRole("button", { name: "Guardar foto" }));
      expect(seccion()).toMatchSnapshot(nombre);
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("red"))),
    );
    await pulsar(screen.getByRole("button", { name: "Guardar foto" }));
    expect(seccion()).toMatchSnapshot("sin conexión");
  });

  it("el correo: error con y sin mensaje, sin conexión, hecho y cancelar", async () => {
    const c = await pantalla();
    const seccion = () => c.querySelectorAll("section")[1]!.outerHTML;
    const form = c.querySelectorAll("form")[1]!;
    escribir(form.querySelector("#email-nuevo")!, "nueva@x.test");
    for (const [nombre, preparar] of [
      ["con mensaje", () => mocks.postJsonCsrf.mockResolvedValueOnce(conMensaje(400))],
      ["sin mensaje", () => mocks.postJsonCsrf.mockResolvedValueOnce(r(500))],
      ["sin conexión", () => mocks.postJsonCsrf.mockRejectedValueOnce(new Error("red"))],
      ["hecho", () => mocks.postJsonCsrf.mockResolvedValueOnce(r(200))],
    ] as const) {
      preparar();
      await enviar(form);
      expect(seccion()).toMatchSnapshot(nombre);
    }
    mocks.delCsrf.mockResolvedValueOnce(r(200));
    await pulsar(screen.getByRole("button", { name: "Cancelar el cambio" }));
    expect(seccion()).toMatchSnapshot("cancelado");
  });

  it("la contraseña: no coinciden, corta, cada error, sin sesión, sin conexión y hecho", async () => {
    const c = await pantalla();
    const form = c.querySelectorAll("form")[2]!;
    const poner = (nueva: string, repetida = nueva) => {
      escribir(form.querySelector("#pw-actual")!, "vieja-larga");
      escribir(form.querySelector("#pw-nueva")!, nueva);
      escribir(form.querySelector("#pw-confirmar")!, repetida);
    };
    await pulsar(screen.getByRole("button", { name: "Mostrar contraseña" }));
    poner("una-larga-nueva", "otra-distinta");
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("no coinciden");
    poner("corta");
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("corta");
    for (const [nombre, preparar] of [
      ["429", () => mocks.postJsonCsrf.mockResolvedValueOnce(r(429))],
      ["503", () => mocks.postJsonCsrf.mockResolvedValueOnce(r(503))],
      ["403 con mensaje", () => mocks.postJsonCsrf.mockResolvedValueOnce(conMensaje(403))],
      ["400 sin mensaje", () => mocks.postJsonCsrf.mockResolvedValueOnce(r(400))],
      ["otro", () => mocks.postJsonCsrf.mockResolvedValueOnce(r(500))],
      ["sin sesión", () => mocks.postJsonCsrf.mockRejectedValueOnce(new Error("SIN_SESION"))],
      ["sin conexión", () => mocks.postJsonCsrf.mockRejectedValueOnce(new Error("red"))],
      ["hecho", () => mocks.postJsonCsrf.mockResolvedValueOnce(r(200))],
    ] as const) {
      poner("una-larga-nueva");
      preparar();
      await enviar(form);
      expect(form.outerHTML).toMatchSnapshot(nombre);
    }
  });
});
