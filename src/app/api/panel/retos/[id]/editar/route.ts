import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

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
    const { procesarImagen, ImagenInvalidaError } = await import("@/server/services/imagen");
    const { RATE_LIMITS, PORTADA_MAX_BYTES, PORTADA_MAX_LADO } = await import("@/config/constants");
    const { rateLimit } = await import("@/server/security/rate-limit");
    const { sanearError } = await import("@/server/observability/sanitize-error");

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
    const campo = (k: string): string | undefined => {
      const v = form.get(k);
      return typeof v === "string" ? v : undefined;
    };
    const parsed = crearRetoSchema(new Date()).safeParse({
      title: campo("title"),
      description: campo("description"),
      category: campo("category"),
      rules: campo("rules"),
      prizeAmountCents: campo("prizeAmountCents"),
      startsAt: campo("startsAt"),
      deadline: campo("deadline"),
      winnersCount: campo("winnersCount"),
    });
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

    // Portada OPCIONAL: si viene una NUEVA, se SANEA antes de tocar la BD (si falla, no se edita nada).
    let portada: Buffer | null = null;
    const ficheroPortada = form.get("portada");
    if (ficheroPortada instanceof File && ficheroPortada.size > 0) {
      const bytes = new Uint8Array(await ficheroPortada.arrayBuffer());
      try {
        portada = (
          await procesarImagen(bytes, {
            maxBytes: PORTADA_MAX_BYTES,
            modo: { tipo: "contener", maxLado: PORTADA_MAX_LADO },
          })
        ).buffer;
      } catch (e) {
        if (e instanceof ImagenInvalidaError) {
          return apiError(`PORTADA_${e.motivo}`, e.message, e.motivo === "TAMANO" ? 413 : 400);
        }
        console.error("[panel/retos/editar] fallo procesando la portada:", sanearError(e));
        return apiError(
          "PORTADA_ERROR",
          "No hemos podido procesar la portada. Prueba con otra.",
          400,
        );
      }
    }

    // Actualiza los campos (publicCode y status quedan intactos por diseño de editarRetoAdmin).
    const reto = await editarRetoAdmin(prisma, id, existente.publicCode, parsed.data);
    if (!reto) {
      // Carrera improbable: existía al comprobar y desapareció antes del update.
      return apiError("NOT_FOUND", "Ese reto ya no existe.", 404);
    }

    // Si hay portada nueva, SOBRESCRIBE {publicCode}.webp y apunta coverImage con nuevo ?v=. Un fallo de
    // disco NO aborta la edición (los campos ya se guardaron) pero se AVISA, no se traga en silencio.
    let portadaGuardada = true;
    if (portada) {
      try {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { join } = await import("node:path");
        await mkdir(env.PORTADAS_DIR, { recursive: true });
        const nombre = `${reto.publicCode}.webp`; // publicCode base32: sin traversal
        await writeFile(join(env.PORTADAS_DIR, nombre), portada);
        const coverImage = `/portadas/${nombre}?v=${Date.now()}`;
        await prisma.challenge.update({ where: { id: reto.id }, data: { coverImage } });
      } catch (e) {
        portadaGuardada = false;
        const err = e as { code?: unknown; errno?: unknown; syscall?: unknown };
        const code = typeof err.code === "string" ? err.code : "?";
        const errno = typeof err.errno === "number" ? err.errno : "?";
        const syscall = typeof err.syscall === "string" ? err.syscall : "?";
        console.error(
          `[panel/retos/editar] NO se pudo guardar la portada del reto ${reto.publicCode} ` +
            `(code=${code} errno=${errno} syscall=${syscall}; EACCES => revisar permisos de PORTADAS_DIR):`,
          sanearError(e),
        );
      }
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
