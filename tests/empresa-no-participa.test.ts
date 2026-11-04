/**
 * UNA CUENTA DE EMPRESA MIRA Y NO PARTICIPA (Fase 9 · P1).
 *
 * ┌─ POR QUÉ EL CANDADO ESTÁ EN `mutatingRoute` Y NO EN CADA PANTALLA ─────────────────────────────┐
 * │ Porque un `if` por superficie se olvida en la superficie número quince, y porque esta fase ya  │
 * │ pagó esa factura: el auto-ocultado filtraba en una y no en la otra, con la suite en verde. El  │
 * │ chokepoint por el que pasa TODA mutación es `mutatingRoute`, así que el candado vive ahí y     │
 * │ está CERRADO POR DEFECTO: una ruta mutante nueva nace bloqueada para empresas y abrirla exige  │
 * │ escribir `cuentaEmpresa: "permite"`, que es lo que este censo vigila.                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA COBERTURA SE COMPONE DE DOS GUARDS, y ninguno basta solo:
 *   1. `route-csrf` ya exige que TODA ruta mutante pase por `mutatingRoute` (o esté exenta con su
 *      justificación escrita, porque no tiene sesión que proteger);
 *   2. este fichero exige que, de las que pasan, solo DOS puedan decir «permite».
 * Juntos: no hay forma de añadir una superficie de participación abierta a una cuenta de empresa
 * sin que algo se ponga rojo.
 *
 * Y el comportamiento se prueba de verdad, no por texto: el envoltorio se EJECUTA con una sesión de
 * empresa y tiene que devolver 403 sin llamar al handler.
 *
 * Para romperlo a propósito: cambiar el defecto a «permite» (rojo el behavioural y el censo);
 * poner `cuentaEmpresa: "permite"` en una ruta de participación (rojo el censo); comprobar
 * `esCuentaEmpresa` a mano en una ruta en vez de en el chokepoint (rojo el de «un solo sitio»).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../src/server/auth/session";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), verifyCsrfToken: vi.fn(() => true) }));

vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/auth/csrf", () => ({ verifyCsrfToken: mocks.verifyCsrfToken }));
vi.mock("@/config/env", () => ({ env: { APP_URL: "https://dareflash.test", AUTH_SECRET: "s" } }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));

import { mutatingRoute } from "../src/server/auth/mutating-route";

const sesion = (esCuentaEmpresa: boolean): SessionUser => ({
  userId: "u-1",
  role: "USER",
  emailVerified: new Date(),
  esCuentaEmpresa,
  sessionId: "s-1",
});

const peticion = () =>
  new Request("https://dareflash.test/api/lo-que-sea", {
    method: "POST",
    headers: { origin: "https://dareflash.test", "x-csrf-token": "t" },
  });

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.verifyCsrfToken.mockReturnValue(true);
});

describe("el candado, ejecutado", () => {
  it("una cuenta de empresa recibe 403 y el handler NO se llega a llamar", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion(true));
    const handler = vi.fn(async () => new Response("no debería"));
    const ruta = mutatingRoute(handler);

    const res = await ruta(peticion(), undefined);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "CUENTA_EMPRESA" } });
    // Lo importante no es el código: es que la acción no ocurrió.
    expect(handler).not.toHaveBeenCalled();
  });

  it("una cuenta normal pasa", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion(false));
    const handler = vi.fn(async () => new Response("ok"));
    const res = await mutatingRoute(handler)(peticion(), undefined);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("y con «permite» pasa también la de empresa (su portal, su cuenta)", async () => {
    mocks.getCurrentUser.mockResolvedValue(sesion(true));
    const handler = vi.fn(async () => new Response("ok"));
    const res = await mutatingRoute(handler, { cuentaEmpresa: "permite" })(peticion(), undefined);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("el candado va DESPUÉS del CSRF: a quien no demuestra quién es no se le cuenta nada", async () => {
    // Si fuera antes, un token inválido recibiría «esta cuenta es de empresa», que es información
    // sobre una cuenta ajena a cambio de nada.
    mocks.getCurrentUser.mockResolvedValue(sesion(true));
    mocks.verifyCsrfToken.mockReturnValue(false);
    const res = await mutatingRoute(vi.fn())(peticion(), undefined);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "CSRF" } });
  });
});

// ---------------------------------------------------------------------------------------------------
// EL CENSO (estructural)
// ---------------------------------------------------------------------------------------------------

const API = join(process.cwd(), "src", "app", "api");
const METODOS = ["POST", "PUT", "PATCH", "DELETE"] as const;

/** Toda `route.ts` bajo src/app/api, con su ruta relativa y su fuente. */
function rutas(dir = API): { ruta: string; src: string }[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return rutas(p);
    if (n !== "route.ts") return [];
    return [
      {
        ruta: relative(API, dir).split(sep).join("/"),
        src: readFileSync(p, "utf8"),
      },
    ];
  });
}

/**
 * SIN COMENTARIOS. Una ruta que EXPLIQUE en su docblock por qué NO lleva `cuentaEmpresa: "permite"`
 * contiene esa cadena, y el censo la contaría como infracción: se pondría rojo por la prosa que
 * documenta la regla que vigila. Un guard que castiga explicar la regla acaba borrado, y con él la
 * vigilancia de verdad. (La misma precaución que `panel-roles` y que el censo de `empresa-aislamiento`.)
 */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const muta = (src: string) =>
  METODOS.some((m) =>
    new RegExp(`export\\s+(?:const\\s+${m}\\b|(?:async\\s+)?function\\s+${m}\\b)`).test(src),
  );

