/**
 * LAS PÁGINAS DE PARTICIPANTE APARTAN A LA EMPRESA, EJECUTADAS DE VERDAD (Fase 9, P2).
 *
 * `empresa-shell` comprueba por TEXTO que cada página de participante llama al guard; esto las
 * EJECUTA con una sesión de empresa. La diferencia es la de siempre: un guard que no se espera, o que
 * va DESPUÉS de algo que ya pinta o consulta, pasa la comprobación de texto y no protege nada.
 *
 * Aquí el guard tiene que ir PRIMERO: la página se invoca sin base de datos (no hay `prisma` en el
 * mock), así que si algo se adelantara al guard la página reventaría con otro error y el test caería.
 *
 * Para romperlo a propósito: quitar el `await` del guard en una página (rojo); moverlo debajo de la
 * primera consulta (rojo: otro error antes del redirect); mandar /perfil/editar al portal (rojo).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../src/server/auth/session";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  usePathname: () => "/",
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
  useSearchParams: () => new URLSearchParams(),
}));
// SIN base de datos: si una página consulta antes de apartar a la empresa, esto lo delata.
vi.mock("@/server/db/client", () => ({
  get prisma(): never {
    throw new Error("CONSULTÓ ANTES DEL GUARD");
  },
}));

const sesion = (esCuentaEmpresa: boolean): SessionUser => ({
  userId: "u-1",
  role: "USER",
  emailVerified: new Date(),
  esCuentaEmpresa,
  sessionId: "s-1",
});

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.redirect.mockClear();
});

describe("apartarCuentaEmpresa", () => {
  it("una empresa va a su portal (o al destino que se pida)", async () => {
    const { apartarCuentaEmpresa } = await import("../src/server/auth/solo-participante");
    mocks.getCurrentUser.mockResolvedValue(sesion(true));
    await expect(apartarCuentaEmpresa()).rejects.toThrow("REDIRECT:/empresa");
    await expect(apartarCuentaEmpresa("/empresa/cuenta")).rejects.toThrow(
      "REDIRECT:/empresa/cuenta",
    );
  });

  it("un participante y un invitado siguen: esto no es un guard de sesión", async () => {
    const { apartarCuentaEmpresa } = await import("../src/server/auth/solo-participante");
    mocks.getCurrentUser.mockResolvedValue(sesion(false));
    await expect(apartarCuentaEmpresa()).resolves.toBeUndefined();
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(apartarCuentaEmpresa()).resolves.toBeUndefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

type Pagina = (p: unknown) => Promise<unknown>;
const PROPS = { searchParams: Promise.resolve({}) };

const PAGINAS: { ruta: string; cargar: () => Promise<{ default: unknown }>; destino: string }[] = [
  {
    ruta: "/crear",
    cargar: () => import("../src/app/(app)/(shell)/crear/page"),
    destino: "/empresa",
  },
  {
    ruta: "/perfil",
    cargar: () => import("../src/app/(app)/(shell)/perfil/page"),
    destino: "/empresa",
  },
  {
    ruta: "/perfil/editar",
    cargar: () => import("../src/app/(app)/(shell)/perfil/editar/page"),
    destino: "/empresa/cuenta",
  },
  {
    ruta: "/puntos",
    cargar: () => import("../src/app/(app)/(shell)/puntos/page"),
    destino: "/empresa",
  },
  {
    ruta: "/referidos",
    cargar: () => import("../src/app/(app)/(shell)/referidos/page"),
    destino: "/empresa",
  },
  { ruta: "/vip", cargar: () => import("../src/app/(app)/(shell)/vip/page"), destino: "/empresa" },
  {
    ruta: "/wallet",
    cargar: () => import("../src/app/(app)/(shell)/wallet/page"),
    destino: "/empresa",
  },
  {
    ruta: "/boosts",
    cargar: () => import("../src/app/(app)/(shell)/boosts/page"),
    destino: "/empresa",
  },
  {
    ruta: "/destacados",
    cargar: () => import("../src/app/(app)/(shell)/destacados/page"),
    destino: "/empresa",
  },
];

describe.each(PAGINAS)("$ruta con sesión de empresa", ({ cargar, destino }) => {
  it(`redirige a ${destino}, ANTES de consultar nada`, async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion(true));
    const pagina = (await cargar()).default as Pagina;
    await expect(pagina(PROPS)).rejects.toThrow(`REDIRECT:${destino}`);
  });
});

describe("/empresa/cuenta es SOLO de empresa", () => {
  it("un participante va a su edición de perfil, que tiene lo mismo y más", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion(false));
    const pagina = (await import("../src/app/(app)/(shell)/empresa/cuenta/page")).default as Pagina;
    await expect(pagina({})).rejects.toThrow("REDIRECT:/perfil/editar");
  });
});
