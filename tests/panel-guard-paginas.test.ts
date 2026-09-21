/**
 * EL GUARD DE CADA PÁGINA, EJECUTADO DE VERDAD.
 *
 * `panel-roles` comprueba por TEXTO que cada página llama a `requireSeccion` con la ruta de su
 * sección. Eso caza el fallo real —olvidarse del guard— pero no uno más retorcido: ESCRIBIR la
 * llamada y no esperarla. Sin `await`, la promesa se evalúa, el `notFound()` de dentro se pierde en
 * una promesa que nadie mira, y la página sigue renderizando el contenido de administración.
 *
 * Aquí se invoca cada página COMO FUNCIÓN, con una sesión de MODERADOR, y se exige que no llegue a
 * devolver nada: o 404 (las de administración) o el desvío del root. La única que sí debe responder
 * es la suya.
 *
 * Se mockean la sesión y `next/navigation`; el RBAC real corre entero. No hace falta base de datos:
 * el guard va primero, así que en las páginas de administración la ejecución no llega a consultar.
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
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
// La página de Moderación SÍ se ejecuta entera (es la única que el moderador puede ver), así que sus
// datos se doblan: aquí se prueba el GUARD, no la cola —esa tiene sus propios tests contra la BD—.
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/cola-moderacion", () => ({
  listarColaModeracion: vi.fn(async () => ({ items: [], nextCursor: null })),
  contarDenunciasAbiertas: vi.fn(async () => 0),
}));
vi.mock("@/server/services/reproduccion-servidor", () => ({
  firmarReproduccion: () => ({ src: "s", poster: "p" }),
}));
// Y Usuarios, que es la otra sección del moderador. Mismo criterio: aquí se prueba el GUARD.
vi.mock("@/server/services/cuentas-panel", () => ({
  listarCuentas: vi.fn(async () => ({ items: [], proximoCursor: null, modo: "listado" })),
  fichaCuenta: vi.fn(async () => null),
}));

const MODERADOR: SessionUser = {
  userId: "mod-1",
  role: "MODERATOR",
  emailVerified: new Date(),
  sessionId: "s1",
};

/** Cada página con los argumentos que Next le pasaría. */
/**
 * Una página de Next, vista desde fuera: recibe lo que le pase el router (o nada). Cada página tiene
 * su propia forma de props, así que el módulo se carga sin tipar y se acota AQUÍ, en un solo sitio.
 */
type Pagina = (props?: unknown) => Promise<unknown>;

const paginaDe = (mod: { default: unknown }): Pagina => mod.default as Pagina;

const PAGINAS_ADMIN: {
  ruta: string;
  cargar: () => Promise<{ default: unknown }>;
  /** Tupla (no array suelto): así se puede expandir en la llamada sin perder el tipo. */
  args: [] | [unknown];
}[] = [
  { ruta: "/panel/retos", cargar: () => import("../src/app/panel/retos/page"), args: [] },
  {
    ruta: "/panel/retos/[id]",
    cargar: () => import("../src/app/panel/retos/[id]/page"),
    args: [{ params: Promise.resolve({ id: "reto-1" }) }],
  },
  {
    ruta: "/panel/ranking",
    cargar: () => import("../src/app/panel/ranking/page"),
    args: [{ searchParams: Promise.resolve({}) }],
  },
  {
    ruta: "/panel/notificaciones",
    cargar: () => import("../src/app/panel/notificaciones/page"),
    args: [{ searchParams: Promise.resolve({}) }],
  },
  { ruta: "/panel/monedero", cargar: () => import("../src/app/panel/monedero/page"), args: [] },
  { ruta: "/panel/boost", cargar: () => import("../src/app/panel/boost/page"), args: [] },
];

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getCurrentUser.mockResolvedValue(MODERADOR);
  mocks.redirect.mockClear();
  mocks.notFound.mockClear();
});

describe("una página de administración, ejecutada por un MODERADOR", () => {
  for (const p of PAGINAS_ADMIN) {
    it(`${p.ruta} no devuelve nada: 404`, async () => {
      const pagina = paginaDe(await p.cargar());
      // Si la página escribiera `requireSeccion(...)` SIN `await`, esto devolvería contenido en vez
      // de lanzar, y el test caería. Eso es lo que la comprobación por texto no puede ver.
      await expect(pagina(...p.args)).rejects.toThrow("NOT_FOUND");
    });
  }

  it("y el root desvía al moderador a lo suyo, sin enseñarle el Resumen", async () => {
    const pagina = paginaDe(await import("../src/app/panel/page"));
    await expect(pagina()).rejects.toThrow("REDIRECT:/panel/moderacion");
  });
});

/**
 * Y el otro lado del guard: las secciones DEL MODERADOR, ejecutadas por un usuario normal. Sin esto,
 * "no esperar el `requireSeccion`" era invisible en `/panel/moderacion` y `/panel/usuarios` —el único
 * rol con el que se probaban era uno al que SÍ se le deja pasar, así que el guard nunca decía que no—.
 */
describe("una sección del moderador, ejecutada por un USUARIO normal", () => {
  const PAGINAS_MODERADOR: {
    ruta: string;
    cargar: () => Promise<{ default: unknown }>;
    args: [] | [unknown];
  }[] = [
    {
      ruta: "/panel/moderacion",
      cargar: () => import("../src/app/panel/moderacion/page"),
      args: [],
    },
    {
      ruta: "/panel/usuarios",
      cargar: () => import("../src/app/panel/usuarios/page"),
      args: [{ searchParams: Promise.resolve({}) }],
    },
  ];

  for (const p of PAGINAS_MODERADOR) {
    it(`${p.ruta} no devuelve nada: 404`, async () => {
      mocks.getCurrentUser.mockResolvedValue({ ...MODERADOR, role: "USER" });
      const pagina = paginaDe(await p.cargar());
      await expect(pagina(...p.args)).rejects.toThrow("NOT_FOUND");
    });
  }
});

describe("sus propias secciones sí responden", () => {
  it("/panel/moderacion se pinta para un moderador", async () => {
    const pagina = paginaDe(await import("../src/app/panel/moderacion/page"));
    await expect(pagina()).resolves.toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("/panel/usuarios se pinta para un moderador", async () => {
    const pagina = paginaDe(await import("../src/app/panel/usuarios/page"));
    await expect(pagina({ searchParams: Promise.resolve({}) })).resolves.toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
