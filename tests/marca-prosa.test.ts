/**
 * LA PROSA NO NOMBRA COLORES. Un comentario que dice "el botón magenta" nace verdadero y muere
 * mintiendo el día del repintado — y murieron 107 de golpe, repartidos por 53 ficheros, cuando la
 * marca pasó a verde. La regla que lo evita es nombrar el TRABAJO ("el acento", "la acción", "el
 * dinero") o el TOKEN (`--df-action`), nunca el color: así el comentario sigue siendo cierto con
 * cualquier paleta, que es lo único que se le puede pedir a un comentario sobre color.
 *
 * Y ES AL REVÉS DE LO QUE PARECE: la tentación tras un repintado es cambiar "magenta" por "verde".
 * Eso no arregla nada, solo reinicia el reloj — el siguiente viraje los vuelve a matar a todos. Por
 * eso aquí están prohibidos los nombres de color EN GENERAL, no solo los de la paleta anterior.
 *
 * LA ÚNICA EXCEPCIÓN es el bloque de paleta de `globals.css`. Ahí el comentario va pegado al valor
 * y describe lo que ese valor ES ("lima ácido") — es la definición, el único sitio del repositorio
 * donde un color se nombra por su nombre porque es donde el color vive.
 *
 * Para romperlo a propósito: escribir "el botón magenta" en cualquier vista (rojo), o "el verde de
 * la acción" (rojo también: es la misma trampa con el color nuevo).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.resolve(RAIZ, rel), "utf8");

/**
 * Nombres que SOLO pueden ser un color: si aparecen, están describiendo uno.
 *
 * "VERDE" NO ESTÁ EN LA LISTA, y no por descuido. En este repositorio "verde" significa sobre todo
 * **que pasa**: "el build en verde", "sigue verde el día que alguien la cambie", "un verde/rojo
 * aquí diría bueno/malo". Prohibirla sería pelearse con el vocabulario propio de la casa y obligar
 * a reescribir prosa correcta. Lo que sí se prohíbe es la TRAMPA concreta —pegarle un color a un
 * elemento de interfaz— y esa va abajo, en `TRAMPA`.
 */
const COLORES = /\b(magenta|morado|púrpura|purpura|lima|fucsia|turquesa|cian)\b/gi;

/**
 * La recaída típica después de un repintado: cambiar "el botón magenta" por "el botón verde", que
 * no arregla nada — solo reinicia el reloj hasta el siguiente viraje. Se prohíbe la PAREJA
 * (elemento + color), no el color suelto, para no tocar la prosa que habla de cómo se comporta un
 * color (que es una conversación legítima: un halo verde no pesa igual sobre negro que sobre blanco).
 */
const TRAMPA = /\b(bot[oó]n|cta|acci[oó]n|acento|relleno)\s+(verde|rojo|azul|amarillo|naranja)\b/gi;

/**
 * LAS EXENCIONES VAN POR PALABRA Y FICHERO, no por fichero entero: así `globals.css` puede describir
 * sus propios valores sin que eso abra la puerta a escribir "el botón magenta" en el mismo sitio.
 */
const EXENTOS: Record<string, { palabras: string[]; porque: string }> = {
  "src/app/globals.css": {
    palabras: ["lima"],
    porque: "es donde VIVEN los valores: describir ahí el color es su trabajo",
  },
  // LAS FAMILIAS DE NIVEL SE NOMBRAN POR COLOR, y eso es significado de producto, no decoración: un
  // Challenger es VERDE para la persona, en los dos temas, y `paleta-niveles` lo fija exigiendo que
  // el tono apenas se mueva entre temas. No es un color que un repintado de marca vaya a cambiar.
  "src/lib/niveles.ts": { palabras: ["verde", "cian"], porque: "las familias de nivel" },
  "src/components/ui/fila-puesto.tsx": { palabras: ["verde", "cian"], porque: "ídem" },
  "src/app/(app)/(shell)/ranking/podio-ranking.tsx": {
    palabras: ["verde", "cian"],
    porque: "ídem",
  },
};

const ficheros: string[] = [];
const andar = (dir: string): void => {
  for (const e of readdirSync(path.resolve(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (rel.includes("/generated")) continue;
    if (e.isDirectory()) andar(rel);
    else if (/\.(ts|tsx|css)$/.test(rel)) ficheros.push(rel);
  }
};
andar("src");

describe("ningún comentario nombra un color", () => {
  it("se recorrió `src` de verdad (si no, lo de abajo no busca nada)", () => {
    expect(ficheros.length).toBeGreaterThan(100);
  });

  it("ni el de la marca anterior ni el de ahora", () => {
    const culpables: string[] = [];
    for (const f of ficheros) {
      const permitidas = EXENTOS[f]?.palabras ?? [];
      for (const m of leer(f).matchAll(COLORES)) {
        if (!permitidas.includes(m[0].toLowerCase())) culpables.push(`${f}: "${m[0]}"`);
      }
    }
    expect(
      [...new Set(culpables)].sort(),
      "nombra el trabajo (el acento, el dinero) o el token, no el color",
    ).toEqual([]);
  });

  it("y nadie le pega un color a un botón (la recaída de después del repintado)", () => {
    const culpables: string[] = [];
    for (const f of ficheros) {
      for (const m of leer(f).matchAll(TRAMPA)) culpables.push(`${f}: "${m[0]}"`);
    }
    expect([...new Set(culpables)].sort(), "di qué HACE, no de qué color es").toEqual([]);
  });

  it("y cada exención sigue haciendo falta: no se aparcan permisos muertos", () => {
    for (const [f, { palabras }] of Object.entries(EXENTOS)) {
      const texto = leer(f).toLowerCase();
      const muertas = palabras.filter((p) => !new RegExp(`\\b${p}\\b`).test(texto));
      expect(muertas, `${f} ya no usa estas palabras: quita su permiso`).toEqual([]);
    }
  });
});

describe("el token del realce del dinero se llama por su trabajo", () => {
  const CSS = leer("src/app/globals.css");

  it("`--df-glow-dinero` existe y se deriva de `--df-money`", () => {
    expect(CSS).toMatch(/--df-glow-dinero:\s*drop-shadow\([^;]*var\(--df-money\)/);
  });

  it("`--df-glow-lima` no existe en ninguna parte: el rename no dejó huérfanos", () => {
    const vivos = ficheros.filter((f) => leer(f).includes("--df-glow-lima"));
    expect(vivos, "quedó una referencia al nombre viejo").toEqual([]);
  });

  it("y todo el que lo usa, lo usa por el nombre nuevo", () => {
    // Si el rename se hubiera hecho solo en el CSS, los `filter: var(--df-glow-lima)` de las vistas
    // apuntarían a un token inexistente: el halo del dinero desaparecería sin que fallara nada.
    const usos = ficheros.filter(
      (f) => f !== "src/app/globals.css" && leer(f).includes("--df-glow-dinero"),
    );
    expect(
      usos.length,
      "nadie usa el realce del dinero: ¿se perdió por el camino?",
    ).toBeGreaterThanOrEqual(2);
  });
});
