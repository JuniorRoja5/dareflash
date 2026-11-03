import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta (cuid). Un id vacio o absurdo -> 404 (no se filtra por que). */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * GET /api/videos/[id]/reproduccion — devuelve la URL HLS FIRMADA (+ póster) de un video PUBLICADO.
 *
 * CONTRATO (Rama 3, cambio INTENCIONADO): es PUBLICO. El feed es publico, así que un INVITADO (sin
 * sesión) puede pedir la reproducción de un video visible. Ya NO exige sesión. La firma (token-auth
 * de la pull-zone) cubre el DIRECTORIO `/{videoId}/` entero: playlist + segmentos + póster. Es LECTURA
 * (no muta): no pasa por `mutatingRoute` ni CSRF. Errores al usuario en lenguaje humano.
 *
 * ┌─ POR QUÉ EL FILTRO ES `VIDEO_VISIBLE` Y NO `status: "PUBLISHED"` ──────────────────────────────┐
 * │ Antes esta ruta solo miraba el ESTADO, y eso la dejaba fuera de la única regla de visibilidad. │
 * │ Consecuencia MEDIDA (no hipotética): un vídeo que la moderación escondía por el umbral de      │
 * │ denuncias —o cuyo autor acababa de ser baneado— desaparecía del feed y seguía devolviendo una   │
 * │ URL FIRMADA a cualquiera que conociese su id. Y el id no es un secreto: lo reparte el propio    │
 * │ feed. O sea que "esconder" no escondía: solo quitaba el enlace de la lista.                     │
 * │                                                                                                 │
 * │ Por eso la selección ya no se escribe aquí: la hace `videoReproducible`, que vive PEGADO a la   │
 * │ regla y se prueba contra la base. `reproduccionFirmada` CONSERVA su chequeo de `status` como     │
 * │ segunda capa: es puro y testeado, y no cuesta nada que siga negándose a firmar lo no publicado.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CONSECUENCIA ACEPTADA: el DUEÑO tampoco reproduce su propio vídeo mientras está auto-oculto. Su
 * rejilla privada se lo sigue listando (camino aparte, `misVideos`), así que ahí queda un hueco de
 * COPY —no de seguridad— que se cierra enseñando "en revisión" en esa rejilla. No se arregla leyendo
 * la sesión aquí: esta ruta es pública a propósito y no debe pagar una lectura de cookie por vídeo.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
  const { id } = parsed.data;

  const { env, prisma } = await depsRuta();
  const { BUNNY_PLAYBACK_TTL_SEC } = await import("@/config/constants");
  const { reproduccionFirmada } = await import("@/server/services/bunny");
  const { videoReproducible } = await import("@/server/services/video-visible");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  try {
    const video = await videoReproducible(prisma, id);
    // Segunda capa: `reproduccionFirmada` se niega a firmar lo no publicado. null -> 404.
    const urls = reproduccionFirmada(video, {
      hostname: env.BUNNY_CDN_HOSTNAME,
      claveToken: env.BUNNY_TOKEN_AUTH_KEY,
      expiraEnSeg: BUNNY_PLAYBACK_TTL_SEC,
    });
    if (!urls) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    return apiOk(urls);
  } catch (e) {
    console.error("[videos/reproduccion] fallo firmando la URL:", sanearError(e));
    return apiError("PLAYBACK_FAILED", "No se pudo preparar el vídeo. Reintenta.", 502);
  }
}
