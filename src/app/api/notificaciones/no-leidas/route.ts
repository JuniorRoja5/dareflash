import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/notificaciones/no-leidas — SOLO el número de avisos sin leer del usuario de la sesión. Es lo
 * que sondea el navegador para que el badge suba sin recargar la página: un COUNT indexado, sin traer
 * la lista (eso es `GET /api/notificaciones`, al abrir la campana).
 *
 * NO cuenta como actividad (`getCurrentUserSinTocar`): el navegador lo pide solo, cada minuto, sin que
 * nadie toque nada. Si refrescara la última actividad, una pestaña abierta con nadie delante mantendría
 * la sesión viva para siempre y la caducidad por inactividad no llegaría nunca.
 *
 * Tampoco marca nada como leído: sondear y leer son cosas distintas. Sin sesión, 401 (y el sondeo para).
 */
export async function GET() {
  const { getCurrentUserSinTocar } = await import("@/server/auth/current-user");
  const user = await getCurrentUserSinTocar();
  if (!user) return apiError("UNAUTHENTICATED", "Inicia sesión para ver tus avisos.", 401);

  const { prisma } = await import("@/server/db/client");
  const { contarNoLeidas } = await import("@/server/services/notificaciones");

  const res = NextResponse.json({ noLeidas: await contarNoLeidas(prisma, user.userId) });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
