/**
 * EL SHELL DE UNA CUENTA DE EMPRESA (Fase 9, P2): la pantalla no ofrece lo que el servidor niega.
 *
 * ┌─ EL FALLO ────────────────────────────────────────────────────────────────────────────────────┐
 * │ P1 cerró en el servidor todo lo que una empresa no puede hacer (subir, votar, comprar, cobrar):│
 * │ `mutatingRoute` le responde 403. Pero el shell seguía siendo el del participante: su botón de  │
 * │ acento decía «Subir vídeo», su barra llevaba Perfil, Puntos, Referidos, Boost y VIP, y su menú │
 * │ de cuenta, «Ver mi perfil». Cada una de esas puertas acababa en un botón que el servidor le    │
 * │ iba a negar.                                                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija, en cuatro bloques:
 *  1. LA NAV de la empresa: solo lo de mirar + su cuenta; cobertura móvil completa; el menú «Más»
 *     DERIVADO, nunca enumerado.
 *  2. EL CENSO DE PÁGINAS de `(app)`: cada una es de PARTICIPANTE (y entonces aparta a la empresa) o
 *     COMPARTIDA. Una página nueva sin clasificar es rojo. Y la nav cuadra con el censo: lo que la nav
 *     de empresa ofrece es compartido; lo que solo tiene el participante, lo aparta.
 *  3. EL PORTAL: cada pestaña tiene su página (ningún «próximamente»), y la cuenta tiene la
 *     contraseña —el aviso de seguridad de un cambio de correo lleva ahí—.
 *  4. EL CABLEADO: el tipo de cuenta sale de la SESIÓN y llega a las dos navs, la barra y el hero.
 *
 * Para romperlo a propósito: añadir "puntos" a `NAV_ESCRITORIO_EMPRESA` (rojo el 1 y el 2); quitar
 * `await apartarCuentaEmpresa()` de /vip (rojo el 2); crear una página sin clasificarla (rojo el 2);
 * añadir una pestaña «Campañas» sin página (rojo el 3); cambiar el destino de /perfil/editar al portal
 * (rojo el 3); pasar `esCuentaEmpresa={false}` fijo a la nav (rojo el 4).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { itemsMenuCuenta } from "../src/app/(app)/(shell)/cuenta-logica";
import {
  SECCIONES_PORTAL,
  seccionPortalActiva,
} from "../src/app/(app)/(shell)/empresa/secciones-portal";
import {
  destinosDe,
  NAV_DESTINOS,
  NAV_ESCRITORIO,
  NAV_ESCRITORIO_EMPRESA,
  NAV_MOVIL,
  NAV_MOVIL_EMPRESA,
  NAV_MOVIL_MAS,
  NAV_MOVIL_MAS_EMPRESA,
} from "../src/components/ui/logic";
import { CTA_EMPRESA } from "../src/lib/cta-principal";

const RAIZ = path.resolve(__dirname, "..");
const APP = path.join(RAIZ, "src", "app", "(app)");
const crudo = (...p: string[]) => readFileSync(path.join(RAIZ, ...p), "utf8");
/** Sin comentarios: un docblock que EXPLICA la regla no la aplica. */
const soloCodigo = (s: string) =>
  s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
const leer = (...p: string[]) => soloCodigo(crudo(...p));

// ---------------------------------------------------------------------------------------------------
// 1. La nav de la empresa
// ---------------------------------------------------------------------------------------------------

/** Lo que es de PARTICIPAR o de "lo mío" como participante. Ninguno en la nav de una empresa. */
const SOLO_DEL_PARTICIPANTE = ["perfil", "puntos", "referidos", "destacados", "vip"] as const;

