/**
 * Pipeline SEGURO de imágenes subidas (server-only). Borde de confianza: los bytes llegan
 * navegador -> VPS -> aquí; NO se fía de nada del cliente (ni Content-Type ni extensión). Generaliza el
 * pipeline del avatar para reusarlo en la PORTADA de reto (cero proveedor nuevo). Qué hace, en orden:
 *   1. TAMAÑO primero (antes de decodificar): rechaza > `maxBytes` sin gastar CPU en un búfer gigante.
 *   2. TIPO por CONTENIDO: sharp lee la cabecera real; solo jpeg/png/webp pasan (un .txt renombrado a
 *      .png, un SVG o un GIF -> rechazados).
 *   3. RECOMPRESIÓN + REDIMENSIÓN según `modo`: `cuadrado` (recorte cover, para avatar) o `contener`
 *      (encaja en `maxLado` conservando el aspecto, sin recortar — para portada). Re-encodar a WebP
 *      NEUTRALIZA cargas útiles escondidas (polyglots) y normaliza el peso.
 *   4. STRIP de METADATOS/EXIF: sharp descarta TODO por defecto (no se llama a `withMetadata()`), así
 *      que geolocalización/cámara/fecha NO sobreviven. `.rotate()` aplica la orientación EXIF a los
 *      píxeles ANTES de tirar el EXIF (la foto no sale girada).
 *
 * Devuelve el búfer saneado; NO lo almacena (eso lo hace el handler de la ruta: volumen + Caddy).
 */
import "server-only";

import sharp, { type OutputInfo } from "sharp";

/** Formatos de ENTRADA aceptados, tal y como los nombra sharp al detectar por los bytes. */
const FORMATOS_ENTRADA = new Set(["jpeg", "png", "webp"]);

/** Calidad WebP por defecto: 82 es el punto dulce nitidez/peso. */
const WEBP_CALIDAD_DEFECTO = 82;

export type MotivoImagenInvalida = "TAMANO" | "TIPO" | "CORRUPTO";

/** La imagen subida no es aceptable. TIPADO a propósito: la ruta traduce `motivo` a un mensaje. */
export class ImagenInvalidaError extends Error {
  readonly motivo: MotivoImagenInvalida;
  constructor(motivo: MotivoImagenInvalida, mensaje: string) {
    super(mensaje);
    this.name = "ImagenInvalidaError";
    this.motivo = motivo;
  }
}

/** `cuadrado` = recorte cover a `lado`×`lado` (avatar). `contener` = encaja en `maxLado` sin recortar. */
export type ModoImagen =
  | { tipo: "cuadrado"; lado: number; position?: "attention" | "centre" }
  | { tipo: "contener"; maxLado: number };

export interface OpcionesImagen {
  maxBytes: number;
  modo: ModoImagen;
  /** Calidad WebP (default 82). */
  calidad?: number;
}

/** Imagen ya saneada: búfer WebP + su Content-Type + dimensiones reales de salida. */
export interface ImagenProcesada {
  buffer: Buffer;
  contentType: "image/webp";
  ancho: number;
  alto: number;
}

/**
 * Valida y sanea la imagen. LANZA `ImagenInvalidaError` (tipada) si el tamaño, el tipo o la integridad
 * no cuadran; devuelve el búfer WebP saneado si todo va bien. PURA respecto a la app (bytes -> bytes).
 */
export async function procesarImagen(
  bytes: Uint8Array,
  opciones: OpcionesImagen,
): Promise<ImagenProcesada> {
  const calidad = opciones.calidad ?? WEBP_CALIDAD_DEFECTO;

  // 1. Tamaño ANTES de decodificar.
  if (bytes.byteLength > opciones.maxBytes) {
    throw new ImagenInvalidaError("TAMANO", "La imagen supera el tamaño máximo permitido.");
  }
  if (bytes.byteLength === 0) {
    throw new ImagenInvalidaError("CORRUPTO", "El fichero está vacío.");
  }

  // 2. Tipo por CONTENIDO (bytes), nunca por lo que diga el cliente.
  let formato: string | undefined;
  try {
    formato = (await sharp(Buffer.from(bytes), { failOn: "error" }).metadata()).format;
  } catch {
    throw new ImagenInvalidaError("CORRUPTO", "No se pudo leer la imagen. ¿Está dañada?");
  }
  if (!formato || !FORMATOS_ENTRADA.has(formato)) {
    throw new ImagenInvalidaError("TIPO", "El archivo no es una imagen JPEG, PNG o WebP.");
  }

  // 3+4. Reorienta (aplica EXIF a los píxeles), redimensiona según el modo, recomprime a WebP y —al NO
  //      llamar a withMetadata()— descarta TODO el EXIF/metadato (geolocalización incluida).
  const pipe = sharp(Buffer.from(bytes), { failOn: "error" }).rotate();
  if (opciones.modo.tipo === "cuadrado") {
    pipe.resize(opciones.modo.lado, opciones.modo.lado, {
      fit: "cover",
      position: opciones.modo.position ?? "centre",
    });
  } else {
    // `inside` encaja dentro de maxLado×maxLado conservando el aspecto; `withoutEnlargement` no amplía
    // una imagen pequeña (el recorte por slot lo hace el object-cover de la tarjeta en el cliente).
    pipe.resize(opciones.modo.maxLado, opciones.modo.maxLado, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await pipe.webp({ quality: calidad }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new ImagenInvalidaError("CORRUPTO", "No se pudo procesar la imagen. Prueba con otra.");
  }

  return {
    buffer: out.data,
    contentType: "image/webp",
    ancho: out.info.width,
    alto: out.info.height,
  };
}
