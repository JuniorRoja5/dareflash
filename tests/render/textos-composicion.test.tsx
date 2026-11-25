/**
 * CADA ISLA DE CLIENTE RECIBE SUS TEXTOS DONDE SE MONTA (Fase 11 · P5b2a) — con los hooks DE VERDAD.
 *
 * ┌─ EL FALLO QUE CIERRA ─────────────────────────────────────────────────────────────────────────────┐
 * │ Los formularios de cambiar el correo y la contraseña son los del perfil, y los reutiliza la cuenta │
 * │ de empresa. Al sacar sus textos, la página del perfil les puso su proveedor y la de empresa no: │
 * │ `useTextos` LANZA si su espacio no llega, y /empresa/cuenta se rompía. Ningún test lo vio, porque  │
 * │ el arranque de los tests de render SIMULA los hooks (devuelven el castellano haya proveedor o no). │
 * │ Lo vio la comparación de las páginas reales.                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Aquí los hooks son los REALES: se monta la página dentro del mismo proveedor que pone el layout
 * `(app)` (el del armazón) y nada más. Si una isla pide un espacio que su página no le da, el render
 * lanza y el caso cae con el nombre del espacio. Cubre las islas que se montan en MÁS de una página.
 *
 * Para romperlo: quitar el `TextosProvider` de /empresa/cuenta (rojo: «cambioCorreo» no llega).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolverServidor } from "../helpers/render-servidor";

// LOS HOOKS DE VERDAD: se deshace la simulación del arranque (`setup.ts`) para este fichero.
vi.mock("@/components/textos-provider", async (original) => await original());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/auth/solo-participante", () => ({ apartarCuentaEmpresa: async () => {} }));
const H = vi.hoisted(() => ({ anonimo: false }));
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () =>
    H.anonimo ? null : { userId: "u1", esCuentaEmpresa: true, emailVerified: new Date() },
}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        email: "a@x.test",
        emailPendiente: null,
        displayName: "Ana",
        username: "ana",
        image: null,
        bio: "",
        website: "",
        instagram: "",
        youtube: "",
        pointsBalance: 0,
      }),
    },
  },
}));

// El portal de empresa (P5b2b): la empresa del chokepoint, su saldo y la tarifa.
vi.mock("@/app/(app)/(shell)/empresa/portal-guard", () => ({ protegerPortal: async () => {} }));
vi.mock("@/server/auth/empresa-actual", () => ({
  SinEmpresa: class extends Error {},
  requireEmpresa: async () => ({ user: { userId: "u1" }, empresaId: "e1", estado: "VERIFICADA" }),
}));
vi.mock("@/server/services/empresas", () => ({
  miEmpresa: async () => ({ tipoNegocio: "FISICO" }),
}));
vi.mock("@/server/services/creditos", () => ({
  misCreditos: async () => ({ saldo: 3, movimientos: [], nextCursor: null }),
}));
vi.mock("@/config/env", async (original) => {
  const { env } = await original<typeof import("../../src/config/env")>();
  // Con pagos configurados: así se pintan los botones de compra (la isla entera).
  return {
    env: new Proxy(env, {
      get: (o, k) => (k === "STRIPE_SECRET_KEY" ? "configurado" : Reflect.get(o, k)),
    }),
  };
});
vi.mock("@/server/formato-peticion", async (original) => ({
  ...(await original<typeof import("../../src/server/formato-peticion")>()),
  idiomaDeLaPeticion: async () => "es",
  zonaDeLaPeticion: async () => "Europe/Madrid",
}));

import CrearPage from "@/app/(app)/(shell)/crear/page";
import PaginaAltaEmpresa from "@/app/(app)/(shell)/empezar/empresa/page";
import PaginaCreditos from "@/app/(app)/(shell)/empresa/creditos/page";
import CuentaEmpresaPage from "@/app/(app)/(shell)/empresa/cuenta/page";
import LayoutPortal from "@/app/(app)/(shell)/empresa/layout";
import EditarPerfilPage from "@/app/(app)/(shell)/perfil/editar/page";
import { TextosProvider } from "@/components/textos-provider";
import { es } from "@/textos/es";
import { ESPACIOS_ARMAZON } from "@/textos/espacios";

/** Lo que pone el layout `(app)`: los espacios del armazón, y ninguno más. */
const ARMAZON = Object.fromEntries(ESPACIOS_ARMAZON.map((n) => [n, es[n]]));

async function enElArmazon(pagina: React.ReactNode): Promise<HTMLElement> {
  return render(<TextosProvider textos={ARMAZON}>{await resolverServidor(pagina)}</TextosProvider>)
    .container;
}

describe("las islas que se montan en más de una página reciben sus textos en todas", () => {
  it("la cuenta de empresa: los formularios de correo y contraseña", async () => {
    const c = await enElArmazon(await CuentaEmpresaPage());
    expect(c.textContent).toContain(es.cambioCorreo.titulo);
    expect(c.textContent).toContain(es.cambioClave.cambiar);
  });

  it("el perfil: los mismos formularios, y el del perfil", async () => {
    const c = await enElArmazon(await EditarPerfilPage());
    expect(c.textContent).toContain(es.cambioCorreo.titulo);
    expect(c.textContent).toContain(es.editarPerfil.guardar);
  });

  it("crear: el lanzador y la ventana de subir que abre", async () => {
    const c = await enElArmazon(await CrearPage());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: es.subida.lanzar }));
    });
    expect(document.body.textContent).toContain(es.subida.tituloSubir);
    expect(c.textContent).toContain(es.crear.titulo);
  });
});

describe("el portal de empresa y su alta (P5b2b)", () => {
  it("el layout del portal: la navegación recibe su espacio", async () => {
    const c = await enElArmazon(await LayoutPortal({ children: null }));
    expect(c.querySelector("nav")?.getAttribute("aria-label")).toBe(es.portal.navegacion);
    expect(c.textContent).toContain(es.portal.seccion_creditos);
  });

  it("los créditos: la compra recibe el suyo", async () => {
    const c = await enElArmazon(await PaginaCreditos({ searchParams: Promise.resolve({}) }));
    expect(c.textContent).toContain(es.creditosCompra.titulo);
    expect(c.textContent).toContain(es.creditosCompra.condiciones);
  });

  it("el alta (sin sesión, quien la ve): el formulario recibe el suyo", async () => {
    H.anonimo = true;
    try {
      const c = await enElArmazon(await PaginaAltaEmpresa());
      expect(c.textContent).toContain(es.altaFormulario.crear);
    } finally {
      H.anonimo = false;
    }
  });
});
