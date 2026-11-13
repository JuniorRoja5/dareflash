/**
 * UN SOLO DIBUJO DEL ANUNCIO: lo que la empresa ve en «Así se verá» es lo que se publica.
 *
 * Antes la vista previa del portal era un dibujo APARTE (su propia imagen, su propio texto, su propia
 * etiqueta en gris pequeño) y la portada pintaba otro: la empresa aprobaba una cosa y salía otra. Ahora
 * los dos salen de la MISMA función (`piezaDeCampana`, la que usa el reparto) y del MISMO componente
 * (`TarjetaAnuncio`). Esto lo fija:
 *  1. La vista previa pinta `TarjetaAnuncio` con `piezaDeCampana(c)` y no dibuja nada suyo.
 *  2. El reparto construye la pieza servida con `piezaDeCampana`.
 *  3. La portada pinta sus dos huecos con `TarjetaAnuncio`, y no queda otro componente de anuncio de
 *     portada (la antigua `PiezaPortada`, con su variante «compacta»).
 *  4. Las reglas de marca del componente: sin sombras ni colores sueltos (MARCA.md).
 *
 * Para romperlo: volver a dibujar la vista previa a mano (rojo el 1); construir la pieza servida en
 * línea en el reparto (rojo el 2); poner `shadow-` en la tarjeta (rojo el 4).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const leer = (...p: string[]) =>
  readFileSync(path.join(RAIZ, ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PREVIA = ["src", "app", "(app)", "(shell)", "empresa", "publicidad", "[id]", "page.tsx"];
const PORTADA = ["src", "app", "(app)", "(shell)", "inicio", "page.tsx"];
const ENTREGA = ["src", "server", "services", "publicidad-entrega.ts"];

describe("la vista previa ES el anuncio", () => {
  it("pinta `TarjetaAnuncio` con la pieza de `piezaDeCampana`, en modo previa", () => {
    const c = leer(...PREVIA);
    expect(c).toMatch(/<TarjetaAnuncio pieza=\{piezaDeCampana\(c\)\} previa \/>/);
    expect(c).toMatch(/import \{ TarjetaAnuncio \} from "@\/components\/ui\/tarjeta-anuncio"/);
    // Nada dibujado a mano: ni una imagen ni una etiqueta suya.
    expect(c).not.toMatch(/<img\b/);
    // (La miga «← Publicidad» de arriba es navegación, no la etiqueta: por eso se busca la ETIQUETA
    // dibujada —el texto en versalitas espaciadas— y la constante, no la palabra suelta.)
    expect(c).not.toMatch(/tracking-widest[^"]*">\s*Publicidad\s*</);
    expect(c).not.toMatch(/ETIQUETA_PIEZA_CAMPANA/);
  });

  it("el reparto construye la pieza servida con la MISMA función", () => {
    const c = leer(...ENTREGA);
    expect(c).toMatch(/export function piezaDeCampana\(/);
    expect(c).toMatch(/return piezaDeCampana\(elegida\)/);
    // Y no hay otra forma de construir una pieza de campaña en ese fichero.
    // (Un VALOR `tipo: "campana",`, no el tipo de la interfaz `tipo: "campana" | "casa"`.)
    expect(c.match(/tipo: "campana",/g)).toHaveLength(1);
  });
});

describe("la portada", () => {
  it("pinta sus DOS huecos con `TarjetaAnuncio`", () => {
    const c = leer(...PORTADA);
    expect(c.match(/<TarjetaAnuncio pieza=\{espacio[12]\}/g)).toHaveLength(2);
  });

  it("no queda otro componente de anuncio de portada", () => {
    expect(existsSync(path.join(RAIZ, "src", "components", "ui", "pieza-portada.tsx"))).toBe(false);
    expect(leer(...PORTADA)).not.toMatch(/PiezaPortada|compacta/);
  });
});

describe("la tarjeta respeta MARCA.md", () => {
  for (const f of ["tarjeta-anuncio.tsx", "imagen-anuncio.tsx"]) {
    it(`${f}: sin sombras, sin hex y sin el acento de acción`, () => {
      const c = leer("src", "components", "ui", f);
      expect(c).not.toMatch(/shadow/);
      expect(c).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(c).not.toMatch(/\b(?:bg|text|border|ring)-action\b|df-action/);
    });
  }

  it("la etiqueta se pinta con el contraste del texto principal, no el atenuado", () => {
    const c = leer("src", "components", "ui", "tarjeta-anuncio.tsx");
    const etiqueta = c.match(/data-etiqueta-anuncio\s+className="([^"]+)"/)?.[1] ?? "";
    expect(etiqueta).toMatch(/\btext-text\b/);
    expect(etiqueta).not.toMatch(/text-text-dim/);
  });
});
