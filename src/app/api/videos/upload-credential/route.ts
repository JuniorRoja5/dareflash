import { z } from "zod";

import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * Emite una credencial de subida TUS PREFIRMADA para que el usuario suba su video DIRECTO a Bunny
 * (los bytes no pasan por el VPS). Pasa por `mutatingRoute` (Origin + sesion + CSRF): rechaza al
 * anonimo. Rate-limit POR USUARIO para no crear objetos en Bunny en masa (coste + huerfanos).
 *
 * Flujo: 1) crea el objeto de video en Bunny -> GUID; 2) escribe la fila `Video` en PENDING
 * (fallo por defecto = INVISIBLE; solo el servicio de confirmacion -otra rama- publica); deja rastro
 * para la limpieza de huerfanos (que se construye en su propia rama); 3) devuelve al cliente SOLO la
 * credencial de corta duracion, NUNCA la clave de API.
 */
export const POST = mutatingRoute(async (req, { user, env, prisma }) => {
  const { RATE_LIMITS, BUNNY_TUS_CREDENTIAL_TTL_SEC, CONFIRM_WAKE_KEY, CATEGORIES } =
    await import("@/config/constants");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { crearObjetoVideo, credencialSubidaTus, clienteBunnyReal } =
    await import("@/server/services/bunny");
  const { escribirEstado } = await import("@/server/services/system-state");
  const { iniciarParticipacion } = await import("@/server/services/participacion");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  // Titulo OPCIONAL (metadato del objeto en Bunny; el titulo definitivo se fija al publicar). `challengeId`
  // OPCIONAL: si viene, es una PARTICIPACION en ese reto (crea/actualiza Submission); si no, subida libre.
  const schema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    challengeId: z.string().trim().min(1).max(64).optional(),
    category: z.string().trim().min(1).max(40).optional(),
  });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return apiError("VALIDATION", "Datos invalidos.", 400);
  const challengeId = parsed.data.challengeId ?? null;

  // CATEGORIA: obligatoria en la subida LIBRE (sin reto) y debe ser una de las 14; en una PARTICIPACION
  // se IGNORA (la categoria es la del reto, fuente unica via Submission->Challenge).
  let categoriaLibre: string | null = null;
  if (!challengeId) {
    const cat = parsed.data.category;
    const valida = cat !== undefined && CATEGORIES.some((c) => c.key === cat);
    if (!valida) return apiError("VALIDATION", "Elige una categoria de la lista.", 400);
    categoriaLibre = cat;
  }

  // Si es participacion, el reto debe estar ABIERTO (PUBLISHED y sin cerrar): no se participa en un
  // borrador ni en un reto cerrado. Se valida ANTES de tocar Bunny.
  if (challengeId) {
    const reto = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { status: true, deadline: true },
    });
    if (!reto || reto.status !== "PUBLISHED" || reto.deadline <= new Date()) {
      return apiError("RETO_NO_DISPONIBLE", "Este reto no admite participaciones.", 409);
    }
  }

  // Rate-limit por usuario, consumido ANTES de tocar Bunny (no se crean objetos en masa).
  const rlKey = `createvideo:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`;
  const rl = await rateLimit(prisma, { key: rlKey, ...RATE_LIMITS.CREATE_VIDEO_PER_USER });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Demasiadas subidas por ahora. Intentalo mas tarde.", 429);
  }

  const config = { libraryId: env.BUNNY_STREAM_LIBRARY_ID, apiKey: env.BUNNY_STREAM_API_KEY };
  const tituloUsuario = parsed.data.title ?? null;

  try {
    // 1. Objeto en Bunny (Bunny exige titulo no vacio; el definitivo se fija al publicar).
    const guid = await crearObjetoVideo(
      clienteBunnyReal,
      config,
      tituloUsuario ?? "Video de DareFlash",
    );

    // 2. Fila Video en PENDING (status por defecto; NO se pone PUBLISHED aqui) + marca de wake del
    //    confirm, ATOMICO en una transaccion: si se crea la fila, hay marca; si algo falla, ninguna
    //    de las dos. El worker leera la marca en su tick y forzara un barrido (event-kick: colapsa el
    //    arranque en frio de la deteccion sin sondear Bunny en vacio).
    const resultado = await prisma.$transaction(async (tx) => {
      if (challengeId) {
        // Participacion: crea Video (+ Submission en primera; o Video de REEMPLAZO sin 2a Submission).
        const r = await iniciarParticipacion(tx, {
          challengeId,
          userId: user.userId,
          bunnyGuid: guid,
          title: tituloUsuario,
        });
        if (r.modo === "bloqueada") return { tipo: "bloqueada" as const };
        await escribirEstado(tx, CONFIRM_WAKE_KEY, String(Date.now()));
        return { tipo: "ok" as const, videoDbId: r.videoId, esReemplazo: r.modo === "reemplazo" };
      }
      // Subida libre: Video PENDING con su categoria propia, sin Submission.
      const v = await tx.video.create({
        data: {
          userId: user.userId,
          bunnyVideoId: guid,
          title: tituloUsuario,
          category: categoriaLibre,
        },
        select: { id: true },
      });
      await escribirEstado(tx, CONFIRM_WAKE_KEY, String(Date.now()));
      return { tipo: "ok" as const, videoDbId: v.id, esReemplazo: false };
    });

    if (resultado.tipo === "bloqueada") {
      // El objeto en Bunny ya se creo; sin fila Video queda HUERFANO y lo barre la limpieza. No se
      // participa: la anterior fue retirada por moderacion.
      return apiError(
        "PARTICIPACION_BLOQUEADA",
        "Tu participacion en este reto fue retirada y no puedes volver a participar.",
        409,
      );
    }

    // 3. La credencial de corta duracion (sin la clave de API) + el id de la fila Video (ADITIVO) + si
    //    es un REEMPLAZO (el cliente confirmara el swap cuando el video nuevo este PUBLISHED).
    const credencial = credencialSubidaTus(config, guid, BUNNY_TUS_CREDENTIAL_TTL_SEC);
    return apiOk({
      ...credencial,
      videoDbId: resultado.videoDbId,
      esReemplazo: resultado.esReemplazo,
    });
  } catch (e) {
    console.error("[videos/upload-credential] fallo preparando la subida:", sanearError(e));
    return apiError("UPLOAD_INIT_FAILED", "No se pudo preparar la subida. Reintenta.", 502);
  }
});
