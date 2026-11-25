/**
 * EL MARCADO DEL ACCESO, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2a).
 *
 * Entrar, crear cuenta, recuperar y restablecer la contraseña, verificar el correo, reactivar la cuenta y
 * confirmar un correo nuevo: casi todo lo que dicen estas pantallas sale DESPUÉS de pulsar (un enlace
 * caducado, un 429, sin conexión, el correo sin verificar…), y nada de eso lo pinta la semilla de las
 * muestras. Este fichero recorre esos estados y se confirmó CONTRA EL CÓDIGO DE ANTES: los snapshots de
 * `__snapshots__/` son ese HTML, y después de la extracción tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(),
  navegarDuro: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("@/lib/cliente-http", async (original) => ({
  ...(await original<typeof import("../../src/lib/cliente-http")>()),
  postJson: mocks.postJson,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.params,
  usePathname: () => "/entrar",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/enlace", async (original) => ({
  ...(await original<typeof import("../../src/components/enlace")>()),
  useNavegarDuro: () => mocks.navegarDuro,
}));

import CambiarEmailPage from "@/app/cambiar-email/page";
import EntrarPage from "@/app/entrar/page";
import RecuperarPage from "@/app/recuperar/page";
import RestablecerPage from "@/app/restablecer/page";
import UnlockPage from "@/app/unlock/page";
import VerifyPage from "@/app/verify/page";

type Respuesta = { ok: boolean; status: number; code: string; data: unknown };
const r = (status: number, code = "", data: unknown = {}): Respuesta => ({
  ok: status < 400,
  status,
  code,
  data,
});

/**
 * Pinta una página y devuelve su contenedor. La página se LLAMA (no se monta como `<Pagina />`): una
 * página síncrona con un hijo asíncrono (el pie legal) solo se resuelve si se baja por su árbol.
 */
async function pagina(
  Pagina: () => React.ReactNode | Promise<React.ReactNode>,
): Promise<HTMLElement> {
  return render(<>{await resolverServidor(await Pagina())}</>).container;
}
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
const escribir = (el: HTMLElement, valor: string) =>
  fireEvent.change(el, { target: { value: valor } });

beforeEach(() => {
  mocks.params = new URLSearchParams();
});
afterEach(() => {
  mocks.postJson.mockReset();
});

describe("/entrar", () => {
  it("la tarjeta: entrar, y crear cuenta", async () => {
    const c = await pagina(EntrarPage);
    expect(c.innerHTML).toMatchSnapshot("entrar");
    await pulsar(screen.getAllByRole("button", { name: "Crear cuenta" })[0]!);
    expect(c.innerHTML).toMatchSnapshot("registro");
  });

  it("entrar: contraseña visible, error, sin verificar, reenviado, 429 y sin conexión", async () => {
    const c = await pagina(EntrarPage);
    const form = c.querySelector("form")!;
    await pulsar(screen.getAllByRole("button", { name: "Mostrar contraseña" })[0]!);
    expect(form.outerHTML).toMatchSnapshot("visible");

    mocks.postJson.mockResolvedValueOnce(r(401, "INVALID_CREDENTIALS"));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("credenciales");

    mocks.postJson.mockResolvedValueOnce(r(403, "EMAIL_NOT_VERIFIED"));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("sin verificar");
    mocks.postJson.mockResolvedValueOnce(r(200));
    await pulsar(screen.getByRole("button", { name: "Reenviar el correo de verificación" }));
    expect(form.outerHTML).toMatchSnapshot("reenviado");

    mocks.postJson.mockResolvedValueOnce(r(403, "EMAIL_NOT_VERIFIED"));
    await enviar(form);
    mocks.postJson.mockResolvedValueOnce(r(429, "RATE_LIMITED"));
    await pulsar(screen.getByRole("button", { name: "Reenviar el correo de verificación" }));
    expect(form.outerHTML).toMatchSnapshot("reenvío 429");

    mocks.postJson.mockResolvedValueOnce(r(403, "EMAIL_NOT_VERIFIED"));
    await enviar(form);
    mocks.postJson.mockRejectedValueOnce(new Error("red"));
    await pulsar(screen.getByRole("button", { name: "Reenviar el correo de verificación" }));
    expect(form.outerHTML).toMatchSnapshot("reenvío sin conexión");

    mocks.postJson.mockRejectedValueOnce(new Error("red"));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("sin conexión");
  });

  it("crear cuenta: pistas de la contraseña, aviso de edad, error, sin conexión y hecho", async () => {
    const c = await pagina(EntrarPage);
    const form = c.querySelectorAll("form")[1]!;
    escribir(form.querySelector("#registro-password")!, "corta");
    expect(form.outerHTML).toMatchSnapshot("corta");
    escribir(form.querySelector("#registro-password")!, "una-bastante-larga");
    escribir(form.querySelector("#registro-nacimiento")!, "2020-01-01");
    expect(form.outerHTML).toMatchSnapshot("larga y menor");

    mocks.postJson.mockResolvedValueOnce(r(400, "VALIDATION"));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("error");
    mocks.postJson.mockRejectedValueOnce(new Error("red"));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("sin conexión");

    mocks.postJson.mockResolvedValueOnce(r(201));
    await enviar(form);
    expect(c.querySelectorAll("form").length).toBe(1);
    expect(c.innerHTML).toMatchSnapshot("hecho");
  });
});