describe("la nav de una empresa: mirar, y su cuenta", () => {
  it("escritorio: Inicio, Feed, Retos, Ranking y Cuenta", () => {
    expect([...NAV_ESCRITORIO_EMPRESA]).toEqual(["inicio", "feed", "retos", "ranking", "cuenta"]);
  });

  it("ninguna puerta de participante, ni en escritorio ni en móvil", () => {
    const empresa = [...NAV_ESCRITORIO_EMPRESA, ...NAV_MOVIL_EMPRESA, ...NAV_MOVIL_MAS_EMPRESA];
    for (const clave of SOLO_DEL_PARTICIPANTE) {
      expect(empresa, clave).not.toContain(clave);
    }
  });

  it("y la Cuenta de empresa no aparece en la nav del participante", () => {
    for (const lista of [NAV_ESCRITORIO, NAV_MOVIL, NAV_MOVIL_MAS]) {
      expect([...lista]).not.toContain("cuenta");
    }
  });

  it("móvil: cinco huecos, el central es su CTA, y nada se queda sin puerta", () => {
    expect([...NAV_MOVIL_EMPRESA]).toEqual(["feed", "retos", "crear", "cuenta"]);
    const central = destinosDe(NAV_MOVIL_EMPRESA).find((d) => "central" in d && d.central);
    expect(central?.clave).toBe("crear"); // el HUECO; texto y ruta los pone `ctaPrincipal`
    const enMovil = new Set<string>([...NAV_MOVIL_EMPRESA, ...NAV_MOVIL_MAS_EMPRESA]);
    expect(NAV_ESCRITORIO_EMPRESA.filter((c) => !enMovil.has(c))).toEqual([]);
    expect([...NAV_MOVIL_MAS_EMPRESA]).toEqual(["inicio", "ranking"]);
  });

  it("el menú «Más» de la empresa se DERIVA, como el del participante", () => {
    const src = leer("src", "components", "ui", "logic.ts");
    expect(src).toMatch(/NAV_MOVIL_MAS_EMPRESA = NAV_ESCRITORIO_EMPRESA\.filter\(/);
    expect(src).not.toMatch(/NAV_MOVIL_MAS_EMPRESA[^=]*=\s*\[\s*"/);
  });

  it("su portal NO está en la lista: la puerta es el CTA (no el mismo destino dos veces)", () => {
    const hrefs = destinosDe(NAV_ESCRITORIO_EMPRESA).map((d) => d.href);
    expect(hrefs).not.toContain(CTA_EMPRESA.href);
  });

  it("menú de cuenta: su portal, su cuenta y salir; nunca «Ver mi perfil»", () => {
    expect(itemsMenuCuenta(true, true).map((i) => i.id)).toEqual(["empresa", "cuenta", "logout"]);
    expect(itemsMenuCuenta(true, true).map((i) => i.href)).not.toContain("/perfil");
    // El participante y el invitado, como estaban.
    expect(itemsMenuCuenta(true).map((i) => i.id)).toEqual(["perfil", "logout"]);
    expect(itemsMenuCuenta(false, true).map((i) => i.id)).toEqual(["entrar"]);
  });
});

// ---------------------------------------------------------------------------------------------------
// 2. El censo de páginas
// ---------------------------------------------------------------------------------------------------

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return paginas(p);
    return n === "page.tsx" ? [p] : [];
  });
}

/** La ruta de una página, quitando los grupos `(…)`: "(shell)/perfil/editar" -> "/perfil/editar". */
const rutaDe = (fichero: string): string =>
  "/" +
  path
    .relative(APP, path.dirname(fichero))
    .split(path.sep)
    .filter((s) => !/^\(.*\)$/.test(s))
    .join("/");

/** De PARTICIPANTE: una empresa no tiene nada que hacer aquí, y la página la manda a su sitio. */
const PARTICIPANTE: Record<string, "/empresa" | "/empresa/cuenta"> = {
  "/crear": "/empresa",
  "/perfil": "/empresa",
  "/perfil/editar": "/empresa/cuenta",
  "/puntos": "/empresa",
  "/referidos": "/empresa",
  "/vip": "/empresa",
  "/wallet": "/empresa",
  "/boosts": "/empresa",
  "/destacados": "/empresa",
};

/** COMPARTIDAS: mirar (lo que una empresa viene a ver), su portal, y lo público. */
const COMPARTIDAS = [
  "/feed",
  "/inicio",
  "/retos",
  "/retos/[codigo]",
  "/ranking",
  "/buscar",
  "/u/[username]",
  "/notificaciones",
  "/empezar",
  "/empezar/empresa",
  "/empresa",
  "/empresa/cuenta",
];

