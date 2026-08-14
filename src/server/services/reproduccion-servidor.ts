/**
 * FIRMA de reproduccion en el BORDE del servidor (lee `env`). Envuelve `firmarUrlHls` (puro) con la
 * config de Bunny para videos YA conocidos como PUBLISHED (feed, rejilla de perfil): devuelve la URL
 * HLS y el poster firmados con el token de directorio.
 *
 * El GUARDARRAIL de estado (solo PUBLISHED) NO vive aqui: lo aplica quien selecciona los videos
 * (la consulta del feed filtra `status = PUBLISHED`; el endpoint de reproduccion usa
 * `reproduccionFirmada`). Esta pieza SOLO firma; por eso lee `env` y es server-only.
 */
import "server-only";

import { BUNNY_PLAYBACK_TTL_SEC } from "@/config/constants";
import { env } from "@/config/env";

import { firmarUrlHls } from "./bunny";

export function firmarReproduccion(bunnyVideoId: string): { src: string; poster: string } {
  return firmarUrlHls({
    hostname: env.BUNNY_CDN_HOSTNAME,
    videoId: bunnyVideoId,
    claveToken: env.BUNNY_TOKEN_AUTH_KEY,
    expiraEnSeg: BUNNY_PLAYBACK_TTL_SEC,
  });
}
