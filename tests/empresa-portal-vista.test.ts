/**
 * LAS PANTALLAS DEL PORTAL (Fase 9 · P1): su guard se EJECUTA, y lo que no debe salir no sale.
 *
 * `empresa-aislamiento` prueba el ámbito contra la base de datos; esto prueba la capa de delante:
 *
 *  - EL GUARD DEL LAYOUT, invocado como función. Un `protegerPortal()` escrito SIN `await` renderiza
 *    igual: la promesa se evalúa, el `redirect()` de dentro se pierde en una promesa que nadie mira
 *    y el portal se pinta para un anónimo. Es la misma lección que `panel-guard-paginas`, y la
 *    comprobación por texto no la ve.
 *  - LO QUE NO SE PINTA: la nota interna del equipo no aparece en ningún fichero del portal. No es
 *    que no se seleccione al pintar: es que el DTO del dueño no la trae (y eso lo vigila
 *    `empresa-registro` con igualdad exacta de claves). Aquí se cierra el otro lado.
 *  - LA NAVEGACIÓN DURA al terminar el alta, con su motivo escrito.
 *
 * Para romperlo a propósito: quitar el `await` de `protegerPortal()` (rojo el primero); pintar
 * `notaInterna` en la pantalla del dueño (rojo el segundo); cambiar `navegarDuro` por `router.push`
 * (rojo el tercero).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

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

const VERIFICADO: SessionUser = {
  userId: "u-1",
  role: "USER",
  emailVerified: new Date(),
  sessionId: "s-1",
};

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.redirect.mockClear();
});

describe("el guard del portal, ejecutado de verdad", () => {
  it("un anónimo no entra: al login, con vuelta al portal", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const layout = (await import("../src/app/(app)/(shell)/empresa/layout")).default as (
      p: unknown,
    ) => Promise<unknown>;
    // Si el layout escribiera `protegerPortal()` sin `await`, esto DEVOLVERÍA el árbol en vez de
    // lanzar, y el test caería.
    await expect(layout({ children: null })).rejects.toThrow(
      "REDIRECT:/entrar?siguiente=%2Fempresa",
    );
  });

  it("con sesión, el layout deja pasar (la barrera de dentro es otra)", async () => {
    mocks.getCurrentUser.mockResolvedValue(VERIFICADO);
    const layout = (await import("../src/app/(app)/(shell)/empresa/layout")).default as (
      p: unknown,
    ) => Promise<unknown>;
    await expect(layout({ children: null })).resolves.toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

const raiz = (...p: string[]) => path.resolve(__dirname, "..", ...p);
const leer = (...p: string[]) => readFileSync(raiz(...p.join("/").split("/")), "utf8");

/** Los ficheros del portal que ve el dueño. El panel es otra cosa y tiene otro DTO. */
const DEL_DUENO = [
  "src/app/(app)/(shell)/empresa/page.tsx",
  "src/app/(app)/(shell)/empresa/alta/page.tsx",
  "src/app/(app)/(shell)/empresa/formulario-alta.tsx",
  "src/app/(app)/(shell)/empresa/aviso-verificar.tsx",
];

describe("lo que el portal no pinta", () => {
  it("ni una nota interna, en ningún fichero del dueño", () => {
    const culpables = DEL_DUENO.filter((rel) => /notaInterna/.test(leer(rel)));
    expect(culpables).toEqual([]);
  });

  it("ni el handle de quien verifica (eso es del equipo)", () => {
    // Misma regla que la nota del ajuste de puntos: la traza es interna y el admin no se presenta.
    const culpables = DEL_DUENO.filter((rel) => /verificadaPor/.test(leer(rel)));
    expect(culpables).toEqual([]);
  });

  it("y el motivo del rechazo SÍ se le enseña (sin motivo, un correo de soporte por caso)", () => {
    expect(leer("src/app/(app)/(shell)/empresa/page.tsx")).toContain("MSG_MOTIVO_RECHAZO_EMPRESA");
  });
});

describe("el alta", () => {
  it("al terminar navega en DURO, no con el router", () => {
    const fuente = leer("src/app/(app)/(shell)/empresa/formulario-alta.tsx");
    expect(fuente).toContain("navegarDuro(");
    // El motivo, escrito: a /empresa se llega porque /empresa nos redirigió al alta hace un
    // momento, y esa redirección está en la caché del router de cliente.
    expect(fuente).not.toMatch(/router\.push\(/);
  });

  it("y manda el alta a su propia ruta, con CSRF", () => {
    const fuente = leer("src/app/(app)/(shell)/empresa/formulario-alta.tsx");
    expect(fuente).toContain("postJsonCsrf");
    expect(fuente).toContain('"/api/empresa"');
  });
});
