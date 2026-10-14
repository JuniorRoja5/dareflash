import { z } from "zod";

import {
  MSG_RETIRADA_SIN_MINIMO,
  MSG_RETIRADA_SIN_SALDO,
  RETIRADA_MINIMA_CENTS,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo de una solicitud de cobro. QUIÉN cobra NO va aquí: sale de la sesión, así que nadie
 * puede pedir el dinero de otro — y por eso tampoco hay un `userId` que validar.
 *
 * EL DESTINO TAMPOCO VIENE AQUÍ, solo el id de un método YA GUARDADO. Que los datos de pago no
 * viajen en cada solicitud no es solo comodidad: es un sitio menos por el que pasa un IBAN, y una
 * oportunidad menos de teclear mal una dirección de cripto, que es un error sin arreglo.
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

const QuerySchema = z.object({
  cursor: z.string().max(100).optional(),
});

/**
 * GET /api/retiradas — una página del historial PROPIO (keyset). La usa el "Ver más" del monedero.
 *
 * Es una LECTURA y no mueve nada: pedir un cobro es el POST de abajo, con su CSRF. Un GET que
 * debitara saldo lo dispararía cualquier prefetch.
 *
 * DE QUIÉN sale de la SESIÓN, nunca de la petición: no hay forma de pedir el historial de otro
 * porque no hay dónde escribir su id. Y lo que vuelve es el DTO de `misRetiradas`, que no lleva los
 * datos de pago ni quién la procesó.
 *
 * `no-store`: es dinero de una persona concreta y cambia cuando el admin la mueve.
 */
export async function GET(req: Request) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHENTICATED", "Inicia sesión para ver tus cobros.", 401);

  const url = new URL(req.url);
  const q = QuerySchema.safeParse({ cursor: url.searchParams.get("cursor") ?? undefined });
  if (!q.success) return apiError("VALIDATION", "Parámetros inválidos.", 400);

  const { prisma } = await import("@/server/db/client");
  const { misRetiradas } = await import("@/server/services/retirada");

  const pagina = await misRetiradas(prisma, user.userId, { cursor: q.data.cursor ?? null });
  // Campo a campo y no `apiOk(pagina)`: así lo que sale de aquí está ESCRITO. El día que el DTO del
  // servicio crezca con algo interno, no se cuela en la respuesta por ser parte del mismo objeto.
  const res = apiOk({ items: pagina.items, nextCursor: pagina.nextCursor });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Copy por motivo. Lo que la persona puede hacer algo con, nunca el código del rechazo. */
const MENSAJE: Record<string, string> = {
  BAJO_MINIMO: MSG_RETIRADA_SIN_MINIMO,
  SIN_SALDO: MSG_RETIRADA_SIN_SALDO,
  NO_ENTERO: "El importe no es válido.",
  METODO_NO_EXISTE: "Ese método de cobro ya no está. Elige otro o añade uno nuevo.",
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
    metodoPagoId: cuerpo.data.metodoPagoId,
    clave: cuerpo.data.clave,
  });

  if (!r.ok) {
    const mensaje = MENSAJE[r.rechazo ?? ""] ?? "No hemos podido registrar tu solicitud.";
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
