/**
 * Avatar = imagen CUADRADA con recorte cover. Es un caso concreto del pipeline compartido
 * `procesarImagen` (server/services/imagen): mismos chequeos (tamaño antes de decodificar, tipo por
 * bytes, strip EXIF, salida WebP) y COMPORTAMIENTO BYTE-IDÉNTICO al de antes (512×512, cover
 * "attention", calidad 82) — sus tests siguen verdes. Aquí solo el envoltorio + los nombres de siempre.
 */
import "server-only";

import { AVATAR_MAX_BYTES } from "@/app/(app)/(shell)/perfil/perfil-logic";

import {
  type ImagenProcesada,
  ImagenInvalidaError,
  type MotivoImagenInvalida,
  procesarImagen,
} from "./imagen";

/** Lado del avatar cuadrado resultante (px). 512 se ve nítido en retina sin pesar. */
export const AVATAR_LADO_PX = 512;

// Nombres de siempre (la ruta y los tests importan estos): son el error y el tipo GENÉRICOS.
export const AvatarInvalidoError = ImagenInvalidaError;
export type MotivoAvatarInvalido = MotivoImagenInvalida;
export type AvatarProcesado = ImagenProcesada;

/** Valida y sanea el avatar (cuadrado 512×512, cover). Delega en el pipeline compartido. */
export function procesarAvatar(bytes: Uint8Array): Promise<AvatarProcesado> {
  return procesarImagen(bytes, {
    maxBytes: AVATAR_MAX_BYTES,
    modo: { tipo: "cuadrado", lado: AVATAR_LADO_PX, position: "attention" },
  });
}