describe("/recuperar", () => {
  it("la página, 429, error, sin conexión y hecho", async () => {
    const c = await pagina(RecuperarPage);
    expect(c.innerHTML).toMatchSnapshot("página");
    const form = c.querySelector("form")!;
    for (const [nombre, resp] of [
      ["429", r(429)],
      ["error", r(500)],
    ] as const) {
      mocks.postJson.mockResolvedValueOnce(resp);
      await enviar(form);
      expect(form.outerHTML).toMatchSnapshot(nombre);
    }
    mocks.postJson.mockRejectedValueOnce(new Error("red"));
    await enviar(form);
    expect(form.outerHTML).toMatchSnapshot("sin conexión");
    mocks.postJson.mockResolvedValueOnce(r(200));
    await enviar(form);
    expect(c.innerHTML).toMatchSnapshot("hecho");
  });
});

describe("/restablecer", () => {
  it("sin token", async () => {
    expect((await pagina(RestablecerPage)).innerHTML).toMatchSnapshot();
  });

  it("con token: el formulario, 503, validación, sin conexión, caducado y listo", async () => {
    mocks.params = new URLSearchParams("token=t");
    const c = await pagina(RestablecerPage);
    expect(c.innerHTML).toMatchSnapshot("formulario");
    await pulsar(screen.getByRole("button", { name: "Mostrar contraseña" }));
    const form = () => c.querySelector("form")!;
    for (const [nombre, resp] of [
      ["503", r(503, "OVERLOADED")],
      ["validación", r(400, "VALIDATION")],
      ["validación con mensaje", r(400, "VALIDATION", { message: "Del servidor." })],
    ] as const) {
      mocks.postJson.mockResolvedValueOnce(resp);
      await enviar(form());
      expect(form().outerHTML).toMatchSnapshot(nombre);
    }
    mocks.postJson.mockRejectedValueOnce(new Error("red"));
    await enviar(form());
    expect(form().outerHTML).toMatchSnapshot("sin conexión");
    mocks.postJson.mockResolvedValueOnce(r(400, "INVALID_TOKEN"));
    await enviar(form());
    expect(c.innerHTML).toMatchSnapshot("caducado");
  });

  it("con token: hecho", async () => {
    mocks.params = new URLSearchParams("token=t");
    const c = await pagina(RestablecerPage);
    mocks.postJson.mockResolvedValueOnce(r(200));
    await enviar(c.querySelector("form")!);
    expect(c.innerHTML).toMatchSnapshot();
  });
});

describe("/unlock", () => {
  it("sin token", async () => {
    expect((await pagina(UnlockPage)).innerHTML).toMatchSnapshot();
  });

  it("con token: listo, hecho, error y sin conexión", async () => {
    mocks.params = new URLSearchParams("token=t");
    for (const [nombre, resp] of [
      ["hecho", r(200)],
      ["error", r(400)],
      ["sin conexión", null],
    ] as const) {
      const c = await pagina(UnlockPage);
      if (nombre === "hecho") expect(c.innerHTML).toMatchSnapshot("listo");
      if (resp) mocks.postJson.mockResolvedValueOnce(resp);
      else mocks.postJson.mockRejectedValueOnce(new Error("red"));
      await pulsar(screen.getByRole("button"));
      expect(c.innerHTML).toMatchSnapshot(nombre);
      c.remove();
    }
  });
});

describe("/verify", () => {
  it("sin token", async () => {
    expect((await pagina(VerifyPage)).innerHTML).toMatchSnapshot();
  });

  it("con token: listo, hecho, y error con el reenvío (hecho, 429, fallo, sin conexión)", async () => {
    mocks.params = new URLSearchParams("token=t");
    const c = await pagina(VerifyPage);
    expect(c.innerHTML).toMatchSnapshot("listo");
    mocks.postJson.mockResolvedValueOnce(r(200));
    await pulsar(screen.getByRole("button"));
    expect(c.innerHTML).toMatchSnapshot("hecho");
    c.remove();

    for (const [nombre, resp] of [
      ["reenviado", r(200)],
      ["429", r(429)],
      ["fallo", r(500)],
      ["sin conexión", null],
    ] as const) {
      const d = await pagina(VerifyPage);
      mocks.postJson.mockResolvedValueOnce(r(400));
      await pulsar(screen.getByRole("button"));
      if (nombre === "reenviado") expect(d.innerHTML).toMatchSnapshot("error");
      if (resp) mocks.postJson.mockResolvedValueOnce(resp);
      else mocks.postJson.mockRejectedValueOnce(new Error("red"));
      await enviar(d.querySelector("form")!);
      expect(d.innerHTML).toMatchSnapshot(nombre);
      d.remove();
    }
  });

  it("sin conexión al verificar", async () => {
    mocks.params = new URLSearchParams("token=t");
    const c = await pagina(VerifyPage);
    mocks.postJson.mockRejectedValueOnce(new Error("red"));
    await pulsar(screen.getByRole("button"));
    expect(c.innerHTML).toMatchSnapshot();
  });
});

describe("/cambiar-email", () => {
  it("sin token", async () => {
    expect((await pagina(CambiarEmailPage)).innerHTML).toMatchSnapshot();
  });

  it("con token: listo, hecho, error del servidor, error sin mensaje y sin conexión", async () => {
    mocks.params = new URLSearchParams("token=t");
    for (const [nombre, resp] of [
      ["hecho", r(200)],
      ["error con mensaje", r(400, "X", { error: { code: "X", message: "Del servidor." } })],
      ["error sin mensaje", r(400)],
      ["sin conexión", null],
    ] as const) {
      const c = await pagina(CambiarEmailPage);
      if (nombre === "hecho") expect(c.innerHTML).toMatchSnapshot("listo");
      if (resp) mocks.postJson.mockResolvedValueOnce(resp);
      else mocks.postJson.mockRejectedValueOnce(new Error("red"));
      await pulsar(screen.getByRole("button"));
      expect(c.innerHTML).toMatchSnapshot(nombre);
      c.remove();
    }
  });
});
