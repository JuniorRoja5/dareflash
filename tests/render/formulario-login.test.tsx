/**
 * /entrar?siguiente=X RESUELVE A X, y lo hace con una navegación DURA, sin volver a pasar por el
 * router de cliente. Render real (jsdom) del formulario, con el login y la navegación doblados.
 *
 * Por qué importa la navegación dura: el router guarda lo que pre-cargó como invitado, incluido el 307
 * de /crear a /entrar. Con `router.push`, un usuario recién logueado volvía a aterrizar en /entrar, y el
 * segundo login se quedaba en "Entrando…" (ver src/lib/navegacion-dura.ts). Volver a `router.push` pone
 * estos tests en rojo.
 */
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(),
  navegarDuro: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/cliente-http", () => ({ postJson: mocks.postJson }));
vi.mock("@/lib/navegacion-dura", () => ({ navegarDuro: mocks.navegarDuro }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: (props: Record<string, unknown>) => createElement("a", props) };
});

import { FormularioLogin } from "@/app/entrar/formulario-login";

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
});

/** Rellena y envía el formulario estando en `url`, con un login que responde `respuesta`. */
async function enviarDesde(url: string, respuesta: unknown): Promise<HTMLElement> {
  window.history.replaceState({}, "", url);
  mocks.postJson.mockResolvedValue(respuesta);
  const { container } = render(<FormularioLogin />);
  const campo = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;
  fireEvent.change(campo("login-email"), { target: { value: "ana@correo.es" } });
  fireEvent.change(campo("login-password"), { target: { value: "una-clave" } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(mocks.postJson).toHaveBeenCalled());
  return container;
}

const ok = (role: string) => ({ ok: true, status: 200, code: "", data: { role } });

describe("tras un login correcto", () => {
  it("con ?siguiente=/crear va a /crear, en DURO y una sola vez", async () => {
    await enviarDesde("/entrar?siguiente=%2Fcrear", ok("USER"));
    await waitFor(() => expect(mocks.navegarDuro).toHaveBeenCalledTimes(1));
    expect(mocks.navegarDuro).toHaveBeenCalledWith("/crear");
    // Ni un paso por el router de cliente: es él quien guardaba la redirección de invitado.
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("conserva la query de la vuelta", async () => {
    await enviarDesde("/entrar?siguiente=%2Fretos%3Fcategoria%3Dhumor", ok("USER"));
    await waitFor(() => expect(mocks.navegarDuro).toHaveBeenCalledWith("/retos?categoria=humor"));
  });

  it("sin ?siguiente: el admin a su panel, el resto a la home", async () => {
    await enviarDesde("/entrar", ok("ADMIN"));
    await waitFor(() => expect(mocks.navegarDuro).toHaveBeenCalledWith("/panel"));
    mocks.navegarDuro.mockReset();
    document.body.innerHTML = "";
    await enviarDesde("/entrar", ok("USER"));
    await waitFor(() => expect(mocks.navegarDuro).toHaveBeenCalledWith("/"));
  });

  it("un ?siguiente externo no se sigue (open-redirect): va a la home", async () => {
    await enviarDesde("/entrar?siguiente=%2F%2Fevil.example", ok("USER"));
    await waitFor(() => expect(mocks.navegarDuro).toHaveBeenCalledWith("/"));
  });
});

describe("tras un login fallido", () => {
  it("no navega a ningún sitio y avisa", async () => {
    const c = await enviarDesde("/entrar?siguiente=%2Fcrear", {
      ok: false,
      status: 401,
      code: "INVALID_CREDENTIALS",
      data: {},
    });
    await waitFor(() => expect(c.querySelector('[role="alert"]')).not.toBeNull());
    expect(mocks.navegarDuro).not.toHaveBeenCalled();
  });
});
