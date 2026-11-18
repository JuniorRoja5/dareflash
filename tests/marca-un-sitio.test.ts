/**
 * LA MARCA, ESCRITA EN UN SOLO SITIO (Fase 11 · PM1). Test ESTRUCTURAL: fija una decisión que se
 * deshace en silencio con una línea —un título, un asunto o un aviso que vuelve a escribir el nombre
 * a mano—, y que solo se nota el día que la marca cambia y ese sitio sigue diciendo la vieja.
 *
 * Lo que fija:
 *  - el nombre, en CUALQUIER forma (DareFlash, DAREFLASH, dareflash, «Dare Flash», «dare-flash»), no
 *    aparece en el CÓDIGO de `src/` —los comentarios no cuentan: contar por qué está aquí es legítimo—
 *    salvo en `config/marca.ts` y en las EXCEPCIONES declaradas abajo, cada una con su porqué;
 *  - las excepciones son exactamente esas: una nueva sin declarar es rojo (nombra el fichero), y una
 *    declarada que ya no lleva la marca también (una excepción caducada es una puerta abierta);
 *  - el layout raíz saca los títulos de `TITULO_RAIZ`, y el logo es UNO: su rayo no está copiado.
 *
 * Que todo lo que lee la marca la SIGA al cambiarla, y que la vieja siga vetada, lo prueba
 * `tests/render/marca-cambiada.test.tsx`. Que nada visible cambió al mover la marca aquí se comprobó
 * byte a byte en la entrega de la PM1 (títulos de todas las rutas, texto de las páginas y correos).
 *
 * Para romperlo a propósito: escribir «DareFlash» en un título o un asunto (rojo, nombra el fichero);
 * volver a escribir el rayo en `navegacion.tsx` (rojo); quitar una excepción de la lista (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RAIZ, rel, sinComentarios } from "./helpers/grafo-imports";

/** El nombre en cualquier forma: mayúsculas o no, junto o separado por espacio, guion o guion bajo. */
const NOMBRE = /dare[\s_-]?flash/i;

/**
 * Los ficheros donde el nombre sigue escrito porque la constante NO LLEGA, y por qué. Es la lista
 * entera: ni uno más.
 */
const EXCEPCIONES: Record<string, string> = {
  "src/config/marca.ts": "la fuente: aquí se escribe la marca, una vez",
  "src/config/env.ts":
    "el DOMINIO, que es configuración y no marca: el ejemplo del error de APP_URL y el valor por " +
    "defecto de SMTP_HELO_NAME (el `.env` lo sobrescribe; la PM2 cambia el dominio ahí)",
  "src/app/icon.svg": "el favicon es un fichero estático: no importa nada (aria-label)",
  "src/app/globals.css":
    "el NOMBRE INTERNO de las familias de fuente de respaldo, no texto visible (lo fija fuentes-locales)",
  "src/app/fuentes/index.ts": "los mismos nombres internos de familia de fuente, en su declaración",
};

function ficheros(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n !== "generated") out.push(...ficheros(p));
    } else if (!/\.(woff2?|png|jpe?g|webp|ico|gif)$/.test(n)) out.push(p);
  }
  return out;
}

/** Sin comentarios de JS/TS (los de bloque, incluidos los `{/* … *\/}` de JSX, y los de línea) ni de HTML. */
const codigo = (f: string) =>
  sinComentarios(readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, ""));

describe("la marca no se escribe a mano fuera de config/marca.ts", () => {
  const conMarca = ficheros(path.join(RAIZ, "src"))
    .map((f) => ({
      f: rel(f),
      linea: codigo(f)
        .split("\n")
        .find((l) => NOMBRE.test(l)),
    }))
    .filter((x) => x.linea !== undefined);

  it("ni un fichero fuera de las excepciones declaradas", () => {
    const fuera = conMarca
      .filter((x) => !(x.f in EXCEPCIONES))
      .map((x) => `${x.f}: ${x.linea!.trim().slice(0, 120)}`);
    expect(fuera, `la marca escrita a mano en:\n${fuera.join("\n")}`).toEqual([]);
  });

  it("y ninguna excepción caducada: cada una sigue llevando el nombre", () => {
    const encontrados = new Set(conMarca.map((x) => x.f));
    const caducadas = Object.keys(EXCEPCIONES).filter((f) => !encontrados.has(f));
    expect(caducadas, "excepciones que ya no hacen falta: quítalas de la lista").toEqual([]);
  });

  it("control: el detector ve el nombre en todas sus formas y no mira los comentarios", () => {
    const ve = (t: string) => NOMBRE.test(sinComentarios(t));
    for (const forma of [
      "DareFlash",
      "DAREFLASH",
      "dareflash",
      "Dare Flash",
      "dare-flash",
      "dare_flash",
    ]) {
      expect(ve(`const t = "${forma}";`), forma).toBe(true);
    }
    expect(ve(`/** La marca es DareFlash */\n// dareflash\nconst a = 1;`)).toBe(false);
    expect(conMarca.length, "no ha leído src/").toBeGreaterThanOrEqual(
      Object.keys(EXCEPCIONES).length,
    );
  });
});

describe("los títulos y el logo, en un sitio", () => {
  it("el layout raíz toma el título de TITULO_RAIZ", () => {
    expect(codigo(path.join(RAIZ, "src/app/layout.tsx"))).toMatch(/title:\s*TITULO_RAIZ\b/);
  });

  it("el rayo de la marca se escribe UNA vez en código (logo.tsx); el favicon es la excepción estática", () => {
    const RAYO = "M13 3 5 13.5h5l-1 7.5 8-10.5h-5z";
    const conRayo = ficheros(path.join(RAIZ, "src"))
      .filter((f) => readFileSync(f, "utf8").includes(RAYO))
      .map(rel)
      .sort();
    expect(conRayo).toEqual(["src/app/icon.svg", "src/components/ui/logo.tsx"]);
  });
});
