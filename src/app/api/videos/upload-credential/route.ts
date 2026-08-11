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
export const POST = mutatingRoute(async (req, { user }) => {
  const { env } = await import("@/config/env");
  const { RATE_LIMITS, BUNNY_TUS_CREDENTIAL_TTL_SEC, CONFIRM_WAKE_KEY } =
    await import("@/config/constants");
  const { prisma } = await import("@/server/db/client");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { crearObjetoVideo, credencialSubidaTus, clienteBunnyReal } =
    await import("@/server/services/bunny");
  const { escribirEstado } = await import("@/server/services/system-state");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  // Titulo OPCIONAL (metadato del objeto en Bunny; el titulo definitivo se fija al publicar).
  const schema = z.object({ title: z.string().trim().min(1).max(200).optional() });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return apiError("VALIDATION", "Datos invalidos.", 400);

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
    await prisma.$transaction(async (tx) => {
      await tx.video.create({
        data: { userId: user.userId, bunnyVideoId: guid, title: tituloUsuario },
      });
      await escribirEstado(tx, CONFIRM_WAKE_KEY, String(Date.now()));
    });

    // 3. Solo la credencial de corta duracion (sin la clave de API).
    const credencial = credencialSubidaTus(config, guid, BUNNY_TUS_CREDENTIAL_TTL_SEC);
    return apiOk({ ...credencial });
  } catch (e) {
    console.error("[videos/upload-credential] fallo preparando la subida:", sanearError(e));
    return apiError("UPLOAD_INIT_FAILED", "No se pudo preparar la subida. Reintenta.", 502);
  }
});
