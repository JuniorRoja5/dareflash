import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos — CREAR un reto (queda DRAFT), con PORTADA opcional. `multipart/form-data`:
 * los campos del reto + un fichero `portada` opcional. Conserva TODO M5: `mutatingRoute`
 * (Origin/sesión/CSRF) + `requireRole("ADMIN")` (admin-only, decisión cerrada; nada de `role==="ADMIN"`
 * a mano), Zod de los campos, publicCode/slug, `status="DRAFT"`, `createdById` = admin de la SESIÓN.
 *
 * PORTADA: si viene, se SANEA con el pipeline compartido `procesarImagen` (tipo por bytes, tamaño antes
 * de decodificar, strip EXIF, WebP; modo "contener" = conserva el aspecto). Se valida ANTES de crear el
 * reto (fallo -> no se crea nada); tras crear se escribe `{publicCode}.webp` en el volumen y se apunta
 * `coverImage` a la URL pública (con `?v=`). Sin portada -> `coverImage=null` y el reto se crea igual.
 * Rate-limit por usuario porque el procesado cuesta CPU/memoria.
 */
export const POST = mutatingRoute(async (req, { env, prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { crearRetoSchema, crearRetoAdmin } = await import("@/server/services/retos-admin");
  const { procesarImagen, ImagenInvalidaError } = await import("@/server/services/imagen");
  const { RATE_LIMITS, PORTADA_MAX_BYTES, PORTADA_MAX_LADO } = await import("@/config/constants");
  const { rateLimit } = await import("@/server/security/rate-limit");
  const { sanearError } = await import("@/server/observability/sanitize-error");

  let admin;
  try {
    admin = await requireRole("ADMIN");
  } catch {
    return apiError("FORBIDDEN", "No tienes permiso para crear retos.", 403);
  }

  // Rate-limit por usuario (el procesado de la portada cuesta CPU).
  const rl = await rateLimit(prisma, {
    key: `crearreto:user:${rateLimitKey(env.AUTH_SECRET, admin.userId)}`,
    ...RATE_LIMITS.CREAR_RETO_PER_USER,
  });
  if (!rl.allowed) {
    return apiError("RATE_LIMITED", "Has creado muchos retos seguidos. Espera un momento.", 429);
  }

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

  // Portada OPCIONAL: se SANEA antes de crear el reto (si falla, no se crea nada).
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
      console.error("[panel/retos] fallo procesando la portada:", sanearError(e));
      return apiError(
        "PORTADA_ERROR",
        "No hemos podido procesar la portada. Prueba con otra.",
        400,
      );
    }
  }

  const reto = await crearRetoAdmin(prisma, admin.userId, parsed.data);

  // Guardar la portada (si hay) y apuntar coverImage. Un fallo de disco NO aborta la creación: el reto
  // queda sin portada (la tarjeta usa el placeholder). PERO el fallo NO es silencioso —fue justo lo que
  // ocultó el bug de permisos (EACCES en un /srv/portadas de root)—: se registra el code/errno CLARO y
  // se AVISA al admin en la respuesta para que sepa que debe reintentar la portada.
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
      // Pista directa: EACCES aquí = el volumen se montó sobre un dir de root (permisos). Ver Dockerfile.
      console.error(
        `[panel/retos] NO se pudo guardar la portada del reto ${reto.publicCode} ` +
          `(code=${code} errno=${errno} syscall=${syscall}; EACCES => revisar permisos de PORTADAS_DIR):`,
        sanearError(e),
      );
      // No se aborta: el reto existe sin portada.
    }
  }

  // 200 igualmente (el reto SÍ se creó), pero si la portada falló se avisa explícitamente en vez de un
  // "ok" a secas. El cliente puede mostrar el aviso; los tests comprueban el flag.
  return apiOk({
    ok: true,
    id: reto.id,
    publicCode: reto.publicCode,
    portadaGuardada,
    ...(portadaGuardada
      ? {}
      : { aviso: "El reto se creó, pero no se pudo guardar la portada. Inténtalo de nuevo." }),
  });
});
