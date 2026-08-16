import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** Valida el id de la ruta (cuid). Un id vacio o absurdo -> 404 (no se filtra por que). */
const ParamsSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * GET /api/videos/[id]/reproduccion — devuelve la URL HLS FIRMADA (+ póster) de un video PUBLICADO.
 *
 * CONTRATO (Rama 3, cambio INTENCIONADO): es PUBLICO. El feed es publico, así que un INVITADO (sin
 * sesión) puede pedir la reproducción de un video PUBLISHED. Ya NO exige sesión. Lo que se CONSERVA es
 * el GUARDARRAIL de ESTADO: solo un Video `PUBLISHED` es reproducible; cualquier otro estado o la
 * ausencia de fila -> 404 SIN URL (vive en `reproduccionFirmada`, puro y testeado). La firma (token-auth
 * de la pull-zone) cubre el DIRECTORIO `/{videoId}/` entero: playlist + segmentos + póster. Es LECTURA
 * (no muta): no pasa por `mutatingRoute` ni CSRF. Errores al usuario en lenguaje humano.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
  const { id } = parsed.data;

  const { env, prisma } = await depsRuta();
  const { BUNNY_PLAYBACK_TTL_SEC } = await import("@/config/constants");
  const { reproduccionFirmada } = await import("@/server/services/bunny");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  try {
    const video = await prisma.video.findUnique({
      where: { id },
      select: { bunnyVideoId: true, status: true },
    });
    // El guardarrail (solo PUBLISHED) vive en `reproduccionFirmada` (puro, testeado): null -> 404.
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
