import { z } from "zod";

import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1).max(191) });

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