const cuenta = (src: string, re: RegExp) => soloCodigo(src).match(re)?.length ?? 0;

/** Cuántos métodos de este fichero pasan por el envoltorio. */
const envoltorios = (src: string) => cuenta(src, /mutatingRoute(?:<[^>]*>)?\s*\(/g);
/** Cuántos de ellos abren la puerta a una cuenta de empresa. */
const permisos = (src: string) => cuenta(src, /cuentaEmpresa:\s*"permite"/g);

const permiteEmpresa = (src: string) => permisos(src) > 0;

/**
 * LAS ÚNICAS RUTAS QUE UNA CUENTA DE EMPRESA PUEDE MUTAR, con su motivo. Son de GOBIERNO DE LA
 * PROPIA CUENTA, no de participación:
 *
 *  - `auth/logout`: salir no es participar, y una cuenta que no puede cerrar su sesión es una
 *    cuenta atrapada.
 *  - `auth/change-password`: es lo primero que hace falta si una credencial se filtra.
 *  - `perfil/email`: el correo es la IDENTIDAD DE ACCESO —con él se entra y con él se recupera la
 *    cuenta—, así que moverlo es exactamente lo mismo que cambiar la contraseña. Sin esto, una
 *    empresa a la que le cambia la persona de contacto se queda sin forma de recuperar su cuenta.
 *
 * LO QUE SIGUE CERRADO Y NO ES UN OLVIDO: `perfil` (PATCH) y `perfil/avatar`. Son el perfil PÚBLICO
 * del producto de participación; la identidad de una empresa es su fila `Empresa`, no un perfil de
 * participante. Abrirlos le daría presencia pública a quien, por decisión, solo mira.
 *
 * Cuando P2 traiga las rutas del portal, entran aquí —y cada una con su línea—.
 */
const PERMITEN = new Set(["auth/logout", "auth/change-password", "perfil/email"]);

describe("el censo de rutas mutantes", () => {
  const MUTANTES = rutas().filter((r) => muta(r.src));

  it("hay rutas que censar (si esto falla, el recorrido está roto)", () => {
    expect(MUTANTES.length).toBeGreaterThanOrEqual(20);
  });

  it("solo las de gobierno de la cuenta abren la puerta a una empresa", () => {
    const abiertas = MUTANTES.filter((r) => permiteEmpresa(r.src)).map((r) => r.ruta);
    // Si esto falla con una ruta nueva: o es participación —y entonces NO lleva «permite»—, o es
    // del portal o de la cuenta, y entonces se añade arriba CON SU MOTIVO.
    expect(abiertas.sort()).toEqual([...PERMITEN].sort());
  });

  it("y las que declaramos abiertas lo están MÉTODO A MÉTODO, no «el fichero»", () => {
    // La lección que `route-csrf` ya había pagado: comprobar por FICHERO deja pasar un `route.ts`
    // con el POST abierto y el DELETE no (o al revés). `perfil/email` exporta los dos, y los dos
    // son gobierno de la propia cuenta: si alguien quita la opción de uno, esto lo dice.
    for (const ruta of PERMITEN) {
      const r = MUTANTES.find((x) => x.ruta === ruta);
      expect(r, `${ruta} ya no existe o no muta`).toBeDefined();
      expect(envoltorios(r!.src), `${ruta} no pasa por mutatingRoute`).toBeGreaterThan(0);
      expect(
        permisos(r!.src),
        `${ruta}: ${envoltorios(r!.src)} métodos envueltos pero ${permisos(r!.src)} con permiso`,
      ).toBe(envoltorios(r!.src));
    }
  });

  it("el censo mira el CÓDIGO, no el comentario que explica la regla", () => {
    // Control con un caso sintético: una ruta que NOMBRA la opción en su docblock para justificar
    // por qué no la usa no puede contar como abierta. Si `soloCodigo` dejara de quitar comentarios,
    // el caso de arriba se pondría rojo por la documentación — y alguien lo "arreglaría" borrándola.
    const conComentario = `/** No lleva cuentaEmpresa: "permite" porque participa. */\nexport const POST = mutatingRoute(h);`;
    expect(permiteEmpresa(conComentario)).toBe(false);
    expect(
      permiteEmpresa(`export const POST = mutatingRoute(h, { cuentaEmpresa: "permite" });`),
    ).toBe(true);
  });

  it("ninguna ruta comprueba `esCuentaEmpresa` por su cuenta", () => {
    // Un `if (user.esCuentaEmpresa)` suelto en una ruta es una SEGUNDA verdad sobre el candado: el
    // día que cambie la regla, una de las dos se quedará atrás. La excepción es el login, que lo
    // usa para elegir DESTINO (no para autorizar), y por eso está nombrada.
    const culpables = rutas()
      .filter((r) => /esCuentaEmpresa/.test(soloCodigo(r.src)) && r.ruta !== "auth/login")
      .map((r) => r.ruta);
    expect(culpables).toEqual([]);
  });

  it("el candado vive en el chokepoint, y está cerrado por defecto", () => {
    const fuente = readFileSync(
      join(process.cwd(), "src", "server", "auth", "mutating-route.ts"),
      "utf8",
    );
    expect(fuente).toMatch(/user\.esCuentaEmpresa && opciones\.cuentaEmpresa !== "permite"/);
  });
});
