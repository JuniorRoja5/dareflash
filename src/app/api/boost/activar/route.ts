import { z } from "zod";

import {
  MSG_BOOST_ACTIVAR_SIN_VERIFICAR,
  MSG_BOOST_LIMITE_DIARIO,
  MSG_BOOST_SIN_SALDO,
} from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * El cuerpo de una activación. QUIÉN activa NO va aquí: sale de la sesión, así que nadie puede
 * gastar el boost de otro.
 *
 * `token`: uno por INTENCIÓN de destacar, generado en la pantalla (ver `claveActivacion`). Un
 * reintento de la misma intención —doble clic, red caída a mitad— llega con el mismo token y es un
 * no-op que responde `repetida`, no un error. Se exige UUID porque es lo que genera el cliente y
 * acota la forma de algo que viene de fuera.
 */
const CuerpoSchema = z.object({ token: z.string().uuid() });

/**
 * POST /api/boost/activar — gasta 1 boost del saldo y pone tu perfil en el espacio destacado.
 *
 * NO TOCA STRIPE: esto gasta crédito interno. El dinero se movió al comprar (ver `/api/boost/checkout`).
 *
 * `mutatingRoute` (Origin / sesión / CSRF) + EMAIL VERIFICADO, la misma barrera antifraude que votar,
 * comentar o comprar. Y la decide `requireVerifiedUser`, no un `if` escrito aquí.
 *
 * SIEMPRE 200 EN LOS CASOS DE USO. Sin saldo y límite alcanzado no son errores del sistema: son
 * respuestas, con su copy humano. Lo que sí es 4xx es un cuerpo inválido o una sesión sin verificar.
 */
export const POST = mutatingRoute(async (req, { prisma }) => {
  const { AuthError, requireVerifiedUser } = await import("@/server/auth/rbac");
  const { activarBoost } = await import("@/server/services/boost-activacion");

  let userId: string;
  try {
    userId = (await requireVerifiedUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) {
      return apiError("EMAIL_SIN_VERIFICAR", MSG_BOOST_ACTIVAR_SIN_VERIFICAR, 403);
    }
    throw e;
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", "No hemos podido procesar la petición.", 400);

  const r = await activarBoost(prisma, { userId, token: cuerpo.data.token });

  if (r.estado === "sin-saldo") return apiOk({ estado: r.estado, mensaje: MSG_BOOST_SIN_SALDO });
  if (r.estado === "limite") {
    return apiOk({ estado: r.estado, mensaje: MSG_BOOST_LIMITE_DIARIO });
  }
  if (r.estado === "repetida") return apiOk({ estado: r.estado });

  return apiOk({
    estado: r.estado,
    saldo: r.saldo,
    usadasHoy: r.usadasHoy,
    expiraEnMs: r.expiraEnMs,
  });
});
