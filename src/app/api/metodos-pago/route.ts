import { z } from "zod";

import {
  MetodoRetiradaSchema,
  MSG_RETIRADA_NO_DISPONIBLE,
  RedCriptoSchema,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo de un método de cobro. QUIÉN lo guarda sale de la sesión.
 *
 * La RED es obligatoria en cripto y de la lista cerrada: una red que DareFlash no envía es dinero
 * perdido, y esta es la única pantalla donde alguien escribe una dirección — si pasa mal de aquí,
 * el error se congela en todas las solicitudes futuras.
 */
const CuerpoSchema = z.discriminatedUnion("metodo", [
  z.object({
    metodo: z.literal(MetodoRetiradaSchema.enum.BANK),
    iban: z.string().min(10).max(40),
    titular: z.string().min(2).max(120),
  }),
  z.object({
    metodo: z.literal(MetodoRetiradaSchema.enum.CRYPTO),
    direccion: z.string().min(10).max(120),
    red: RedCriptoSchema,
  }),
]);

const MENSAJE: Record<string, string> = {
  SIN_CIFRADO: MSG_RETIRADA_NO_DISPONIBLE,
  DEMASIADOS:
    "Ya tienes todos los métodos de cobro que se pueden guardar. Borra uno para añadir otro.",
  IBAN_INVALIDO: "Revisa el IBAN: no parece completo.",
  TITULAR_VACIO: "Falta el nombre del titular de la cuenta.",
  RED_NO_SOPORTADA: "Esa red no está disponible. Elige una de la lista.",
  DIRECCION_INVALIDA: "Revisa la dirección: no parece completa.",
  DIRECCION_NO_ES_DE_LA_RED:
    "Esa dirección no es de la red elegida. Comprueba las dos: un envío a la red equivocada no se puede recuperar.",
  METODO_DESCONOCIDO: "Elige banco o cripto.",
};

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

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "No hemos podido procesar la petición.", 400);

  const r = await guardarMetodoPago(prisma, { userId, destino: cuerpo.data });
  if (!r.ok) {
    return apiError(r.rechazo, MENSAJE[r.rechazo] ?? "No hemos podido guardar ese método.", 409);
  }
  return apiOk({ id: r.id });
});
