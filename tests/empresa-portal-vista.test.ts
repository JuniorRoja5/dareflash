/**
 * LAS PANTALLAS DEL PORTAL Y DEL ALTA (Fase 9 · P1): su guard se EJECUTA, y lo que no debe salir
 * no sale.
 *
 * `empresa-aislamiento` prueba el ámbito contra la base de datos; esto prueba la capa de delante:
 *
 *  - EL GUARD DEL LAYOUT, invocado como función. Un `protegerPortal()` escrito SIN `await` renderiza
 *    igual: la promesa se evalúa, el `redirect()` de dentro se pierde en una promesa que nadie mira
 *    y el portal se pinta para un anónimo. Es la misma lección que `panel-guard-paginas`, y la
 *    comprobación por texto no la ve.
 *  - EL ALTA ESTÁ FUERA DEL GUARD. Es la pieza que más fácil se rompe «ordenando» rutas: si el alta
 *    cuelga del portal, para registrar una empresa hace falta la sesión que crea el registro.
 *  - LO QUE NO SE PINTA: ni la nota interna del equipo, ni el handle de quien verifica, ni la
 *    identificación fiscal. No es que no se seleccionen al pintar: es que el DTO del dueño no las
 *    trae (y eso lo vigila `empresa-registro` con igualdad exacta de claves).
 *
 * Para romperlo a propósito: quitar el `await` de `protegerPortal()` (rojo el primero); mover el
 * alta a `/empresa/*` (rojo el segundo); pintar `notaInterna` o `fiscalId` en la pantalla del dueño
 * (rojo el tercero).
 */
import { existsSync, readFileSync } from "node:fs";
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
  esCuentaEmpresa: true,
  sessionId: "s-1",
};

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.redirect.mockClear();
});

const raiz = (...p: string[]) => path.resolve(__dirname, "..", ...p.join("/").split("/"));
const leer = (...p: string[]) => readFileSync(raiz(...p), "utf8");

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

describe("el alta vive FUERA del portal", () => {
  it("no hay ninguna página bajo /empresa que no sea el portal", () => {
    // El alta crea la cuenta: no puede estar detrás del guard que exige tener una. Si alguien la
    // devuelve a `/empresa/alta`, el layout le pedirá sesión y nadie podrá registrarse.
    expect(existsSync(raiz("src/app/(app)/(shell)/empresa/alta/page.tsx"))).toBe(false);
    expect(existsSync(raiz("src/app/(app)/(shell)/empezar/empresa/page.tsx"))).toBe(true);
    expect(existsSync(raiz("src/app/(app)/(shell)/empezar/page.tsx"))).toBe(true);
  });

  it("y el portal manda al alta a quien todavía no tiene empresa", () => {
    expect(leer("src/app/(app)/(shell)/empresa/page.tsx")).toContain(
      'redirect("/empezar/empresa")',
    );
  });
});

/** Los ficheros que ve el dueño (o cualquiera): el portal y el alta. El panel es otra cosa. */
const DEL_DUENO = [
  "src/app/(app)/(shell)/empresa/page.tsx",
  "src/app/(app)/(shell)/empresa/aviso-verificar.tsx",
  "src/app/(app)/(shell)/empezar/page.tsx",
  "src/app/(app)/(shell)/empezar/empresa/page.tsx",
  "src/app/(app)/(shell)/empezar/empresa/formulario-alta.tsx",
];

describe("lo que el portal no pinta", () => {
  it("ni una nota interna, en ningún fichero del dueño", () => {
    expect(DEL_DUENO.filter((rel) => /notaInterna/.test(leer(rel)))).toEqual([]);
  });

  it("ni el handle de quien verifica (eso es del equipo)", () => {
    // Misma regla que la nota del ajuste de puntos: la traza es interna y el admin no se presenta.
    expect(DEL_DUENO.filter((rel) => /verificadaPor/.test(leer(rel)))).toEqual([]);
  });

  it("y el motivo del rechazo SÍ se le enseña (sin motivo, un correo de soporte por caso)", () => {
    expect(leer("src/app/(app)/(shell)/empresa/page.tsx")).toContain("MSG_MOTIVO_RECHAZO_EMPRESA");
  });
});

describe("el formulario del alta", () => {
  const fuente = () => leer("src/app/(app)/(shell)/empezar/empresa/formulario-alta.tsx");

  it("manda el alta a su ruta y SIN pedir CSRF (todavía no hay sesión)", () => {
    expect(fuente()).toContain('"/api/empresa"');
    // `postJson` con o sin genérico; lo que no puede aparecer es la variante con CSRF.
    expect(fuente()).toMatch(/\bpostJson[<(]/);
    expect(fuente()).not.toContain("postJsonCsrf");
  });

  it("explica ANTES de intentarlo que hace falta un correo nuevo", () => {
    // En el formulario y no en la respuesta: contestar «ese correo ya existe» sería un oráculo de
    // direcciones registradas, que es lo que el registro de participante evita a propósito.
    expect(fuente()).toContain("MSG_EMPRESA_CORREO_NUEVO");
  });

  it("no navega al terminar: el correo está sin verificar, así que no hay sesión que llevar", () => {
    expect(fuente()).not.toMatch(/navegarDuro\(/);
    expect(fuente()).not.toMatch(/router\.push\(/);
  });

  it("NO calcula la lista de países: se la dan hecha desde el servidor", () => {
    // El ICU de Node no ordena igual que el de Chrome. Con la lista calculada en el cliente, el
    // servidor pintaba «Hungría» donde el navegador esperaba «Hong Kong» y React abortaba la
    // hidratación de la página entera. Se vio mirando el dev, no deduciéndolo; que no vuelva.
    expect(fuente()).not.toMatch(/paisesParaElegir\(/);
    expect(leer("src/app/(app)/(shell)/empezar/empresa/page.tsx")).toMatch(/paisesParaElegir\(/);
  });
});
