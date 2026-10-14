import { z } from "zod";

import {
  MetodoRetiradaSchema,
  MSG_RETIRADA_NO_DISPONIBLE,
  MSG_RETIRADA_SIN_MINIMO,
  MSG_RETIRADA_SIN_SALDO,
  RedCriptoSchema,
  RETIRADA_MINIMA_CENTS,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo de una solicitud de cobro. QUIÉN cobra NO va aquí: sale de la sesión, así que nadie
 * puede pedir el dinero de otro — y por eso tampoco hay un `userId` que validar.
 *
 * `clave`: una por INTENCIÓN de cobrar, generada en la pantalla. Un reintento de la misma intención
 * —doble clic, red caída a mitad— llega con la misma clave y NO vuelve a debitar. Es la diferencia
 * entre que el formulario se envíe dos veces (normal) y que cobre dos veces (inaceptable).
 *
 * EL IMPORTE SE ACOTA AQUÍ ADEMÁS DE EN EL SERVICIO. No es redundancia por gusto: esta capa impide
 * que llegue un número absurdo (negativo, decimal, gigante) a la lógica de dinero, y la de dentro
 * decide con el saldo REAL bajo bloqueo. El mínimo lo LEE de la constante — escribirlo aquí a mano
 * sería un segundo mínimo libre de discrepar del de la pantalla.
 */
const CuerpoSchema = z.object({
  clave: z.string().uuid(),
  importeCents: z.number().int().min(RETIRADA_MINIMA_CENTS).max(100_000_000),
  destino: z.discriminatedUnion("metodo", [
    z.object({
      metodo: z.literal(MetodoRetiradaSchema.enum.BANK),
      iban: z.string().min(10).max(40),
      titular: z.string().min(2).max(120),
    }),
    z.object({
      metodo: z.literal(MetodoRetiradaSchema.enum.CRYPTO),
      direccion: z.string().min(10).max(120),
      // La RED es obligatoria y de la lista cerrada: una red que no enviamos es dinero perdido.
      red: RedCriptoSchema,
    }),
  ]),
});

/** Copy por motivo. Lo que la persona puede hacer algo con, nunca el código del rechazo. */
const MENSAJE: Record<string, string> = {
  BAJO_MINIMO: MSG_RETIRADA_SIN_MINIMO,
  SIN_SALDO: MSG_RETIRADA_SIN_SALDO,
  NO_ENTERO: "El importe no es válido.",
  SIN_CIFRADO: MSG_RETIRADA_NO_DISPONIBLE,
  IBAN_INVALIDO: "Revisa el IBAN: no parece completo.",
  TITULAR_VACIO: "Falta el nombre del titular de la cuenta.",
  RED_NO_SOPORTADA: "Esa red no está disponible. Elige una de la lista.",
  DIRECCION_INVALIDA: "Revisa la dirección: no parece completa.",
  DIRECCION_NO_ES_DE_LA_RED:
    "Esa dirección no es de la red elegida. Comprueba las dos: un envío a la red equivocada no se puede recuperar.",
};

/**
 * POST /api/retiradas — pide cobrar parte de tu saldo.
 *
 * EL DINERO SALE AQUÍ MISMO. No se "reserva": se debita, y la retirada nace en PENDING esperando a
 * que un admin la pague por fuera. Un estado intermedio en el que el dinero esté pedido Y
 * disponible es justo el que deja pedir dos veces lo mismo.
 *
 * EMAIL VERIFICADO, como todo lo que tiene efectos. Lo decide `requireVerifiedUser`, no un `if`.
 *
 * LOS DATOS DE PAGO NO VUELVEN EN LA RESPUESTA, ni siquiera los suyos: el cliente no los necesita
 * para pintar nada y cada sitio por el que viaja un IBAN es un sitio donde puede quedarse.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { AuthError, requireVerifiedUser } = await import("@/server/auth/rbac");
  const { solicitarRetirada } = await import("@/server/services/retirada");

  let userId: string;
  try {
    userId = (await requireVerifiedUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) {
      return apiError("EMAIL_SIN_VERIFICAR", "Verifica tu correo antes de pedir un cobro.", 403);
    }
    throw e;
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "No hemos podido procesar la petición.", 400);

  const r = await solicitarRetirada(prisma, {
    userId,
    importeCents: cuerpo.data.importeCents,
    destino: cuerpo.data.destino,
    clave: cuerpo.data.clave,
  });

  if (!r.ok) {
    const mensaje = MENSAJE[r.rechazo ?? ""] ?? "No hemos podido registrar tu solicitud.";
    // 409 y no 400: el cuerpo era válido; lo que no cuadra es el estado (saldo, mínimo, cifrado).
    // La diferencia importa para quien lee los logs: un 400 dice "el cliente está roto".
    return apiError(r.rechazo ?? "RECHAZO", mensaje, 409);
  }

  return apiOk({
    retiradaId: r.retiradaId,
    // `false` cuando el envío estaba repetido: la pantalla lo trata igual, pero queda dicho.
    creada: r.creada,
    saldoCents: r.saldoCents,
  });
});
