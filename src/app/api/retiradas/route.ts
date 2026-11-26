import { z } from "zod";

import { RETIRADA_MINIMA_CENTS } from "@/config/constants";
import type { ClaveApi } from "@/textos/mensaje-api";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";
import { textosApi } from "@/server/http/textos-api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo de una solicitud de cobro. QUIÉN cobra NO va aquí: sale de la sesión, así que nadie
 * puede pedir el dinero de otro — y por eso tampoco hay un `userId` que validar.
 *
 * EL DESTINO TAMPOCO VIENE AQUÍ, solo el id de un método YA GUARDADO. Que los datos de pago no
 * viajen en cada solicitud no es solo comodidad: es un sitio menos por el que pasa un IBAN, y una
 * oportunidad menos de teclearlo mal.
 *
 * `clave`: una por INTENCIÓN de cobrar, generada en la pantalla. Un reintento de la misma intención
 * —doble clic, red caída a mitad— llega con la misma clave y NO vuelve a debitar.
 *
 * EL MÍNIMO SE LEE DE LA CONSTANTE: escribirlo aquí a mano sería un segundo mínimo libre de
 * discrepar del de la pantalla.
 */
const CuerpoSchema = z.object({
  clave: z.string().uuid(),
  importeCents: z.number().int().min(RETIRADA_MINIMA_CENTS).max(100_000_000),
  metodoPagoId: z.string().min(1).max(191),
});

/**
 * La frase de cada motivo, como CLAVE del espacio `api` (P5b3). Lo que la persona puede hacer algo
 * con, nunca el código del rechazo.
 */
const MENSAJE: Record<string, ClaveApi> = {
  BAJO_MINIMO: "retiradaSinMinimo",
  SIN_SALDO: "retiradaSinSaldo",
  NO_ENTERO: "retiradaImporteNoValido",
  METODO_NO_EXISTE: "retiradaMetodoNoExiste",
};
/**
 * POST /api/retiradas — pide cobrar parte de tu saldo a un método guardado.
 *
 * EL DINERO SALE AQUÍ MISMO. No se "reserva": se debita, y la retirada nace en PENDING esperando a
 * que un admin la pague por fuera. Un estado intermedio en el que el dinero esté pedido Y
 * disponible es justo el que deja pedir dos veces lo mismo.
 *
 * EMAIL VERIFICADO, como todo lo que tiene efectos. Lo decide `requireVerifiedUser`, no un `if`.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const t = await textosApi(req);
  const { AuthError, requireVerifiedUser } = await import("@/server/auth/rbac");
  const { solicitarRetirada } = await import("@/server/services/retirada");

  let userId: string;
  try {
    userId = (await requireVerifiedUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) {
      return apiError("EMAIL_SIN_VERIFICAR", t("verificaTuCorreoAntesDePedir"), 403);
    }
    throw e;
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", t("noHemosPodido"), 400);

  const r = await solicitarRetirada(prisma, {
    userId,
    importeCents: cuerpo.data.importeCents,
    metodoPagoId: cuerpo.data.metodoPagoId,
    clave: cuerpo.data.clave,
  });

  if (!r.ok) {
    const mensaje = t(MENSAJE[r.rechazo ?? ""] ?? "retiradaNoRegistrada");
    // 409 y no 400: el cuerpo era válido; lo que no cuadra es el estado (saldo, mínimo, método).
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
