/**
 * EL REPINTADO NO PUEDE DEJARSE NADA DETRÁS. La paleta vive en `globals.css` y se usa SIEMPRE por
 * token (`var(--df-action)`), pero hay cuatro sitios donde un color de marca está escrito en HEX a
 * mano, cada uno por una razón técnica que no se puede esquivar:
 *
 *  - `src/server/email/plantilla.ts` — un cliente de correo no lee custom properties (Gmail y Outlook
 *    las recortan), así que la paleta del correo son literales. Lo dice su propio comentario... y
 *    hasta ahora nadie lo comprobaba.
 *  - `src/app/icon.svg` — el favicon se sirve como fichero aparte: no tiene acceso a las propiedades
 *    de la página que lo enlaza.
 *  - `src/lib/tema.ts` (`TEMA_COLOR_BARRA`) — la meta `theme-color` necesita un valor literal. Es el
 *    único hex que llega al HTML renderizado.
 *  - `src/app/style-guide/page.tsx` — PUBLICA los valores como texto: es la página de referencia. Esa
 *    ya la ataba `paleta-clara`; aquí solo entra en el censo.
 *
 * QUÉ FALLO EVITA: un repintado toca `globals.css` y se olvida de los otros tres. El producto cambia
 * de color y los correos, la barra del navegador y el icono se quedan con el color viejo. No revienta
 * nada, no salta ninguna excepción y nadie se queja: simplemente llega un correo de otra marca. Es el
 * tipo de fallo que se descubre en una captura de pantalla de un usuario, seis semanas después.
 *
 * Y EL CENSO: fuera de `globals.css`, esos cuatro son los ÚNICOS ficheros que pueden llevar un hex.
 * Un quinto cae en rojo — que es la regla "cero hex fuera de los tokens" convertida en algo que se
 * comprueba en vez de recordarse.
 *
 * Para romperlo a propósito: cambiar `--df-action` en el CSS y no en el correo (rojo), repintar el
 * favicon con otro color (rojo), mover `TEMA_COLOR_BARRA` sin mover `--df-void` (rojo), o escribir un
 * `#ff00ff` en cualquier componente (rojo: el censo).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CLARO, hex, OSCURO } from "./helpers/paleta";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.resolve(RAIZ, rel), "utf8");

const PLANTILLA = leer("src/server/email/plantilla.ts");
const TEMA = leer("src/lib/tema.ts");
const ICONO = leer("src/app/icon.svg");

const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;

// ---------------------------------------------------------------------------
// EL CORREO
// ---------------------------------------------------------------------------

/** Cada color de la paleta del correo y el token del tema OSCURO que copia. */
const CORREO_A_TOKEN: Record<string, string> = {
  void: "--df-void",
  surface: "--df-surface",
  text: "--df-text",
  textDim: "--df-text-dim",
  action: "--df-action",
};

/**
 * Los dos que NO pueden compararse con un token, con su porqué. Sin esta lista habría que aflojar la
 * comprobación entera; con ella, lo que se afloja es exactamente esto y se lee.
 */
const CORREO_SIN_TOKEN: Record<string, string> = {
  // `--df-line` es translúcido (rgb 255 255 255 / 0.1) y en un correo no hay composición fiable: se
  // aproxima a un sólido. No puede ser igual a nada.
  line: "el token es translúcido; aquí es su aproximación sólida",
  // Un tono más apagado que `--df-text-dim`, solo para el pie del correo. No existe como token
  // porque en la interfaz no se usa: el correo tiene una jerarquía más que una pantalla.
  textFaint: "no existe como token: es exclusivo del pie del correo",
};

const COLORES_CORREO = (() => {
  const bloque = /const COLOR = \{([\s\S]*?)\} as const;/.exec(PLANTILLA)?.[1];
  expect(bloque, "no está el bloque `const COLOR` de la plantilla de correo").toBeTruthy();
  return new Map(
    [...bloque!.matchAll(/(\w+):\s*"(#[0-9a-fA-F]{3,6})"/g)].map((m) => [
      m[1]!,
      m[2]!.toLowerCase(),
    ]),
  );
})();

