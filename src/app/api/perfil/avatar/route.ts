import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * Sube el AVATAR del DUEÑO de la sesión. Los BYTES van navegador -> VPS -> [aquí]; la clave de
 * ningún servicio llega jamás al navegador. Pasa por `mutatingRoute` (Origin + sesión + CSRF):
 * rechaza al anónimo. La imagen se recibe como `multipart/form-data` (campo `avatar`).
 *
 * El SERVIDOR es el borde de confianza: valida TIPO (jpeg/png/webp por los bytes, no por el
 * Content-Type), TAMAÑO (<= 5 MB), RECOMPRIME a WebP cuadrado y ELIMINA todo el EXIF/metadato
 * (geolocalización incluida) — todo en `procesarAvatar`. Rate-limit por usuario porque decodificar
 * y recomprimir cuesta CPU/memoria.
 *
 * ALMACENAMIENTO: se escribe el WebP en un VOLUMEN PERSISTENTE (`AVATARS_DIR`, p.ej. /srv/avatars)
 * montado en el servicio `web` (escribe la app) y en `caddy` (lo sirve como estático en `/avatars/*`,
 * FUERA de la app — ver docker-compose.prod.yml y Caddyfile). El nombre es `{userId}.webp` (userId de
 * la SESIÓN, nunca del cliente -> sin traversal; el cuid es alfanumérico). La URL guardada lleva un
 * `?v=` para invalidar la caché del navegador al cambiar de foto (el fichero se sobrescribe).
 */
export const POST = mutatingRoute(async (req, { user }) => {
  const { env } = await import("@/config/env");
  const { RATE_LIMITS } = await import("@/config/constants");
  const { prisma } = await import("@/server/db/client");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { procesarAvatar, AvatarInvalidoError } = await import("@/server/services/avatar");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  const rlKey = `avatar:user:${rateLimitKey(env.AUTH_SECRET, user.userId)}`;
  const rl = await rateLimit(prisma, { key: rlKey, ...RATE_LIMITS.UPLOAD_AVATAR_PER_USER });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Has subido muchas imágenes seguidas. Espera un momento.", 429);
  }

  // 1. Recibir el fichero del formulario multipart. Sin fichero válido -> error humano.
  let fichero: File | null = null;
  try {
    const form = await req.formData();
    const campo = form.get("avatar");
    if (campo instanceof File) fichero = campo;
  } catch {
    return apiError("BAD_REQUEST", "No hemos podido leer la imagen. Inténtalo de nuevo.", 400);
  }
  if (!fichero) {
    return apiError("VALIDATION", "Elige una imagen para tu foto de perfil.", 400);
  }

  // 2. Validar + sanear (tipo por bytes, tamaño, recompresión, strip EXIF). Errores TIPADOS -> copy.
  const bytes = new Uint8Array(await fichero.arrayBuffer());
  let procesado;
  try {
    procesado = await procesarAvatar(bytes);
  } catch (e) {
    if (e instanceof AvatarInvalidoError) {
      const status = e.motivo === "TAMANO" ? 413 : 400;
      return apiError(`AVATAR_${e.motivo}`, e.message, status);
    }
    console.error("[perfil/avatar] fallo procesando la imagen:", sanearError(e));
    return apiError("AVATAR_ERROR", "No hemos podido procesar la imagen. Prueba con otra.", 400);
  }

  // 3. ALMACENAR en el volumen persistente + apuntar `User.image` a la URL pública que sirve Caddy.
  //    Todo dentro de un try: un fallo de disco NO debe filtrar rutas/stack al usuario.
  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(env.AVATARS_DIR, { recursive: true });
    const nombre = `${user.userId}.webp`; // userId de sesión (cuid alfanumérico): sin traversal
    await writeFile(join(env.AVATARS_DIR, nombre), procesado.buffer);
    // `?v=` cambia en cada subida (el fichero se sobrescribe) -> invalida la caché del navegador.
    const image = `/avatars/${nombre}?v=${Date.now()}`;
    await prisma.user.update({ where: { id: user.userId }, data: { image } });
    return apiOk({ ok: true, image });
  } catch (e) {
    // Loguea el `code` del error de FS (EACCES, ENOSPC, ENOENT…) para diagnosticar de un vistazo
    // (p.ej. permisos del volumen). El mensaje al usuario sigue siendo humano; nada de errnos fuera.
    const code = e instanceof Error && "code" in e ? String((e as { code?: unknown }).code) : "?";
    console.error(`[perfil/avatar] fallo guardando la imagen (code=${code}):`, sanearError(e));
    return apiError("AVATAR_ERROR", "No hemos podido guardar la imagen. Reintenta.", 500);
  }
});
