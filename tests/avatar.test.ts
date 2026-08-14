/**
 * Avatar · pipeline SEGURO — con dientes de verdad, con imágenes REALES (sharp en proceso, sin red ni
 * BD). Prueba lo que de verdad protege al servidor:
 *   - rechaza NO-imágenes (texto renombrado), formatos no permitidos (GIF/SVG) y ficheros dañados;
 *   - rechaza por TAMAÑO antes de decodificar;
 *   - recomprime a WebP cuadrado 512×512;
 *   - QUITA el EXIF (una foto CON geolocalización sale SIN metadatos) — el punto sensible del brief.
 * Si alguien quita el chequeo de tipo, o llama a `withMetadata()` (dejando el EXIF), esto se pone rojo.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { AVATAR_MAX_BYTES } from "../src/app/(app)/(shell)/perfil/perfil-logic";
import { AvatarInvalidoError, procesarAvatar } from "../src/server/services/avatar";

/** Imagen de test de color plano en el formato pedido. */
async function imagen(formato: "jpeg" | "png" | "webp" | "gif", lado = 300): Promise<Buffer> {
  const base = sharp({
    create: { width: lado, height: lado, channels: 3, background: { r: 200, g: 30, b: 90 } },
  });
  return base.toFormat(formato).toBuffer();
}

describe("procesarAvatar: acepta imágenes válidas y las sanea", () => {
  it("jpeg/png/webp -> salida WebP 512×512 con Content-Type image/webp", async () => {
    for (const fmt of ["jpeg", "png", "webp"] as const) {
      const out = await procesarAvatar(await imagen(fmt));
      expect(out.contentType).toBe("image/webp");
      const meta = await sharp(out.buffer).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(512);
    }
  });

  it("QUITA el EXIF: una imagen con metadatos (geo/cámara) sale SIN ninguno", async () => {
    // Imagen JPEG CON un bloque EXIF real incrustado.
    const conExif = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({
        // EXIF con datos sensibles típicos (autor/software + una coordenada GPS en IFD0). El punto es
        // que NADA de esto debe sobrevivir al saneado.
        exif: {
          IFD0: {
            Copyright: "DareFlash",
            Software: "test",
            GPSLatitude: "41/1 23/1 0/1",
            GPSLongitude: "2/1 10/1 0/1",
          },
        },
      })
      .jpeg()
      .toBuffer();

    // Sanity: la ENTRADA sí lleva EXIF (si no, el test no probaría nada).
    expect((await sharp(conExif).metadata()).exif).toBeDefined();

    const out = await procesarAvatar(conExif);
    // La SALIDA no debe tener EXIF: geolocalización y demás metadatos, fuera.
    expect((await sharp(out.buffer).metadata()).exif).toBeUndefined();
  });
});

describe("procesarAvatar: rechaza lo que no toca (LANZA AvatarInvalidoError tipada)", () => {
  it("un fichero de TEXTO renombrado a imagen -> motivo TIPO/CORRUPTO", async () => {
    const texto = new TextEncoder().encode("esto no es una imagen, es texto plano");
    await expect(procesarAvatar(texto)).rejects.toBeInstanceOf(AvatarInvalidoError);
    const err = await procesarAvatar(texto).catch((e) => e);
    expect(err.motivo).toMatch(/TIPO|CORRUPTO/);
  });

  it("un GIF (formato no permitido) -> motivo TIPO", async () => {
    const err = await procesarAvatar(await imagen("gif")).catch((e) => e);
    expect(err).toBeInstanceOf(AvatarInvalidoError);
    expect(err.motivo).toBe("TIPO");
  });

  it("por TAMAÑO (> máximo) -> motivo TAMANO, sin llegar a decodificar", async () => {
    const gigante = new Uint8Array(AVATAR_MAX_BYTES + 1); // ceros: ni siquiera es imagen
    const err = await procesarAvatar(gigante).catch((e) => e);
    expect(err).toBeInstanceOf(AvatarInvalidoError);
    expect(err.motivo).toBe("TAMANO");
  });

  it("un fichero vacío -> motivo CORRUPTO", async () => {
    const err = await procesarAvatar(new Uint8Array(0)).catch((e) => e);
    expect(err).toBeInstanceOf(AvatarInvalidoError);
    expect(err.motivo).toBe("CORRUPTO");
  });
});
