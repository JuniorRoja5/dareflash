import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { camposDelFormulario } from "@/server/http/form";
import { guardarImagenDeReto, imagenDelFormulario } from "@/server/http/imagen-subida";

export const dynamic = "force-dynamic";

/**
 * POST /api/panel/retos — CREAR un reto (queda DRAFT), con PORTADA opcional. `multipart/form-data`:
 * los campos del reto + un fichero `portada` opcional. Conserva TODO M5: `mutatingRoute`
 * (Origin/sesión/CSRF) + `requireRole("ADMIN")` (admin-only, decisión cerrada; nada de `role==="ADMIN"`
 * a mano), Zod de los campos, publicCode/slug, `status="DRAFT"`, `createdById` = admin de la SESIÓN.
 *
 * IMÁGENES (portada y, si el reto es patrocinado, logo de la marca): si vienen, se SANEAN con el
 * pipeline compartido `procesarImagen` (tipo por bytes, tamaño antes de decodificar, strip EXIF,
 * WebP; modo "contener" = conserva el aspecto). Se validan ANTES de crear el reto (fallo -> no se
 * crea nada); tras crear se escriben en el volumen de portadas —`{publicCode}.webp` y
 * `{publicCode}-sponsor.webp`— y se apuntan sus URLs públicas (con `?v=`). Sin imagen, el reto se
 * crea igual. Rate-limit por usuario porque el procesado cuesta CPU/memoria.
 */
export const POST = mutatingRoute(async (req, { env, prisma }) => {
  const { requireRole } = await import("@/server/auth/rbac");
  const { crearRetoSchema, crearRetoAdmin } = await import("@/server/services/retos-admin");
  const { RATE_LIMITS, PORTADA_MAX_BYTES, PORTADA_MAX_LADO, SPONSOR_LOGO_MAX_LADO } =
    await import("@/config/constants");
  const { rateLimit } = await import("@/server/security/rate-limit");

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
  const parsed = crearRetoSchema(new Date()).safeParse(camposDelFormulario(form));
  if (!parsed.success) {
    return apiError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Revisa los datos del reto.",
      400,
    );
  }

  // LAS DOS IMÁGENES, SANEADAS ANTES DE CREAR NADA (si cualquiera falla, no se crea el reto). El
  // logo solo se mira si el reto es patrocinado: un fichero suelto en un reto normal no se guarda.
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

  const reto = await crearRetoAdmin(prisma, admin.userId, parsed.data);

  // Guardar la portada (si hay) y apuntar coverImage. Un fallo de disco NO aborta la creación: el reto
  // queda sin portada (la tarjeta usa el placeholder). PERO el fallo NO es silencioso —fue justo lo que
  // ocultó el bug de permisos (EACCES en un /srv/portadas de root)—: se registra el code/errno CLARO y
  // se AVISA al admin en la respuesta para que sepa que debe reintentar la portada.
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

  // EL LOGO, en el MISMO volumen y con un nombre derivado del `publicCode`: Caddy ya sirve
  // `/portadas/*`, así que no hace falta ni un volumen ni una variable de entorno nuevos. Un fallo
  // tampoco aborta: el reto queda patrocinado con el nombre de la marca y sin logo.
  if (logo.tipo === "ok") {
    await guardarImagenDeReto({
      dir: env.PORTADAS_DIR,
      nombre: `${reto.publicCode}-sponsor.webp`,
      buffer: logo.buffer,
      apuntar: (sponsorLogo) =>
        prisma.challenge.update({ where: { id: reto.id }, data: { sponsorLogo } }),
    });
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
