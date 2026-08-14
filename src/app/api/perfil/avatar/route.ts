import { apiError, rateLimitKey } from "@/server/http/api";
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
 * ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 * │ DECISIÓN PENDIENTE PARA JUNIOR — DÓNDE SE GUARDA LA IMAGEN                                     │
 * │ Bunny Stream es SOLO vídeo; hoy NO hay hosting de imágenes en la infra. Todo el pipeline       │
 * │ seguro (recepción, validación, recompresión, strip EXIF) está construido y probado, pero el    │
 * │ PASO DE ALMACENAMIENTO se detiene aquí a propósito: elegir destino (bucket S3-compatible /      │
 * │ Bunny Storage / volumen servido por Caddy) es una alta de proveedor/infra con coste y datos,   │
 * │ y la norma del repo es CONSULTAR antes de añadir un proveedor externo. Cuando se decida:        │
 * │   1) subir `procesado.buffer` (image/webp) al destino con una clave estable por usuario,        │
 * │   2) `prisma.user.update({ where:{ id:user.userId }, data:{ image: <URL pública> } })`,         │
 * │   3) devolver `apiOk({ ok:true, image })` y cablear la UI para refrescar el avatar.             │
 * │ Hasta entonces se responde 501 con copy humano: la validación/saneado SÍ corren (una no-imagen  │
 * │ o una sobre-tamaño se rechazan como es debido); solo la ESCRITURA final está aparcada.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
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

  // 3. ALMACENAMIENTO — APARCADO (ver el recuadro de arriba). `procesado.buffer` está listo para
  //    subir, pero no hay destino de imágenes decidido. No inventamos proveedor: se responde 501.
  void procesado;
  return apiError(
    "AVATAR_ALMACEN_PENDIENTE",
    "Cambiar la foto de perfil estará disponible muy pronto. De momento puedes editar tu nombre.",
    501,
  );
});
