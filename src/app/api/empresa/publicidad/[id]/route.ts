import { z } from "zod";

import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk, rateLimitKey } from "@/server/http/api";

export const dynamic = "force-dynamic";

/** El contexto de Next con los `params` de la ruta (alias: el censo de rutas lee el genérico plano). */
type ContextoRuta = { params: Promise<{ id: string }> };

const ParamsSchema = z.object({ id: z.string().min(1).max(191) });

const CuerpoSchema = z.object({
  accion: z.enum(["ACTIVAR", "PAUSAR", "REANUDAR", "TERMINAR"]),
  /** Solo ACTIVAR y REANUDAR: aceptar la primera fecha libre que se ofreció (AAAA-MM-DD). */
  fechaInicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type Svc = typeof import("@/server/services/publicidad");

/** La empresa del chokepoint, o la respuesta que toca (404 sin empresa; 403 sin correo confirmado). */
async function ambitoORespuesta() {
  const { requireEmpresa, SinEmpresa } = await import("@/server/auth/empresa-actual");
  const { AuthError } = await import("@/server/auth/rbac");
  try {
    return { ambito: await requireEmpresa() };
  } catch (e) {
    if (e instanceof SinEmpresa) return { respuesta: apiError("NOT_FOUND", "No encontrado.", 404) };
    if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") {
      return {
        respuesta: apiError(
          "EMAIL_NOT_VERIFIED",
          "Confirma tu correo para gestionar campañas.",
          403,
        ),
      };
    }
    throw e;
  }
}

/** Traduce el rechazo esperable del servicio. Una campaña ajena es un 404, igual que una inexistente. */
function respuestaDeError(svc: Svc, e: unknown): Response {
  if (!(e instanceof svc.PublicidadError)) throw e;
  const estado = e.code === "NO_EXISTE" ? 404 : e.code === "EMPRESA_NO_OPERA" ? 403 : 409;
  return apiError(e.code, e.message, estado);
}

/**
 * POST /api/empresa/publicidad/[id] — LO QUE LA EMPRESA HACE CON SU CAMPAÑA (Fase 9 · P6): activarla o
 * programarla, pausarla, reanudarla o terminarla. JSON `{ accion, fechaInicio? }`.
 *
 * EL ÁMBITO SALE DEL CHOKEPOINT y el servicio carga la campaña CON él dentro del where: la de otra
 * empresa es un 404, como una que no existe (no se confirma que exista).
 *
 * Si la zona está llena (activar o reanudar), 409 con la PRIMERA FECHA LIBRE: la pantalla la ofrece y
 * aceptarla es volver a llamar con esa `fechaInicio`.
 */
export const POST = mutatingRoute<ContextoRuta>(
  async (req, { env, prisma }, { params }) => {
    const svc = await import("@/server/services/publicidad");
    const { RATE_LIMITS } = await import("@/config/constants");
    const { rateLimit } = await import("@/server/security/rate-limit");

    const r = await ambitoORespuesta();
    if (!r.ambito) return r.respuesta;
    const ambito = r.ambito;

    const p = ParamsSchema.safeParse(await params);
    if (!p.success) return apiError("NOT_FOUND", "Esa campaña no existe.", 404);
    const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success)
      return apiError("VALIDATION", "No hemos podido procesar la petición.", 400);

    const rl = await rateLimit(prisma, {
      key: `accionpublicidad:user:${rateLimitKey(env.AUTH_SECRET, ambito.user.userId)}`,
      ...RATE_LIMITS.ACCION_PUBLICIDAD_PER_USER,
    });
    if (!rl.allowed) {
      return apiError("RATE_LIMITED", "Demasiadas acciones seguidas. Espera un momento.", 429);
    }

    const { accion, fechaInicio } = cuerpo.data;
    try {
      if (accion === "PAUSAR") {
        await svc.pausarPublicidad(prisma, ambito.empresaId, p.data.id);
        return apiOk({ ok: true });
      }
      if (accion === "TERMINAR") {
        await svc.terminarPublicidad(prisma, ambito.empresaId, p.data.id);
        return apiOk({ ok: true });
      }
      const resultado =
        accion === "ACTIVAR"
          ? await svc.activarPublicidad(prisma, ambito.empresaId, p.data.id, { fechaInicio })
          : await svc.reanudarPublicidad(prisma, ambito.empresaId, p.data.id, { fechaInicio });
      if (!resultado.ok) {
        const libre = resultado.primeraLibre?.toISOString().slice(0, 10) ?? null;
        return Response.json(
          {
            error: {
              code: "ZONA_LLENA",
              message: libre
                ? "Esa zona ya tiene todas sus plazas ocupadas en esas fechas."
                : "Esa zona tiene todas sus plazas ocupadas en los próximos días que se pueden reservar.",
            },
            primeraLibre: libre,
          },
          { status: 409 },
        );
      }
      return apiOk({ ok: true, inicio: resultado.inicio.toISOString().slice(0, 10) });
    } catch (e) {
      return respuestaDeError(svc, e);
    }
  },
  { cuentaEmpresa: "permite" },
);

/**
 * DELETE /api/empresa/publicidad/[id] — BORRA UN BORRADOR, y su imagen del volumen. Solo un borrador: una
 * campaña que llegó a ocupar días es historia, y su imagen se queda (material de moderación, P8).
 */
export const DELETE = mutatingRoute<ContextoRuta>(
  async (_req, { env, prisma }, { params }) => {
    const svc = await import("@/server/services/publicidad");
    const r = await ambitoORespuesta();
    if (!r.ambito) return r.respuesta;
    const p = ParamsSchema.safeParse(await params);
    if (!p.success) return apiError("NOT_FOUND", "Esa campaña no existe.", 404);

    const borrada = await svc.borrarBorrador(prisma, r.ambito.empresaId, p.data.id);
    if (!borrada) {
      return apiError("NOT_FOUND", "No hay ningún borrador con ese identificador.", 404);
    }
    try {
      const { unlink } = await import("node:fs/promises");
      const { join } = await import("node:path");
      await unlink(join(env.PORTADAS_DIR, svc.nombreImagenPublicidad(p.data.id)));
    } catch {
      // El borrador ya no existe; un fichero que no se pudo borrar es solo espacio, no un fallo visible.
    }
    return apiOk({ ok: true });
  },
  { cuentaEmpresa: "permite" },
);
