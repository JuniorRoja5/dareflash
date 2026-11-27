import { z } from "zod";

import { apiError, apiOk, depsRuta } from "@/server/http/api";
import { textosApi } from "@/server/http/textos-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/confirmar-email — confirma la direccion NUEVA de un cambio de correo.
 *
 * SIN sesion a proposito, igual que `/api/auth/verify`: quien abre el enlace lo hace desde su gestor
 * de correo, donde no hay sesion de RevolFlash. La autoridad es el TOKEN (un solo uso, hash en BD,
 * caduca, y su proposito va dentro del WHERE). Por eso esta EXENTA de `mutatingRoute`: no hay sesion
 * a la que atar un token CSRF — la misma justificacion que las otras entradas por correo.
 *
 * Es un POST y no un GET: un GET lo dispararia el prefetch del cliente de correo y quemaria el token
 * sin que nadie pulsara nada.
 */
export async function POST(req: Request) {
  const t = await textosApi(req);
  const { prisma } = await depsRuta();
  const { confirmarCambioEmail } = await import("@/server/services/cambio-email");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", t("cuerpoDeLaPeticionInvalido"), 400);
  }
  const parsed = z.object({ token: z.string().min(1).max(400) }).safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", t("faltaElToken"), 400);

  const r = await confirmarCambioEmail(prisma, { rawToken: parsed.data.token });
  if (r.ok) return apiOk({ ok: true, message: t("correoActualizado") });

  // Un token invalido y uno caducado dan el MISMO mensaje: distinguirlos diria si un token existio.
  if (r.motivo === "OCUPADA") {
    return apiError("OCUPADA", t("esaDireccionYa"), 409);
  }
  return apiError("TOKEN_INVALIDO", t("esteEnlaceYa"), 400);
}
