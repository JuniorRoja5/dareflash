/**
 * LOS ICONOS DE LA PESTAÑA Y DEL ESCRITORIO SON DE DAREFLASH.
 *
 * ┌─ QUÉ SE FIJA Y POR QUÉ ─────────────────────────────────────────────────────────────────────┐
 * │ El favicon de `create-next-app` sobrevive en muchos proyectos porque NADA falla por tenerlo: │
 * │ el sitio funciona, los tests pasan, el despliegue sale verde, y el logo de otro está en la   │
 * │ pestaña de todo el mundo. Lo mismo con el icono de iOS: sin `apple-icon`, añadir la web a la │
 * │ pantalla de inicio guarda una CAPTURA de la página en vez del logo.                           │
 * │                                                                                               │
 * │ Y los dos tienen que ser EL MISMO rayo: son una silueta de marca, no dos dibujos parecidos.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * El COLOR ya lo ata `marca-hex-duplicados` (el hex del icono sigue a `--df-action`). Aquí se fija
 * lo otro: qué ficheros existen, que el trazado es el de la marca y que el de iOS es un PNG del
 * tamaño que pide Safari.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const ICONO = readFileSync(join(RAIZ, "src", "app", "icon.svg"), "utf8");
const LOGO = readFileSync(join(RAIZ, "src", "components", "ui", "logo.tsx"), "utf8");

/** El trazado del rayo, tal cual lo declara el componente de marca. */
const RAYO = /const RAYO = "([^"]+)"/.exec(LOGO)?.[1] ?? "";

describe("el favicon", () => {
  it("es el RAYO de la marca, el mismo que el logo", () => {
    expect(RAYO, "el componente de marca ya no declara `RAYO`").toBeTruthy();
    expect(ICONO, "el favicon dibuja otra cosa que el logo").toContain(RAYO);
  });

  it("y no queda ni rastro del de create-next-app", () => {
    // El suyo es un SVG con la «N» de Next y su gradiente. Cualquiera de estas marcas delata que
    // el fichero volvió a ser el de la plantilla.
    for (const rastro of ["nextjs", "next.js", "linearGradient", "paint0_linear", "Vercel"]) {
      expect(ICONO.toLowerCase()).not.toContain(rastro.toLowerCase());
    }
  });
});

describe("el icono de iOS", () => {
  const RUTA = join(RAIZ, "src", "app", "apple-icon.png");

  it("existe: sin él, «añadir a inicio» guarda una captura de la página", () => {
    // Safari NO acepta un SVG como `apple-touch-icon`, así que el `icon.svg` no le vale. Es un
    // PNG commiteado a propósito —se regenera a mano cuando cambie el rayo— y no un paso de build:
    // un icono que depende de que alguien recuerde ejecutar algo acaba desapareciendo.
    expect(statSync(RUTA).isFile()).toBe(true);
  });

  it("es un PNG de 180×180, que es lo que pide Safari", () => {
    const bytes = readFileSync(RUTA);
    // Firma PNG + cabecera IHDR: ancho y alto son dos enteros de 32 bits en el offset 16 y 20.
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.readUInt32BE(16)).toBe(180);
    expect(bytes.readUInt32BE(20)).toBe(180);
  });

  it("y no pesa como una foto: es un icono plano", () => {
    // Un PNG de 180×180 con dos colores cabe en unos pocos KB. Si un día pesa cien, alguien ha
    // metido una captura o una exportación con capas.
    expect(statSync(RUTA).size).toBeLessThan(32 * 1024);
  });
});
