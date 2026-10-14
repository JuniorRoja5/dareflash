import { z } from "zod";

import { CuerpoMetodoPagoSchema, MENSAJE_METODO_PAGO } from "@/lib/metodo-pago-cuerpo";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(191) });

/**
 * PUT /api/metodos-pago/[id] — SUSTITUYE un método guardado por otro.
 *
 * No es "editar un campo": los datos no vuelven del servidor ni para su dueño, así que cambiar un
 * método es volver a escribirlo entero. Lo que esta ruta garantiza es que el cambio sea ATÓMICO —el
 * servicio borra y crea en una transacción—, para que un fallo a mitad no deje a nadie sin método
 * con el IBAN ya tecleado. Ver `reemplazarMetodoPago`.
 *
 * NO TOCA UNA SOLICITUD EN CURSO: la retirada se quedó con su propia copia cifrada al pedirse.
 */
export const PUT = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (req, { prisma }, { params }) => {
    const { AuthError, requireVerifiedUser } = await import("@/server/auth/rbac");
    const { reemplazarMetodoPago } = await import("@/server/services/metodos-pago");

    let userId: string;
    try {
      userId = (await requireVerifiedUser()).userId;
    } catch (e) {
      if (e instanceof AuthError) {
        return apiError("EMAIL_SIN_VERIFICAR", "Verifica tu correo antes de tocar el cobro.", 403);
      }
      throw e;
    }

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", "Ese método ya no está.", 404);

    const cuerpo = CuerpoMetodoPagoSchema.safeParse(await req.json().catch(() => null));
    if (!cuerpo.success)
      return apiError("VALIDATION", "No hemos podido procesar la petición.", 400);

    const r = await reemplazarMetodoPago(prisma, {
      userId,
      metodoId: parsed.data.id,
      destino: cuerpo.data,
    });
    if (!r.ok) {
      return apiError(
        r.rechazo,
        MENSAJE_METODO_PAGO[r.rechazo] ?? "No hemos podido guardar ese método.",
        409,
      );
    }
    return apiOk({ id: r.id });
  },
);

/**
 * DELETE /api/metodos-pago/[id] — borra un método de cobro guardado.
 *
 * NO TOCA LAS SOLICITUDES EN CURSO. Cada retirada se quedó con una COPIA cifrada de los datos al
 * pedirse, así que borrar el método no deja un pago pendiente sin saber a dónde iba. Es justo la
 * razón de que la retirada copie en vez de apuntar.
 *
 * RESPONDE LO MISMO exista o no, y sea tuyo o no: la autorización va en el `where` del borrado
 * (`borrarMetodoPago`), así que nadie averigua por la respuesta si el método de otra persona
 * existe. Es el mismo criterio que el 404 de un vídeo ajeno.
 *
 * EMAIL VERIFICADO, como configurarlo: es la misma barrera antifraude.
 */
export const DELETE = mutatingRoute<{ params: Promise<{ id: string }> }>(
  async (_req, { prisma }, { params }) => {
    const { AuthError, requireVerifiedUser } = await import("@/server/auth/rbac");
    const { borrarMetodoPago } = await import("@/server/services/metodos-pago");

    let userId: string;
    try {
      userId = (await requireVerifiedUser()).userId;
    } catch (e) {
      if (e instanceof AuthError) {
        return apiError("EMAIL_SIN_VERIFICAR", "Verifica tu correo antes de tocar el cobro.", 403);
      }
      throw e;
    }

    const parsed = ParamsSchema.safeParse(await params);
    if (!parsed.success) return apiError("NOT_FOUND", "Ese método ya no está.", 404);

    await borrarMetodoPago(prisma, { userId, metodoId: parsed.data.id });
    return apiOk({ ok: true });
  },
);
