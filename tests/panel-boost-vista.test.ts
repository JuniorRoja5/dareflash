/**
 * EL PANEL DE BOOST — las decisiones que se pueden deshacer en silencio.
 *
 * ┌─ LA PRIMERA ES LA QUE ESTA PIEZA EXISTE PARA NO ROMPER ───────────────────────────────────────┐
 * │ El panel NO puede usar la consulta del escaparate. `destacadosVigentes` deduplica por persona │
 * │ —correcto en la portada— y aquí haría que "retirar" cortara una sola aparición de quien       │
 * │ encadenó dos: el perfil seguiría en la portada por la otra y NADA fallaría. El único que se   │
 * │ entera mal es el moderador.                                                                   │
 * │                                                                                               │
 * │ El comportamiento lo fija `boost-admin` con la base de datos. Esto fija lo que ese test no    │
 * │ puede ver: que la PANTALLA no se cablee a la consulta equivocada, y que la acción no acepte    │
 * │ un id de aparición — porque si el parámetro existiera, alguien lo usaría.                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y lo demás:
 *  - EL ROL SE DERIVA de `secciones.ts`, en la página y en los DOS endpoints. Ni un literal "ADMIN".
 *  - LA SECCIÓN DEJA DE SER PLACEHOLDER (`fase: null`) y ya no pinta el `Placeholder`.
 *  - EL RECUENTO SE ENSEÑA: es lo que explica qué va a hacer "retirar".
 *  - CERO COLOR A MANO.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { seccionPorHref } from "../src/app/panel/secciones";

const RAIZ = process.cwd();
const crudo = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
/** Sin comentarios: los docblocks de esta pieza EXPLICAN la regla, y explicarla no es aplicarla. */
const leer = (...p: string[]) =>
  crudo(...p)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGINA = ["src", "app", "panel", "boost", "page.tsx"];
const RETIRAR_UI = ["src", "app", "panel", "boost", "retirar-destacado.tsx"];
const AJUSTAR_UI = ["src", "app", "panel", "boost", "ajustar-creditos.tsx"];
const RUTA_RETIRAR = ["src", "app", "api", "panel", "boost", "retirar", "route.ts"];
const RUTA_AJUSTAR = ["src", "app", "api", "panel", "boost", "ajustar", "route.ts"];
const SERVICIO = ["src", "server", "services", "boost-admin.ts"];

const VISTAS = [PAGINA, RETIRAR_UI, AJUSTAR_UI] as const;

describe("el panel NO usa la consulta del escaparate", () => {
  it("la página lee `destacadosPanel`, no `destacadosVigentes`", () => {
    const page = leer(...PAGINA);
    expect(page).toContain("destacadosPanel");
    expect(
      page,
      "la pantalla se ha cableado a la consulta deduplicada del escaparate",
    ).not.toContain("destacadosVigentes");
  });

  it("y el servicio del panel tampoco la importa", () => {
    // Si el servicio la reusara, el panel heredaría el dedup por la puerta de atrás.
    expect(leer(...SERVICIO)).not.toContain("boost-destacados");
  });

  it("la página enseña el RECUENTO de apariciones", () => {
    // Sin el número, "retirar" parece una acción sobre una aparición. Con él, se entiende que son
    // varias — que es justo lo que cambia el significado del botón.
    const page = leer(...PAGINA);
    expect(page).toMatch(/apariciones/);
    expect(page).toMatch(/data-apariciones=\{d\.apariciones\}/);
  });
});

