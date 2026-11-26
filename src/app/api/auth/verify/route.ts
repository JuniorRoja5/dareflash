import { z } from "zod";

import { apiError, apiOk } from "@/server/http/api";
import { textosApi } from "@/server/http/textos-api";

export const dynamic = "force-dynamic";

/**
 * Confirma la verificacion de email. Es el POST del BOTON de la pagina `/verify`,
 * no un GET: asi los escaneres de correo (que hacen prefetch del enlace) no consumen
 * el token de un solo uso antes de que el usuario haga clic.
 */
export async function POST(req: Request) {
  const t = await textosApi(req);
  const { prisma } = await import("@/server/db/client");
  const { confirmEmailVerification } = await import("@/server/services/email-verification");

  const schema = z.object({ token: z.string().min(1) });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("BAD_REQUEST", t("cuerpoDeLaPeticionInvalido"), 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION", t("faltaElToken"), 400);

  const result = await confirmEmailVerification(prisma, { rawToken: parsed.data.token });
  if (!result.verified) {
    return apiError("INVALID_TOKEN", t("elEnlaceDeVerificacion"), 400);
  }
  return apiOk({ ok: true, message: t("cuentaVerificada") });
}