describe("la paleta del correo es la del tema oscuro, no una copia que se quedó atrás", () => {
  it("se encontraron los colores de la plantilla (si no, lo de abajo no mide nada)", () => {
    // Si alguien reformatea el objeto y el regex deja de encontrarlo, los bucles de abajo se quedan
    // sin casos y todo el bloque pasa a verde sin comparar nada. Esto es lo que lo impide.
    expect(COLORES_CORREO.size).toBeGreaterThanOrEqual(7);
  });

  it("cada color del correo o copia un token, o está en la lista de los que no pueden", () => {
    const sinClasificar = [...COLORES_CORREO.keys()].filter(
      (k) => !(k in CORREO_A_TOKEN) && !(k in CORREO_SIN_TOKEN),
    );
    expect(sinClasificar, "añade estos al mapa de tokens o a la lista con su porqué").toEqual([]);
  });

  for (const [clave, token] of Object.entries(CORREO_A_TOKEN)) {
    it(`${clave} del correo === ${token} del tema oscuro`, () => {
      const delCorreo = COLORES_CORREO.get(clave);
      expect(delCorreo, `el correo ya no define ${clave}`).toBeTruthy();
      expect(delCorreo).toBe(hex(OSCURO, token).toLowerCase());
    });
  }

  it("y las excepciones siguen existiendo: no se aparcan colores que ya no están", () => {
    for (const clave of Object.keys(CORREO_SIN_TOKEN)) {
      expect(
        COLORES_CORREO.has(clave),
        `${clave} ya no está en el correo: quita su excepción`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// LA BARRA DEL NAVEGADOR
// ---------------------------------------------------------------------------

describe("el color de la barra del navegador es el fondo de página de SU tema", () => {
  const barra = (() => {
    const bloque = /TEMA_COLOR_BARRA[^=]*=\s*\{([\s\S]*?)\};/.exec(TEMA)?.[1];
    expect(bloque, "no está `TEMA_COLOR_BARRA`").toBeTruthy();
    return new Map(
      [...bloque!.matchAll(/(\w+):\s*"(#[0-9a-fA-F]{3,6})"/g)].map((m) => [
        m[1]!,
        m[2]!.toLowerCase(),
      ]),
    );
  })();

  it("están los dos temas y nada más", () => {
    expect([...barra.keys()].sort()).toEqual(["claro", "oscuro"]);
  });

  it("oscuro === --df-void del tema oscuro", () => {
    expect(barra.get("oscuro")).toBe(hex(OSCURO, "--df-void").toLowerCase());
  });

  it("claro === --df-void del tema claro", () => {
    expect(barra.get("claro")).toBe(hex(CLARO, "--df-void").toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// EL FAVICON
// ---------------------------------------------------------------------------

describe("el favicon lleva los colores de la marca, no los de la marca de antes", () => {
  const fills = [...ICONO.matchAll(/fill="(#[0-9a-fA-F]{3,6})"/g)].map((m) => m[1]!.toLowerCase());

  it("usa exactamente la acción y el fondo del tema oscuro", () => {
    // El icono es la marca en la pestaña: el relleno es el color de ACCIÓN y el rayo va en el fondo
    // de página, igual que el texto de un CTA sólido. Si el icono se rediseña con más colores, este
    // caso cae y toca decidir —que es justo lo que tiene que pasar—, no pasar de largo.
    expect(fills.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(fills)].sort()).toEqual(
      [hex(OSCURO, "--df-action").toLowerCase(), hex(OSCURO, "--df-void").toLowerCase()].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// EL CENSO
// ---------------------------------------------------------------------------

describe("cero hex fuera de los tokens", () => {
  /** Los únicos que pueden llevar un hex, y por qué. Ver el docblock de arriba. */
  const PERMITIDOS: Record<string, string> = {
    "src/app/globals.css": "la paleta: es la fuente de verdad",
    "src/server/email/plantilla.ts": "un correo no lee custom properties",
    "src/app/icon.svg": "el favicon se sirve suelto, sin la página",
    "src/lib/tema.ts": "la meta theme-color necesita un literal",
    "src/app/style-guide/page.tsx": "publica los valores como texto (es la referencia)",
  };

  const ficherosConHex = (() => {
    const fuera = new Set<string>();
    // `src/generated` es el cliente de Prisma: generado y gitignoreado, no lo escribimos nosotros.
    for (const f of readdirSync(path.resolve(RAIZ, "src"), { recursive: true }) as string[]) {
      const rel = `src/${f.split(path.sep).join("/")}`;
      if (rel.startsWith("src/generated/")) continue;
      if (!/\.(ts|tsx|css|svg)$/.test(rel)) continue;
      if (HEX.test(leer(rel))) fuera.add(rel);
      HEX.lastIndex = 0;
    }
    return fuera;
  })();

  it("ningún fichero nuevo escribe un color a mano", () => {
    const intrusos = [...ficherosConHex].filter((f) => !(f in PERMITIDOS)).sort();
    expect(
      intrusos,
      "usa un token `var(--df-*)`; si de verdad no se puede, añádelo arriba con su porqué",
    ).toEqual([]);
  });

  it("y los permitidos siguen llevando hex: no se aparcan permisos muertos", () => {
    // Un permiso para un fichero que ya no tiene hex es una puerta abierta esperando a que alguien
    // escriba un color ahí dentro sin que nadie lo vea.
    const muertos = Object.keys(PERMITIDOS).filter((f) => !ficherosConHex.has(f));
    expect(muertos, "estos ya no llevan hex: quita su permiso").toEqual([]);
  });

  it("y MARCA.md nombra los MISMOS ficheros: el documento no puede mentir", () => {
    // Mismo trato que `/style-guide`, que tampoco puede publicar un color que ya no existe. Un
    // documento de marca que se queda atrás es peor que no tenerlo: se lee, se cree y se decide con
    // él. Si la lista de arriba cambia, la sección 5 de MARCA.md cambia en el mismo commit.
    const marca = leer("MARCA.md");
    const seccion = /\n## 5\.[\s\S]*?(?=\n## )/.exec(marca)?.[0];
    expect(seccion, "no está la sección 5 de MARCA.md (¿se renumeró?)").toBeTruthy();
    const nombrados = [...seccion!.matchAll(/\]\((src\/[^)]+)\)/g)].map((m) => m[1]!);
    expect(nombrados.length, "la sección 5 dejó de enlazar los ficheros").toBeGreaterThanOrEqual(4);
    // `globals.css` no va en esa tabla: no es una copia, es la fuente (se explica en la sección 2).
    const esperados = Object.keys(PERMITIDOS).filter((f) => f !== "src/app/globals.css");
    expect([...new Set(nombrados)].sort()).toEqual(esperados.sort());
  });
});
