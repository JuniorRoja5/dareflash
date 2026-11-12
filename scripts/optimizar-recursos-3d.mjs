// GENERA LAS IMÁGENES 3D DE LA PORTADA a partir de los originales de Junior (recursos/3d/, sin versionar).
//
//   node scripts/optimizar-recursos-3d.mjs
//
// Los originales NO se versionan (repositorio público; su redistribución en alta resolución es cosa de
// su licencia): se versiona lo que sale de aquí, en public/img/3d/. Volver a ejecutarlo con los mismos
// originales y la misma paleta da los mismos ficheros.
//
// ┌─ EL COLOR SALE DE LOS TOKENS, NO DE AQUÍ ─────────────────────────────────────────────────────────┐
// │ Ni un hex en este fichero (MARCA.md §5: hay cuatro sitios con un hex a mano y no hay un quinto).    │
// │ Lee los valores de `--df-action`, `--df-money` y `--df-rank` de src/app/globals.css, TEMA A TEMA,   │
// │ y saca una versión por tema: en claro el dinero es un dorado oscuro y la acción un verde más        │
// │ profundo, y una sola imagen quedaría sucia o sin contraste en uno de los dos. Si cambia la paleta,  │
// │ se vuelve a ejecutar y ya.                                                                          │
// └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
//
// Qué se hace con cada uno (MARCA.md: un trabajo por token):
//  - rayo    → `--df-action`, PLANO (el original es una silueta de un solo color: se repinta entero).
//  - moneda  → `--df-money` (solo dinero), TEÑIDA: conserva su sombreado, cambia el tono.
//  - trofeo  → `--df-rank` (solo podio), teñido igual.
//  - pasos   → NEUTROS (gris, más claro en el tema oscuro y más oscuro en el claro). Los originales son
//              iconos de muchos colores, uno con MAGENTA, y la marca no admite ni magenta ni morado ni un
//              acento por adorno: los pasos no son acción ni dinero.
// Sin sombra ni glow en la imagen: el glow lo pone la página con los tokens.
//
// Tamaños: los originales son de 512 px, así que nunca se sirven más grandes (≤ 256 px CSS a 2×). Cada
// pieza sale en los anchos que usa su sitio, en AVIF y WebP, y ninguna pasa de 80 KB (si pasara, falla).
import { mkdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEN = path.join(RAIZ, "recursos", "3d");
const DESTINO = path.join(RAIZ, "public", "img", "3d");
const MAX_BYTES = 80 * 1024;

/** El valor de un token dentro del bloque de un tema de globals.css. */
function token(css, selectorBloque, nombre) {
  const inicio = css.indexOf(selectorBloque);
  if (inicio === -1) throw new Error(`no encuentro el bloque ${selectorBloque} en globals.css`);
  const fin = css.indexOf("\n}", inicio);
  const bloque = css.slice(inicio, fin);
  const m = new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(bloque);
  if (!m) throw new Error(`no encuentro --${nombre} (en hex) en ${selectorBloque}`);
  return m[1];
}

const css = readFileSync(path.join(RAIZ, "src", "app", "globals.css"), "utf8");
const TEMAS = {
  oscuro: '[data-theme="dark"] {',
  claro: '[data-theme="light"] {',
};

/** Los rasgos de cada pieza. `anchos`: los que usa su sitio en la portada (a 1× y 2×). */
const PIEZAS = [
  { nombre: "rayo", fichero: "rayo.png", modo: "plano", tono: "df-action", anchos: [176, 352] },
  { nombre: "moneda", fichero: "moneda.png", modo: "tinte", tono: "df-money", anchos: [48, 96] },
  { nombre: "trofeo", fichero: "trofeo.png", modo: "tinte", tono: "df-rank", anchos: [72, 144] },
  { nombre: "paso-1-reto", fichero: "paso-1-reto.png", modo: "neutro", anchos: [64, 128] },
  { nombre: "paso-2-video", fichero: "paso-2-video.png", modo: "neutro", anchos: [64, 128] },
  { nombre: "paso-3-voto", fichero: "paso-3-voto.png", modo: "neutro", anchos: [64, 128] },
];

const rgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

/** La imagen ya coloreada para un tema, a 512 px, con su transparencia intacta. */
async function colorear(pieza, tema) {
  const src = path.join(ORIGEN, pieza.fichero);
  const meta = await sharp(src).metadata();
  if (!meta.hasAlpha) throw new Error(`${pieza.fichero}: sin transparencia`);
  if ((meta.width ?? 0) < Math.max(...pieza.anchos)) {
    throw new Error(`${pieza.fichero}: ${meta.width} px, menos que el ancho mayor que necesita`);
  }
  const alfa = await sharp(src).ensureAlpha().extractChannel(3).toBuffer();
  if (pieza.modo === "plano") {
    const c = rgb(token(css, TEMAS[tema], pieza.tono));
    return sharp({
      create: { width: meta.width, height: meta.height, channels: 3, background: c },
    })
      .joinChannel(alfa)
      .png()
      .toBuffer();
  }
  if (pieza.modo === "tinte") {
    const c = rgb(token(css, TEMAS[tema], pieza.tono));
    // En claro, un pelo más oscura: el original es muy luminoso y sobre blanco perdía el borde.
    const brillo = tema === "claro" ? 0.82 : 1;
    const color = await sharp(src)
      .removeAlpha()
      .tint(c)
      .modulate({ brightness: brillo })
      .toBuffer();
    return sharp(color).joinChannel(alfa).png().toBuffer();
  }
  // NEUTRO: gris, llevado a una franja de luminosidad que se lea sobre el fondo de cada tema.
  const [a, b] = tema === "oscuro" ? [0.55, 105] : [0.55, 20];
  const gris = await sharp(src)
    .removeAlpha()
    .greyscale()
    .linear(a, b)
    .toColourspace("srgb")
    .toBuffer();
  return sharp(gris).joinChannel(alfa).png().toBuffer();
}

mkdirSync(DESTINO, { recursive: true });
let total = 0;
for (const pieza of PIEZAS) {
  if (!existsSync(path.join(ORIGEN, pieza.fichero))) {
    throw new Error(`falta recursos/3d/${pieza.fichero}`);
  }
  for (const tema of Object.keys(TEMAS)) {
    const base = await colorear(pieza, tema);
    for (const ancho of pieza.anchos) {
      for (const [ext, opciones] of [
        ["avif", { quality: 62, effort: 6 }],
        ["webp", { quality: 82, alphaQuality: 90, effort: 6 }],
      ]) {
        const salida = path.join(DESTINO, `${pieza.nombre}-${tema}-${ancho}.${ext}`);
        await sharp(base).resize(ancho, ancho, { fit: "contain" })[ext](opciones).toFile(salida);
        const bytes = statSync(salida).size;
        if (bytes > MAX_BYTES) throw new Error(`${salida}: ${bytes} bytes (> 80 KB)`);
        total += bytes;
        console.log(`${path.relative(RAIZ, salida).padEnd(46)} ${(bytes / 1024).toFixed(1)} KB`);
      }
    }
  }
}
console.log(`total: ${(total / 1024).toFixed(1)} KB`);
