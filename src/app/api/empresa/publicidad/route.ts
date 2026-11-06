import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { camposDelFormulario } from "@/server/http/form";
import { imagenDelFormulario } from "@/server/http/imagen-subida";

export const dynamic = "force-dynamic";

/**
 * POST /api/empresa/publicidad — UNA EMPRESA CREA UNA CAMPAÑA EN BORRADOR (Fase 9 · P6). `multipart`:
 * los datos de la campaña y la imagen (obligatoria).
 *
 * `cuentaEmpresa: "permite"`: anunciarse es lo que una empresa viene a hacer (ver la lista justificada de
 * `empresa-no-participa`). Dentro, el chokepoint exige que la sesión TENGA empresa —un participante
 * recibe 404— y el servicio, que esté VERIFICADA.
 *
 * EL ÁMBITO SALE DEL CHOKEPOINT (`requireEmpresa`), nunca del cuerpo: aunque alguien mande un
 * `empresaId` en el formulario, nadie lo lee.
 *
 * LA IMAGEN SE SANEA ANTES DE CREAR NADA, y si después no se puede guardar, el borrador se BORRA: una
 * campaña sin imagen no se puede activar, así que dejarla a medias solo sería una fila que estorba.
 */
export const POST = mutatingRoute(
  async (req, { env, prisma }) => {
    const { requireEmpresa, SinEmpresa } = await import("@/server/auth/empresa-actual");
    const { AuthError } = await import("@/server/auth/rbac");
    const svc = await import("@/server/services/publicidad");
    const { RATE_LIMITS, PORTADA_MAX_BYTES, PUBLICIDAD_IMAGEN_MAX_LADO } =
      await import("@/config/constants");
    const { rateLimit } = await import("@/server/security/rate-limit");

    let ambito;
    try {
      ambito = await requireEmpresa();
    } catch (e) {
      if (e instanceof SinEmpresa) return apiError("NOT_FOUND", "No encontrado.", 404);
      if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") {
        return apiError("EMAIL_NOT_VERIFIED", "Confirma tu correo para crear campañas.", 403);
      }
      throw e;
    }

    const rl = await rateLimit(prisma, {
      key: `crearpublicidad:user:${rateLimitKey(env.AUTH_SECRET, ambito.user.userId)}`,
      ...RATE_LIMITS.CREAR_PUBLICIDAD_PER_USER,
    });
    if (!rl.allowed) {
      return apiError(
        "RATE_LIMITED",
        "Has creado muchas campañas seguidas. Espera un momento.",
        429,
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError("BAD_REQUEST", "No hemos podido leer los datos. Inténtalo de nuevo.", 400);
    }
    const parsed = svc.campanaSchema.safeParse(camposDelFormulario(form));
    if (!parsed.success) {
      return apiError(
        "VALIDATION",
        parsed.error.issues[0]?.message ?? "Revisa los datos de la campaña.",
        400,
      );
    }

    const imagen = await imagenDelFormulario(form, "imagen", "IMAGEN", {
      maxBytes: PORTADA_MAX_BYTES,
      maxLado: PUBLICIDAD_IMAGEN_MAX_LADO,
    });
    if (imagen.tipo === "error") return apiError(imagen.code, imagen.mensaje, imagen.status);
    if (imagen.tipo === "ausente") {
      return apiError("IMAGEN_FALTA", "Sube la imagen de la campaña.", 400);
    }

    let creada: { id: string };
    try {
      creada = await svc.crearBorrador(prisma, ambito.empresaId, parsed.data);
    } catch (e) {
      if (e instanceof svc.PublicidadError) {
        return apiError(e.code, e.message, e.code === "EMPRESA_NO_OPERA" ? 403 : 400);
      }
      throw e;
    }

    const { guardarImagenDeReto } = await import("@/server/http/imagen-subida");
    const guardada = await guardarImagenDeReto({
      dir: env.PORTADAS_DIR,
      nombre: svc.nombreImagenPublicidad(creada.id),
      buffer: imagen.buffer,
      apuntar: (url) => svc.apuntarImagenPublicidad(prisma, ambito.empresaId, creada.id, url),
    });
    if (!guardada) {
      await svc.borrarBorrador(prisma, ambito.empresaId, creada.id);
      return apiError(
        "IMAGEN_NO_GUARDADA",
        "No hemos podido guardar la imagen. Inténtalo de nuevo en un momento.",
        503,
      );
    }

    return apiOk({ ok: true, id: creada.id });
  },
  { cuentaEmpresa: "permite" },
);
