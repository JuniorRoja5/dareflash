/**
 * EL MARCADO DEL ALTA DE EMPRESA, FIJADO ANTES DE SACAR SUS TEXTOS (Fase 11 · P5b2b).
 *
 * `/empezar` (los dos caminos y el aviso de Socios Fundadores) y `/empezar/empresa` (el panel de qué te
 * llevas y el formulario en cada estado: lo que falta, los errores del servidor, sin conexión y
 * recibido). Se confirmó CONTRA EL CÓDIGO DE ANTES: los snapshots de `__snapshots__/` son ese HTML;
 * después de la extracción tiene que dar idéntico.
 *
 * Para romperlo: cambiar una letra de cualquiera de esos textos en `es.ts`, o la etiqueta que los envuelve.
 */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";
import { contrasenaFalsa } from "../helpers/valores-falsos";

const H = vi.hoisted(() => ({
  post: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));
vi.mock("@/lib/cliente-http", async (original) => {
  const { vi: v } = await import("vitest");
  H.post = v.fn();
  return { ...(await original<typeof import("../../src/lib/cliente-http")>()), postJson: H.post };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/empezar",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import PaginaAltaEmpresa from "@/app/(app)/(shell)/empezar/empresa/page";
import PaginaEmpezar from "@/app/(app)/(shell)/empezar/page";

type Respuesta = { ok: boolean; status: number; code: string; data: unknown };
const r = (status: number, data: unknown = {}): Respuesta => ({
  ok: status < 400,
  status,
  code: "",
  data,
});
const pagina = async (Pagina: () => Promise<React.ReactNode>) =>
  render(<>{await resolverServidor(await Pagina())}</>).container;
const escribir = (c: HTMLElement, id: string, valor: string) =>
  fireEvent.change(c.querySelector(`#${id}`)!, { target: { value: valor } });

afterEach(() => H.post.mockReset());

describe("/empezar", () => {
  it("los dos caminos, con el aviso de Socios Fundadores", async () => {
    expect((await pagina(PaginaEmpezar)).innerHTML).toMatchSnapshot();
  });
});

describe("/empezar/empresa", () => {
  it("la página, con todo lo que falta", async () => {
    expect((await pagina(PaginaAltaEmpresa)).innerHTML).toMatchSnapshot();
  });

  it("el formulario: falta poco, error con y sin mensaje, sin conexión y recibido", async () => {
    const c = await pagina(PaginaAltaEmpresa);
    const form = () => c.querySelector("form")!;
    escribir(c, "nombre", "Bar Ana");
    escribir(c, "personaContacto", "Ana");
    expect(form().outerHTML).toMatchSnapshot("falta poco");
    escribir(c, "webUrl", "https://bar.test");
    escribir(c, "email", "ana@bar.test");
    escribir(c, "password", contrasenaFalsa("alta-empresa"));
    escribir(c, "fiscalId", "B12345678");
    fireEvent.click(c.querySelector('input[type="checkbox"]')!);
    expect(form().outerHTML).toMatchSnapshot("completo");
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
        fireEvent.submit(form());
      });
      expect(form().outerHTML).toMatchSnapshot(nombre);
    }
    H.post.mockResolvedValueOnce(r(201, { ok: true }));
    await act(async () => {
      fireEvent.submit(form());
    });
    expect(c.innerHTML).toMatchSnapshot("recibido");
  });
});
