/**
 * Pipeline SEGURO de avatar (server-only). Los bytes llegan navegador -> VPS -> [aquí]. Este módulo
 * es el "borde de confianza" de una imagen subida: NO se fía de nada del cliente (ni Content-Type ni
 * extensión) y devuelve una imagen SANEADA lista para almacenar.
 *
 * Qué hace, en orden:
 *   1. TAMAÑO primero (antes de decodificar): rechaza > AVATAR_MAX_BYTES sin gastar CPU en un búfer
 *      gigante. Es un límite de seguridad, no solo UX.
 *   2. TIPO por CONTENIDO: sharp lee la cabecera real; solo jpeg/png/webp pasan. Un .txt renombrado a
 *      .jpg, un SVG (vector -> XSS/rasterización rara) o un GIF -> rechazados.
 *   3. RECOMPRESIÓN + REDIMENSIÓN: cuadrado de LADO px, recorte `cover`, salida WebP. Re-encodar
 *      NEUTRALIZA cargas útiles escondidas (polyglots) y normaliza el peso.
 *   4. STRIP de METADATOS/EXIF: sharp descarta TODOS los metadatos por defecto (no se llama a
 *      `withMetadata()`), así que geolocalización, cámara, fecha y orientación EXIF NO sobreviven.
 *      `.rotate()` sin argumentos aplica la orientación EXIF a los píxeles ANTES de tirar el EXIF, de
 *      modo que la foto no sale girada.
 *
 * IMPORTANTE — ALMACENAMIENTO NO INCLUIDO: este módulo produce el búfer saneado pero NO lo guarda en
 * ningún sitio. Bunny Stream es SOLO vídeo; hoy NO existe un destino de imágenes en la infra. Elegir
 * uno (bucket/CDN/volumen) es una decisión de infraestructura pendiente (ver el handler de la ruta).
 */
import "server-only";

import sharp from "sharp";

import { AVATAR_MAX_BYTES } from "@/app/(app)/(shell)/perfil/perfil-logic";

/** Lado del avatar cuadrado resultante (px). 512 se ve nítido en pantallas retina sin pesar. */
export const AVATAR_LADO_PX = 512;
/** Calidad WebP: 82 es el punto dulce nitidez/peso para fotos de perfil. */
const AVATAR_WEBP_CALIDAD = 82;

/** Formatos de ENTRADA aceptados, tal y como los nombra sharp al detectar por los bytes. */
const FORMATOS_ENTRADA = new Set(["jpeg", "png", "webp"]);

/** Motivo por el que se rechaza una imagen. Tipado para que la ruta lo mapee a copy humano. */
export type MotivoAvatarInvalido = "TAMANO" | "TIPO" | "CORRUPTO";

/** La imagen subida no es aceptable. TIPADO a propósito: la ruta traduce `motivo` a un mensaje. */
export class AvatarInvalidoError extends Error {
  readonly motivo: MotivoAvatarInvalido;
  constructor(motivo: MotivoAvatarInvalido, mensaje: string) {
    super(mensaje);
    this.name = "AvatarInvalidoError";
    this.motivo = motivo;
  }
}

/** Avatar ya saneado: búfer WebP + su Content-Type. Lo que un almacén guardaría tal cual. */
export interface AvatarProcesado {
  buffer: Buffer;
  contentType: "image/webp";
  ancho: number;
  alto: number;
}

/**
 * Valida y sanea la imagen. LANZA `AvatarInvalidoError` (tipada) si el tamaño, el tipo o la
 * integridad no cuadran; devuelve el búfer WebP saneado si todo va bien. Función PURA respecto a la
 * app (no toca BD ni red): recibe bytes, devuelve bytes -> testeable con imágenes reales.
 */
export async function procesarAvatar(bytes: Uint8Array): Promise<AvatarProcesado> {
  // 1. Tamaño ANTES de decodificar: no se decodifica un búfer descomunal.
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new AvatarInvalidoError("TAMANO", "La imagen supera el tamaño máximo permitido.");
  }
  if (bytes.byteLength === 0) {
    throw new AvatarInvalidoError("CORRUPTO", "El fichero está vacío.");
  }

  const entrada = sharp(Buffer.from(bytes), { failOn: "error" });

  // 2. Tipo por CONTENIDO (bytes), nunca por lo que diga el cliente.
  let formato: string | undefined;
  try {
    formato = (await entrada.metadata()).format;
  } catch {
    throw new AvatarInvalidoError("CORRUPTO", "No se pudo leer la imagen. ¿Está dañada?");
  }
  if (!formato || !FORMATOS_ENTRADA.has(formato)) {
    throw new AvatarInvalidoError("TIPO", "El archivo no es una imagen JPEG, PNG o WebP.");
  }

  // 3+4. Reorienta (aplica EXIF a los píxeles), recorta cuadrado, recomprime a WebP y —al NO llamar a
  //      withMetadata()— descarta TODO el EXIF/metadato (geolocalización incluida).
  let salida: Buffer;
  try {
    salida = await sharp(Buffer.from(bytes), { failOn: "error" })
      .rotate()
      .resize(AVATAR_LADO_PX, AVATAR_LADO_PX, { fit: "cover", position: "attention" })
      .webp({ quality: AVATAR_WEBP_CALIDAD })
      .toBuffer();
  } catch {
    throw new AvatarInvalidoError("CORRUPTO", "No se pudo procesar la imagen. Prueba con otra.");
  }

  return { buffer: salida, contentType: "image/webp", ancho: AVATAR_LADO_PX, alto: AVATAR_LADO_PX };
}
