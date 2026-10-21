import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { camposDelFormulario } from "@/server/http/form";
import { guardarImagenDeReto, imagenDelFormulario } from "@/server/http/imagen-subida";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos/[id]/editar — EDITAR un reto (DRAFT o PUBLISHED), con PORTADA opcional.
 * `multipart/form-data`, mismos campos y límites que crear (reusa `crearRetoSchema`). Su PROPIO guard
 * (`requireRole("ADMIN")`, no confía en el layout) + `mutatingRoute` (Origin/sesión/CSRF).
 *
 * INVARIANTES de la edición: el `publicCode` NUNCA cambia (clave estable); si cambia el título, el slug
 * se regenera (las URLs viejas hacen 308 al canónico -> sin enlaces rotos); el `status` NO se toca aquí
 * (editar ≠ publicar/despublicar, que es su acción aparte). PORTADA: si viene una nueva se SANEA con el
 * pipeline compartido (modo "contener") y SOBRESCRIBE `{publicCode}.webp`, con nuevo `?v=` para romper
 * caché; si no viene, se conserva la actual. Un fallo al guardar la portada NO aborta la edición pero se
 * AVISA (log claro + `portadaGuardada:false`), igual que en crear.
 */
export const POST = mutatingRoute(
  async (req, { env, prisma }, ctx: { params: Promise<{ id: string }> }) => {
    const { requireRole } = await import("@/server/auth/rbac");
    const { crearRetoSchema, editarRetoAdmin } = await import("@/server/services/retos-admin");
    const { RATE_LIMITS, PORTADA_MAX_BYTES, PORTADA_MAX_LADO, SPONSOR_LOGO_MAX_LADO } =
      await import("@/config/constants");
    const { rateLimit } = await import("@/server/security/rate-limit");

    let admin;
    try {
      admin = await requireRole("ADMIN");
    } catch {
      return apiError("FORBIDDEN", "No tienes permiso para editar retos.", 403);
    }

    // Rate-limit por usuario (el procesado de la portada cuesta CPU).
    const rl = await rateLimit(prisma, {
      key: `editarreto:user:${rateLimitKey(env.AUTH_SECRET, admin.userId)}`,
      ...RATE_LIMITS.EDITAR_RETO_PER_USER,
    });
    if (!rl.allowed) {
      return apiError("RATE_LIMITED", "Has editado muchos retos seguidos. Espera un momento.", 429);
    }

    const { id } = await ctx.params;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError("BAD_REQUEST", "No hemos podido leer los datos. Inténtalo de nuevo.", 400);
    }
    const parsed = crearRetoSchema(new Date()).safeParse(camposDelFormulario(form));
    if (!parsed.success) {
      return apiError(
        "VALIDATION",
        parsed.error.issues[0]?.message ?? "Revisa los datos del reto.",
        400,
      );
    }

    // El reto debe existir (y de paso obtenemos el publicCode, que NO cambia y nombra la portada).
    const existente = await prisma.challenge.findUnique({
      where: { id },
      select: { publicCode: true },
    });
    if (!existente) {
      return apiError("NOT_FOUND", "Ese reto no existe.", 404);
    }

    // IMÁGENES OPCIONALES: si viene una NUEVA se SANEA antes de tocar la BD (si falla, no se edita
    // nada). Sin fichero se conserva la que hubiera, que es lo que espera quien solo cambia el
    // título. El logo solo se mira si el reto queda patrocinado.
    const limites = { maxBytes: PORTADA_MAX_BYTES, maxLado: PORTADA_MAX_LADO };
    const portada = await imagenDelFormulario(form, "portada", "PORTADA", limites);
    if (portada.tipo === "error") return apiError(portada.code, portada.mensaje, portada.status);
    const logo = parsed.data.esPatrocinado
      ? await imagenDelFormulario(form, "sponsorLogo", "LOGO", {
          maxBytes: PORTADA_MAX_BYTES,
          maxLado: SPONSOR_LOGO_MAX_LADO,
        })
      : ({ tipo: "ausente" } as const);
    if (logo.tipo === "error") return apiError(logo.code, logo.mensaje, logo.status);

    // Actualiza los campos (publicCode y status quedan intactos por diseño de editarRetoAdmin).
    const reto = await editarRetoAdmin(prisma, id, existente.publicCode, parsed.data);
    if (!reto) {
      // Carrera improbable: existía al comprobar y desapareció antes del update.
      return apiError("NOT_FOUND", "Ese reto ya no existe.", 404);
    }

    // Si hay portada nueva, SOBRESCRIBE {publicCode}.webp y apunta coverImage con nuevo ?v=. Un fallo de
    // disco NO aborta la edición (los campos ya se guardaron) pero se AVISA, no se traga en silencio.
    let portadaGuardada = true;
    if (portada.tipo === "ok") {
      portadaGuardada = await guardarImagenDeReto({
        dir: env.PORTADAS_DIR,
        nombre: `${reto.publicCode}.webp`, // publicCode base32: sin traversal
        buffer: portada.buffer,
        apuntar: (coverImage) =>
          prisma.challenge.update({ where: { id: reto.id }, data: { coverImage } }),
      });
    }

    // El LOGO, igual: sobrescribe `{publicCode}-sponsor.webp` con un `?v=` nuevo para romper caché.
    // `editarRetoAdmin` ya puso `sponsorLogo` a null si el reto dejó de ser patrocinado.
    if (logo.tipo === "ok") {
      await guardarImagenDeReto({
        dir: env.PORTADAS_DIR,
        nombre: `${reto.publicCode}-sponsor.webp`,
        buffer: logo.buffer,
        apuntar: (sponsorLogo) =>
          prisma.challenge.update({ where: { id: reto.id }, data: { sponsorLogo } }),
      });
    }

    return apiOk({
      ok: true,
      id: reto.id,
      publicCode: reto.publicCode,
      slug: reto.slug,
      portadaGuardada,
      ...(portadaGuardada
        ? {}
        : {
            aviso:
              "Los cambios se guardaron, pero no se pudo actualizar la portada. Inténtalo de nuevo.",
          }),
    });
  },
);
