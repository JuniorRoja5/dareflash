import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";
import { camposDelFormulario } from "@/server/http/form";
import { guardarImagenDeReto, imagenDelFormulario } from "@/server/http/imagen-subida";

export const dynamic = "force-dynamic";

/**
 * POST /api/empresa/retos — UNA EMPRESA PROPONE UN RETO PATROCINADO (Fase 9 · P3). `multipart`:
 * los campos del reto y, opcional, el logo de la marca.
 *
 * ┌─ LA PRIMERA RUTA DEL PORTAL QUE ESCRIBE, Y POR ESO `cuentaEmpresa: "permite"` ────────────────┐
 * │ `mutatingRoute` cierra por defecto toda escritura a una cuenta de empresa (no participa). Esta │
 * │ es justo lo que una empresa SÍ hace, así que se abre de forma explícita, y `empresa-no-        │
 * │ participa` la tiene en su lista de excepciones, justificada. Abrirla no abre nada más: dentro, │
 * │ el chokepoint exige que la sesión TENGA empresa —un participante recibe 404—, y el servicio     │
 * │ exige que esté VERIFICADA.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ÁMBITO SALE DEL CHOKEPOINT (`requireEmpresa`), nunca del cuerpo: aunque alguien mande un
 * `empresaId` en el formulario, nadie lo lee.
 *
 * EL LOGO SE SANEA ANTES DE CREAR NADA (si falla, no hay propuesta a medias) y se guarda DESPUÉS, con
 * un nombre derivado del id de la propuesta —un cuid: sin rutas ni caracteres que escapar—, en el
 * mismo volumen que las portadas. Un fallo de disco no tumba la propuesta: queda sin logo y se avisa.
 */
export const POST = mutatingRoute(
  async (req, { env, prisma }) => {
    const { requireEmpresa, SinEmpresa } = await import("@/server/auth/empresa-actual");
    const { AuthError } = await import("@/server/auth/rbac");
    const { solicitudRetoSchema, crearSolicitudReto, apuntarLogoSolicitud, SolicitudRetoError } =
      await import("@/server/services/retos-empresa");
    const { RATE_LIMITS, PORTADA_MAX_BYTES, SPONSOR_LOGO_MAX_LADO } =
      await import("@/config/constants");
    const { rateLimit } = await import("@/server/security/rate-limit");

    let ambito;
    try {
      ambito = await requireEmpresa();
    } catch (e) {
      // Sin empresa: el MISMO 404 que un recurso que no existe (no se cuenta qué es esto).
      if (e instanceof SinEmpresa) return apiError("NOT_FOUND", "No encontrado.", 404);
      if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") {
        return apiError("EMAIL_NOT_VERIFIED", "Confirma tu correo para proponer retos.", 403);
      }
      throw e;
    }

    const rl = await rateLimit(prisma, {
      key: `proponerreto:user:${rateLimitKey(env.AUTH_SECRET, ambito.user.userId)}`,
      ...RATE_LIMITS.PROPONER_RETO_PER_USER,
    });
    if (!rl.allowed) {
      return apiError(
        "RATE_LIMITED",
        "Has enviado muchas propuestas seguidas. Espera un momento.",
        429,
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiError("BAD_REQUEST", "No hemos podido leer los datos. Inténtalo de nuevo.", 400);
    }
    const parsed = solicitudRetoSchema(new Date()).safeParse(camposDelFormulario(form));
    if (!parsed.success) {
      return apiError(
        "VALIDATION",
        parsed.error.issues[0]?.message ?? "Revisa los datos del reto.",
        400,
      );
    }

    const logo = await imagenDelFormulario(form, "sponsorLogo", "LOGO", {
      maxBytes: PORTADA_MAX_BYTES,
      maxLado: SPONSOR_LOGO_MAX_LADO,
    });
    if (logo.tipo === "error") return apiError(logo.code, logo.mensaje, logo.status);

    let solicitud;
    try {
      solicitud = await crearSolicitudReto(prisma, {
        empresaId: ambito.empresaId,
        datos: parsed.data,
        aviso: {
          adminEmail: env.ADMIN_EMAIL ?? null,
          urlPanel: new URL("/panel/propuestas?estado=PENDIENTE", env.APP_URL).toString(),
          log: (m) => console.warn(m),
        },
      });
    } catch (e) {
      if (e instanceof SolicitudRetoError) return apiError(e.code, e.message, 409);
      throw e;
    }

    let logoGuardado = true;
    if (logo.tipo === "ok") {
      logoGuardado = await guardarImagenDeReto({
        dir: env.PORTADAS_DIR,
        nombre: `propuesta-${solicitud.id}-sponsor.webp`,
        buffer: logo.buffer,
        apuntar: (url) =>
          apuntarLogoSolicitud(prisma, {
            empresaId: ambito.empresaId,
            solicitudId: solicitud.id,
            url,
          }),
      });
    }

    return apiOk({
      ok: true,
      id: solicitud.id,
      logoGuardado,
      ...(logoGuardado
        ? {}
        : { aviso: "Hemos recibido tu propuesta, pero no pudimos guardar el logo." }),
    });
  },
  { cuentaEmpresa: "permite" },
);
