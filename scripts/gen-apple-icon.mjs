/**
 * Genera `src/app/apple-icon.png` (180x180) desde `src/app/icon.svg`.
 *
 * ┌─ POR QUE UN PNG COMMITEADO Y NO UN PASO DE BUILD ──────────────────────────────────────────┐
 * │ Safari NO acepta un SVG como `apple-touch-icon`, asi que hace falta un raster. Generarlo en │
 * │ cada build añadiria `sharp` al camino de compilacion por un fichero de 1,5 KB que cambia    │
 * │ una vez cada varios años. Va commiteado, y `tests/iconos-marca` vigila que siga ahi, con su │
 * │ tamaño y con el rayo de la marca.                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se ejecuta A MANO cuando cambie el icono:  node scripts/gen-apple-icon.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(RAIZ, "src", "app", "icon.svg"), "utf8");

// iOS RECORTA las esquinas por su cuenta (squircle), asi que el PNG va SIN radio propio: con el
// `rx` del SVG se verian dos redondeos distintos, uno dentro del otro.
const sinRadio = svg.replace(/ rx="\d+"/, "");
// 180 es el tamaño que pide Safari para `apple-touch-icon`; el resto los deriva el sistema.
const png = await sharp(Buffer.from(sinRadio), { density: 384 })
  .resize(180, 180)
  .png({ compressionLevel: 9 })
  .toBuffer();

const destino = join(RAIZ, "src", "app", "apple-icon.png");
writeFileSync(destino, png);
console.log(`[iconos] apple-icon.png 180x180, ${png.length} bytes`);