describe("el censo: toda página de (app) está clasificada", () => {
  const censo = paginas(APP).map((f) => ({
    ruta: rutaDe(f),
    codigo: soloCodigo(readFileSync(f, "utf8")),
  }));

  it("y no hay ninguna sin clasificar (ni una clasificada que ya no exista)", () => {
    const clasificadas = [...Object.keys(PARTICIPANTE), ...COMPARTIDAS].sort();
    expect(censo.map((p) => p.ruta).sort()).toEqual(clasificadas);
  });

  it("cada página de participante aparta a la empresa, a SU sitio", () => {
    for (const [ruta, destino] of Object.entries(PARTICIPANTE)) {
      const pagina = censo.find((p) => p.ruta === ruta)!;
      const esperado =
        destino === "/empresa"
          ? /await apartarCuentaEmpresa\(\);/
          : /await apartarCuentaEmpresa\("\/empresa\/cuenta"\);/;
      expect(pagina.codigo, ruta).toMatch(esperado);
    }
  });

  it("y ninguna compartida lo hace (mirar no se le cierra a nadie)", () => {
    for (const ruta of COMPARTIDAS) {
      const pagina = censo.find((p) => p.ruta === ruta)!;
      expect(pagina.codigo, ruta).not.toContain("apartarCuentaEmpresa");
    }
  });

  it("la nav cuadra con el censo: lo que ofrece a una empresa es compartido", () => {
    const empresa = destinosDe([...NAV_ESCRITORIO_EMPRESA, ...NAV_MOVIL_EMPRESA])
      .filter((d) => !("central" in d && d.central))
      .map((d) => d.href);
    for (const href of [...empresa, CTA_EMPRESA.href]) {
      expect(COMPARTIDAS, href).toContain(href);
    }
  });

  it("y lo que solo tiene el participante, la aparta", () => {
    const soloSuyas = NAV_DESTINOS.filter((d) =>
      (SOLO_DEL_PARTICIPANTE as readonly string[]).includes(d.clave),
    ).map((d) => d.href);
    for (const href of [...soloSuyas, "/crear"]) {
      expect(Object.keys(PARTICIPANTE), href).toContain(href);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// 3. El portal
// ---------------------------------------------------------------------------------------------------

describe("el portal", () => {
  it("cada pestaña tiene su página: ningún «próximamente»", () => {
    for (const s of SECCIONES_PORTAL) {
      const dir = path.join(APP, "(shell)", ...s.href.split("/").filter(Boolean));
      expect(existsSync(path.join(dir, "page.tsx")), s.href).toBe(true);
    }
  });

  it("la pestaña activa: Resumen solo en la raíz; el resto en sí y en sus subrutas", () => {
    expect(seccionPortalActiva("/empresa")).toBe("/empresa");
    expect(seccionPortalActiva("/empresa/cuenta")).toBe("/empresa/cuenta");
    expect(seccionPortalActiva("/empresa/cuenta/algo")).toBe("/empresa/cuenta");
    expect(seccionPortalActiva("/empresax")).toBeNull();
    expect(seccionPortalActiva("/retos")).toBeNull();
  });

  it("el pestañero lo monta el LAYOUT (toda sección lo hereda) y sale de la lista", () => {
    expect(leer("src", "app", "(app)", "(shell)", "empresa", "layout.tsx")).toContain(
      "<NavPortal />",
    );
    const nav = leer("src", "app", "(app)", "(shell)", "empresa", "nav-portal.tsx");
    expect(nav).toContain("SECCIONES_PORTAL.map(");
    expect(nav).not.toMatch(/href="\/empresa/);
  });

  it("la Cuenta tiene correo, contraseña y salida, con los componentes de siempre", () => {
    const cuenta = leer("src", "app", "(app)", "(shell)", "empresa", "cuenta", "page.tsx");
    expect(cuenta).toContain("<CambiarEmail");
    expect(cuenta).toContain("<CambiarPassword />");
    expect(cuenta).toContain("<CerrarSesion");
    expect(cuenta).toContain('from "../../perfil/editar/cambiar-password"');
    // Y no es la ficha del participante: nada del formulario de perfil público.
    expect(cuenta).not.toContain("FormularioEditarPerfil");
  });

  it("el aviso de seguridad de un cambio de correo lleva a la contraseña, también a una empresa", () => {
    // El correo a la dirección ANTIGUA («si no has sido tú, cambia tu contraseña») enlaza a
    // /perfil/editar; para una empresa esa ruta redirige a SU cuenta, que es donde está.
    expect(leer("src", "server", "services", "cambio-email.ts")).toContain(
      'new URL("/perfil/editar", appUrl)',
    );
    expect(PARTICIPANTE["/perfil/editar"]).toBe("/empresa/cuenta");
  });
});

// ---------------------------------------------------------------------------------------------------
// 4. El cableado
// ---------------------------------------------------------------------------------------------------

describe("el tipo de cuenta sale de la SESIÓN y llega a cada pieza", () => {
  const armazon = leer("src", "app", "(app)", "layout.tsx");
  const shell = leer("src", "app", "(app)", "(shell)", "layout.tsx");
  const barra = leer("src", "app", "(app)", "(shell)", "barra-superior.tsx");

  it("el armazón lo lee de la sesión y se lo pasa a las DOS navs", () => {
    expect(armazon).toMatch(/\(await getCurrentUser\(\)\)\?\.esCuentaEmpresa \?\? false/);
    expect(armazon).toMatch(/<NavLateralActiva esCuentaEmpresa=\{esCuentaEmpresa\} \/>/);
    expect(armazon).toMatch(/<NavInferiorActiva rol=\{rol\} esCuentaEmpresa=\{esCuentaEmpresa\}/);
  });

  it("sin contador de avisos para una empresa: ni se cuenta ni se sondea", () => {
    expect(armazon).toMatch(/const conAvisos = rol !== null && !esCuentaEmpresa;/);
    expect(armazon).toMatch(/activo=\{conAvisos\}/);
  });

  it("el shell lo pasa a la barra, y la barra lo reparte: CTA, menú y SIN campana", () => {
    expect(shell).toMatch(/esCuentaEmpresa=\{user\?\.esCuentaEmpresa \?\? false\}/);
    expect(barra).toMatch(/<CtaCrear rol=\{rol\} esCuentaEmpresa=\{esCuentaEmpresa\} \/>/);
    expect(barra).toMatch(
      /<MenuCuenta usuario=\{usuario\} esCuentaEmpresa=\{esCuentaEmpresa\} \/>/,
    );
    expect(barra).toMatch(/usuario && !esCuentaEmpresa \? <CampanaNotificaciones \/>/);
  });

  it("el hero de la portada también", () => {
    expect(leer("src", "app", "(app)", "(shell)", "inicio", "page.tsx")).toMatch(
      /ctaPrincipal\(sesion\?\.role \?\? null, sesion\?\.esCuentaEmpresa \?\? false\)/,
    );
  });

  it("nadie fija el tipo de cuenta a mano", () => {
    const fuentes = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) return fuentes(p);
        return /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    const fijos = [
      ...fuentes(path.join(RAIZ, "src", "app")),
      ...fuentes(path.join(RAIZ, "src", "components")),
    ]
      .filter((f) => /esCuentaEmpresa=\{(true|false)\}/.test(soloCodigo(readFileSync(f, "utf8"))))
      .map((f) => path.relative(RAIZ, f));
    expect(fijos).toEqual([]);
  });

  it("el «+» lo decide `crea`, en los tres sitios del CTA", () => {
    expect(leer("src", "app", "(app)", "(shell)", "cta-crear.tsx")).toMatch(/\{crea \?/);
    expect(leer("src", "app", "(app)", "(shell)", "inicio", "page.tsx")).toMatch(/\{cta\.crea \?/);
    expect(leer("src", "components", "ui", "navegacion.tsx")).toMatch(/\{cta\.crea \? "\+"/);
  });
});
