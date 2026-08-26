import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/** Tipo de job de purga del CDN tras fijar la miniatura (union en constants: JobType). */
const BUNNY_PURGE_THUMBNAIL = "BUNNY_PURGE_THUMBNAIL";

/**
 * POST /api/videos/[id]/miniatura — el DUEÑO fija una MINIATURA personalizada de SU vídeo (opcional).
 * `multipart/form-data` con el campo `imagen`. `mutatingRoute` (Origin/sesión/CSRF) + AUTORIZACIÓN POR
 * CONSTRUCCIÓN: se carga el vídeo y solo se acepta si su `userId` == el de la sesión; inexistente o de
 * otro -> 404 (no revela vídeos ajenos), NUNCA se fía de un owner del cliente.
 *
 * La imagen se SANEA con el pipeline compartido (`procesarImagen`, modo "contener", salida JPEG porque
 * Bunny sirve la miniatura como thumbnail.jpg) y se envía a Bunny (Set Thumbnail; la API key es
 * server-only). La miniatura es OPCIONAL: si Bunny falla, se responde error suave y el vídeo conserva la
 * miniatura automática — el cliente lo trata como aviso, no como fallo de la subida.
 *
 * Tras fijarla se ENCOLA la PURGA del CDN (`BUNNY_PURGE_THUMBNAIL`). Sin ella la miniatura nueva no
 * llega a verse: Bunny la sirve siempre en la misma ruta y el borde tiene cacheada la automática.
 */
export const POST = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { user, env, prisma }, { params }) => {
    const { procesarImagen, ImagenInvalidaError } = await import("@/server/services/imagen");
    const { establecerMiniatura, clienteBunnyReal } = await import("@/server/services/bunny");
    const { rateLimit } = await import("@/server/security/rate-limit");
    const { RATE_LIMITS, MINIATURA_MAX_BYTES, MINIATURA_MAX_LADO } =
      await import("@/config/constants");
    const { sanearError } = await import("@/server/observability/sanitize-error");

    const { id } = await params;

    // Rate-limit por usuario (procesar la imagen cuesta CPU/memoria).
    const rl = await rateLimit(prisma, {
      key: `miniatura:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`,
      ...RATE_LIMITS.UPLOAD_THUMBNAIL_PER_USER,
    });
    if (!rl.allowed) {
      return apiError("RATE_LIMITED", "Demasiadas miniaturas por ahora. Inténtalo más tarde.", 429);
    }

    // Vídeo del propio usuario (inexistente o ajeno -> el mismo 404, sin distinguir).
    const video = await prisma.video.findUnique({
      where: { id },
      select: { userId: true, bunnyVideoId: true },
    });
    if (!video || video.userId !== user.userId) {
      return apiError("NOT_FOUND", "Vídeo no disponible.", 404);
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError("BAD_REQUEST", "No hemos podido leer la imagen. Inténtalo de nuevo.", 400);
    }
    const fichero = form.get("imagen");
    if (!(fichero instanceof File) || fichero.size === 0) {
      return apiError("VALIDATION", "Elige una imagen para la miniatura.", 400);
    }

    // Sanea la imagen (JPEG, modo contener). Errores tipados -> mensaje al cliente.
    let jpeg: Buffer;
    try {
      jpeg = (
        await procesarImagen(new Uint8Array(await fichero.arrayBuffer()), {
          maxBytes: MINIATURA_MAX_BYTES,
          modo: { tipo: "contener", maxLado: MINIATURA_MAX_LADO },
          formato: "jpeg",
        })
      ).buffer;
    } catch (e) {
      if (e instanceof ImagenInvalidaError) {
        return apiError(`MINIATURA_${e.motivo}`, e.message, e.motivo === "TAMANO" ? 413 : 400);
      }
      console.error("[videos/miniatura] fallo procesando la imagen:", sanearError(e));
      return apiError(
        "MINIATURA_ERROR",
        "No hemos podido procesar la imagen. Prueba con otra.",
        400,
      );
    }

    // Envía a Bunny (Set Thumbnail). Fallo de Bunny -> error suave (la subida NO depende de esto).
    try {
      await establecerMiniatura(
        clienteBunnyReal,
        { libraryId: env.BUNNY_STREAM_LIBRARY_ID, apiKey: env.BUNNY_STREAM_API_KEY },
        video.bunnyVideoId,
        jpeg,
        "image/jpeg",
      );
    } catch (e) {
      console.error("[videos/miniatura] Bunny Set Thumbnail falló:", sanearError(e));
      return apiError(
        "MINIATURA_BUNNY",
        "No se pudo aplicar la miniatura. Se usará una automática; puedes reintentar.",
        502,
      );
    }

    // La miniatura YA está en el origen de Bunny, pero el borde sigue sirviendo la que cacheó antes
    // (siempre es la misma ruta, /{guid}/thumbnail.jpg) — por eso se veía en Bunny y no en DareFlash.
    // Se ENCOLA la purga del CDN: por la cola y no inline porque purgar puede tardar segundos y, si
    // Bunny falla, el reintento lo recupera. El fallo al encolar NO tumba la respuesta: la miniatura
    // está puesta; solo tardaría en refrescarse.
    try {
      await prisma.job.create({
        data: {
          type: BUNNY_PURGE_THUMBNAIL,
          payload: { bunnyVideoId: video.bunnyVideoId },
          runAt: new Date(),
          // Clave de idempotencia por GUID **y momento**: dos peticiones a la vez para la MISMA
          // miniatura se deduplican, pero un cambio POSTERIOR de miniatura tiene que poder purgar
          // otra vez (con la clave solo por GUID, la segunda miniatura no se vería nunca).
          idempotencyKey: `bunny:purge-thumb:${video.bunnyVideoId}:${Date.now()}`,
        },
      });
    } catch (e) {
      console.error("[videos/miniatura] no se pudo encolar la purga del CDN:", sanearError(e));
    }

    return apiOk({ ok: true });
  },
);
