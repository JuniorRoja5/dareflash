import { z } from "zod";

import { BOOST_DAILY_LIMIT } from "@/config/constants";
import { mutatingRoute } from "@/server/auth/mutating-route";
import { apiError, apiOk } from "@/server/http/api";
import { idiomaDeFormatoDeLaApi, textosApi } from "@/server/http/textos-api";
import { fraseReinicioDiario } from "@/textos/reinicio-diario";

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
  const t = await textosApi(req);
  const { AuthError, requireVerifiedUser } = await import("@/server/auth/rbac");
  const { activarBoost } = await import("@/server/services/boost-activacion");

  let userId: string;
  try {
    userId = (await requireVerifiedUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) {
      return apiError("EMAIL_SIN_VERIFICAR", t("verificaTuCorreo"), 403);
    }
    throw e;
  }

  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("VALIDATION", t("noHemosPodido"), 400);

  const r = await activarBoost(prisma, { userId, token: cuerpo.data.token });

  if (r.estado === "sin-saldo") return apiOk({ estado: r.estado, mensaje: t("boostSinSaldo") });
  if (r.estado === "limite") {
    // La hora del reinicio, en la de quien pide (Fase 11): el día se sigue contando en UTC. La MISMA
    // frase que pinta la pantalla (`boostCliente.limiteDiario`): una frase, UNA clave (P5b3).
    const { zonaDeLaPeticion } = await import("@/server/zona-peticion");
    const reinicio = fraseReinicioDiario(
      await textosApi(req, "reinicioDiario"),
      new Date(),
      await idiomaDeFormatoDeLaApi(req),
      await zonaDeLaPeticion(),
    );
    const tb = await textosApi(req, "boostCliente");
    return apiOk({
      estado: r.estado,
      mensaje: tb("limiteDiario", { veces: String(BOOST_DAILY_LIMIT), reinicio }),
    });
  }
  // AGOTADO sale por `apiOk` y no por `apiError`, como los otros dos rechazos esperables: no ha
  // fallado nada, es el producto diciendo que ahora mismo no hay sitio. Y lo importante para quien
  // lo recibe: NO se le ha gastado el crédito (la transacción entera se deshizo).
  if (r.estado === "agotado") {
    return apiOk({
      estado: r.estado,
      mensaje: (await textosApi(req, "boostCliente"))("agotado", {
        minutos: String(r.minutosParaHueco),
      }),
      minutosParaHueco: r.minutosParaHueco,
    });
  }
  if (r.estado === "repetida") return apiOk({ estado: r.estado });

  return apiOk({
    estado: r.estado,
    saldo: r.saldo,
    usadasHoy: r.usadasHoy,
    expiraEnMs: r.expiraEnMs,
  });
});
