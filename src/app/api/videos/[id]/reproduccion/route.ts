import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/videos/[id]/reproduccion — devuelve la URL HLS FIRMADA (+ póster) de un video PUBLICADO.
 *
 * Es LECTURA (no muta): NO pasa por `mutatingRoute` ni exige CSRF, pero SÍ exige SESIÓN válida
 * (reproducción solo para logueados; si algún día se quiere feed público, se relaja aquí). GUARDARRAIL
 * duro: solo un Video `PUBLISHED` es reproducible; cualquier otro estado o la ausencia de fila -> 404
 * SIN URL (un video no publicado jamás es reproducible). La firma (token-auth de la pull-zone) cubre
 * el DIRECTORIO `/{videoId}/` entero: playlist + segmentos. Errores al usuario en lenguaje humano.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHENTICATED", "Inicia sesión para ver el vídeo.", 401);

  const { id } = await params;
  const { env } = await import("@/config/env");
  const { BUNNY_PLAYBACK_TTL_SEC } = await import("@/config/constants");
  const { prisma } = await import("@/server/db/client");
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