describe("retirar opera sobre la PERSONA", () => {
  it("la ruta NO acepta un id de aparición: solo `userId`", () => {
    // El parámetro que parecía natural era la trampa. Al no existir, el error no se puede cometer.
    const ruta = leer(...RUTA_RETIRAR);
    expect(ruta).toMatch(/CuerpoSchema = z\.object\(\{ userId:/);
    expect(ruta, "la ruta acepta una aparición concreta").not.toMatch(
      /activacionId|apariciónId|aparicionId/,
    );
  });

  it("el servicio expira TODAS las vigentes de esa persona", () => {
    const serv = leer(...SERVICIO);
    expect(serv).toMatch(/updateMany\(/);
    expect(serv).toMatch(/where: \{ userId, expiresAt: \{ gt: ahora \} \}/);
    expect(serv).toMatch(/data: \{ expiresAt: ahora \}/);
  });

  it("y NO toca el saldo: retirar no devuelve el Boost", () => {
    const serv = leer(...SERVICIO);
    const retirar = /export async function retirarDelEscaparate[\s\S]*?\n\}/.exec(serv)?.[0] ?? "";
    expect(retirar.length, "no encuentro la función").toBeGreaterThan(100);
    expect(retirar, "retirar mueve créditos").not.toMatch(/applyBoostCredits|boostBalance/);
  });

  it("la UI dice CUÁNTAS va a expirar antes de hacerlo", () => {
    const ui = leer(...RETIRAR_UI);
    expect(ui).toMatch(/apariciones/);
    // Y confirma antes: toca el escaparate de una persona real.
    expect(ui).toMatch(/fase === "confirmar"|setFase\("confirmar"\)/);
  });

  it("y dice su LÍMITE: no impide volver a activar", () => {
    // Dejarlo implícito invitaría a usar este botón para algo que no hace. El freno permanente son
    // los controles de cuenta.
    const page = crudo(...PAGINA);
    expect(page).toMatch(/No impide que vuelva a destacarse/);
    expect(page).toContain("/panel/usuarios");
  });
});

describe("el ajuste de créditos calca el de puntos", () => {
  it("escribe por el ledger, nunca un UPDATE del saldo", () => {
    const serv = leer(...SERVICIO);
    expect(serv).toContain("applyBoostCredits");
    expect(serv, "mueve el saldo a mano").not.toMatch(/boostBalance:\s*\{/);
  });

  it("con motivo obligatorio y en la fila", () => {
    const serv = leer(...SERVICIO);
    expect(serv).toContain("AJUSTE_NOTA_MIN");
    expect(serv).toMatch(/NOTA_OBLIGATORIA/);
    // Exigir el motivo y no guardarlo sería pedir que se escriba para la papelera.
    expect(serv).toMatch(/^\s+nota,$/m);
  });

  it("y con la clave de idempotencia namespaceada por admin", () => {
    const serv = leer(...SERVICIO);
    expect(serv).toMatch(/claveAjusteBoost\(entrada\.adminId, entrada\.clave\)/);
    expect(serv).toMatch(/boost:ajuste:\$\{adminId\}:\$\{clave\}/);
  });

  it("NO comprueba el saldo por su cuenta: eso lo hace el primitivo", () => {
    // Una segunda comprobación fuera del bloqueo del `User` sería una segunda verdad con su propia
    // ventana de carrera. `allowNegative: false` del ledger ya lo rechaza.
    const serv = leer(...SERVICIO);
    expect(serv, "comprueba el saldo a mano antes de ajustar").not.toMatch(
      /saldo\s*[<>]=?|boostBalance\s*[<>]/,
    );
  });

  it("y el formulario no renueva la clave tras un FALLO: reintentar no duplica", () => {
    const ui = leer(...AJUSTAR_UI);
    // La clave se renueva al CAMBIAR la intención y tras un ÉXITO, no en cada envío.
    expect(ui).toMatch(/setClave\(crypto\.randomUUID\(\)\)/);
    const traFallo = ui.slice(ui.indexOf("No se pudo aplicar el ajuste"));
    expect(traFallo, "renueva la clave tras un fallo").not.toMatch(/setClave\(/);
  });

  it("el ajuste NO destaca a nadie, y la pantalla lo dice", () => {
    // Son dos cosas distintas y es fácil esperar que una haga la otra.
    expect(leer(...SERVICIO)).not.toMatch(/boostActivation\.create/);
    expect(crudo(...AJUSTAR_UI)).toMatch(/No activa ni retira ninguna aparición destacada/);
  });
});

describe("el rol se deriva de `secciones.ts`, nunca se escribe", () => {
  it("la sección ya no es placeholder", () => {
    expect(seccionPorHref("/panel/boost")?.fase).toBeNull();
    expect(seccionPorHref("/panel/boost")?.rol).toBe("ADMIN");
  });

  it("y la página ya no pinta el Placeholder", () => {
    const page = leer(...PAGINA);
    expect(page, "sigue pintando el placeholder sobre una pantalla que funciona").not.toContain(
      "<Placeholder",
    );
    expect(page).toContain('requireSeccion("/panel/boost")');
  });

  it("la página no escribe su rol a mano", () => {
    expect(leer(...PAGINA)).not.toMatch(/requireRole\(/);
  });

  it("y los DOS endpoints lo derivan igual, sin literal", () => {
    // Un `requireRole("ADMIN")` en un endpoint sería la tercera verdad: el día que Boost cambie de
    // rol, la nav y la página cambiarían y el endpoint no.
    for (const ruta of [RUTA_RETIRAR, RUTA_AJUSTAR]) {
      const src = leer(...ruta);
      expect(src, ruta.join("/")).toMatch(/requireRole\(rolDeRuta\("\/panel\/boost"\)\)/);
      expect(src, `${ruta.join("/")} escribe el rol a mano`).not.toMatch(/requireRole\("/);
    }
  });

  it("y los dos pasan por `mutatingRoute`", () => {
    for (const ruta of [RUTA_RETIRAR, RUTA_AJUSTAR]) {
      expect(leer(...ruta), ruta.join("/")).toContain("mutatingRoute(");
    }
  });
});

describe("cero color a mano", () => {
  it.each(VISTAS.map((v) => [v.join("/"), v] as const))("%s no lleva hex ni rgb()", (_, ruta) => {
    const src = leer(...ruta);
    expect(src, "hex a mano").not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src, "rgb()/rgba() a mano").not.toMatch(/\brgba?\(/);
  });

  it("y el token que usa existe en globals.css", () => {
    const todo = VISTAS.map((v) => leer(...v)).join("\n");
    const vars = [...todo.matchAll(/var\((--df-[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(0);
    const css = crudo("src", "app", "globals.css");
    for (const v of new Set(vars)) expect(css, `${v} no existe`).toContain(`${v}:`);
  });
});

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia los ficheros de verdad", () => {
    for (const ruta of [PAGINA, RETIRAR_UI, AJUSTAR_UI, RUTA_RETIRAR, RUTA_AJUSTAR, SERVICIO]) {
      expect(leer(...ruta).length, ruta.join("/")).toBeLessThan(crudo(...ruta).length);
    }
    // Controles con casos REALES: los tres ficheros MENCIONAN en prosa justo lo que no hacen.
    expect(crudo(...PAGINA)).toContain("destacadosVigentes");
    expect(leer(...PAGINA)).not.toContain("destacadosVigentes");
    expect(crudo(...PAGINA)).toMatch(/requireRole\(/);
    expect(leer(...PAGINA)).not.toMatch(/requireRole\(/);
    expect(crudo(...RUTA_RETIRAR)).toMatch(/aparición/);
  });

  it("y la pieza existe: los ficheros están donde el guard de dos lados los espera", () => {
    for (const ruta of [PAGINA, RUTA_RETIRAR, RUTA_AJUSTAR, SERVICIO]) {
      expect(existsSync(join(RAIZ, ...ruta)), ruta.join("/")).toBe(true);
    }
  });
});
