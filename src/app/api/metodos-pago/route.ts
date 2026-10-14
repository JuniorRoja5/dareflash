import { CuerpoMetodoPagoSchema, MENSAJE_METODO_PAGO } from "@/lib/metodo-pago-cuerpo";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/metodos-pago — guarda un método de cobro, cifrado.
 *
 * EMAIL VERIFICADO: configurar dónde cobrar es una acción con efectos, igual que pedir el cobro.
 *
 * LOS DATOS NO VUELVEN EN LA RESPUESTA, ni siquiera los suyos: la pantalla los acaba de escribir y
 * no los necesita de vuelta. Cada sitio por el que viaja un IBAN es un sitio donde puede quedarse.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { AuthError, requireVerifiedUser } = await import("@/server/auth/rbac");
  const { guardarMetodoPago } = await import("@/server/services/metodos-pago");

  let userId: string;
  try {
    userId = (await requireVerifiedUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) {
      return apiError(
        "EMAIL_SIN_VERIFICAR",
        "Verifica tu correo antes de configurar el cobro.",
        403,
      );
    }
    throw e;
  }

  const cuerpo = CuerpoMetodoPagoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "No hemos podido procesar la petición.", 400);

  const r = await guardarMetodoPago(prisma, { userId, destino: cuerpo.data });
  if (!r.ok) {
    return apiError(
      r.rechazo,
      MENSAJE_METODO_PAGO[r.rechazo] ?? "No hemos podido guardar ese método.",
      409,
    );
  }
  return apiOk({ id: r.id });
});
