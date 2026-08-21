/**
 * Pipeline compartido de imagen (procesarImagen) — con dientes, imágenes REALES (sharp en proceso).
 * Protege el borde de confianza del servidor: tipo por bytes, tamaño antes de decodificar, strip EXIF,
 * salida WebP; y el modo "contener" conserva el aspecto (sin recorte). El avatar (cuadrado) tiene su
 * propio test (avatar.test) y sigue byte-idéntico.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ImagenInvalidaError, procesarImagen } from "../src/server/services/imagen";

const MAX = 8 * 1024 * 1024;
const CONTENER = { maxBytes: MAX, modo: { tipo: "contener", maxLado: 300 } } as const;

/** Imagen de test de color plano, en el formato y dimensiones pedidos. */
async function imagen(
  formato: "jpeg" | "png" | "webp" | "gif",
  ancho = 300,
  alto = 300,
): Promise<Buffer> {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 30, b: 90 } },
  })
    .toFormat(formato)
    .toBuffer();
}

describe("procesarImagen · seguridad (dientes)", () => {
  it("acepta jpeg/png/webp y devuelve WebP", async () => {
    for (const fmt of ["jpeg", "png", "webp"] as const) {
      const out = await procesarImagen(await imagen(fmt), CONTENER);
      expect(out.contentType).toBe("image/webp");
      expect((await sharp(out.buffer).metadata()).format).toBe("webp");
    }
  });

  it("formato de salida JPEG cuando se pide (la miniatura de Bunny es thumbnail.jpg)", async () => {
    const out = await procesarImagen(await imagen("png"), { ...CONTENER, formato: "jpeg" });
    expect(out.contentType).toBe("image/jpeg");
    expect((await sharp(out.buffer).metadata()).format).toBe("jpeg");
  });

  it("rechaza NO-imagen (texto renombrado) y formatos no permitidos (GIF)", async () => {
    // .txt renombrado a .png: los BYTES son texto -> no es una imagen decodificable.
    await expect(
      procesarImagen(new Uint8Array(Buffer.from("no soy una imagen")), CONTENER),
    ).rejects.toBeInstanceOf(ImagenInvalidaError);
    // GIF: sharp lo lee pero NO está en la lista de entrada -> TIPO.
    await expect(procesarImagen(await imagen("gif"), CONTENER)).rejects.toMatchObject({
      motivo: "TIPO",
    });
  });

  it("rechaza por TAMAÑO antes de decodificar (no gasta CPU en un búfer gigante)", async () => {
    const gigante = new Uint8Array(MAX + 1); // ni siquiera es una imagen: se corta por tamaño ANTES
    await expect(procesarImagen(gigante, CONTENER)).rejects.toMatchObject({ motivo: "TAMANO" });
  });

  it("QUITA el EXIF: una imagen con metadatos sale SIN ninguno (modo contener)", async () => {
    const conExif = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({ exif: { IFD0: { GPSLatitude: "41/1 23/1 0/1", Software: "test" } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(conExif).metadata()).exif).toBeDefined(); // sanity: la entrada SÍ lleva EXIF
    const out = await procesarImagen(conExif, CONTENER);
    expect((await sharp(out.buffer).metadata()).exif).toBeUndefined(); // la salida NO
  });

  it("modo CONTENER conserva el aspecto (encaja en maxLado, sin recortar) y no amplía", async () => {
    // 400×200 (2:1) -> encaja en 300 -> 300×150 (mismo aspecto), NO 300×300 (eso seria recorte).
    const out = await procesarImagen(await imagen("png", 400, 200), CONTENER);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(150);
    // Una imagen más pequeña que maxLado NO se amplía (withoutEnlargement).
    const pequena = await procesarImagen(await imagen("png", 120, 80), CONTENER);
    const metaP = await sharp(pequena.buffer).metadata();
    expect(metaP.width).toBe(120);
    expect(metaP.height).toBe(80);
  });
});
