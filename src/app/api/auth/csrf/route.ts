import { NextResponse } from "next/server";

import { apiError } from "@/server/http/api";

export const dynamic = "force-dynamic";

/**
 * Emite un token CSRF atado a la sesion actual. El cliente lo guarda en memoria y lo
 * manda en `X-CSRF-Token` en las acciones con efectos. `Cache-Control: no-store`: un
 * token en el cuerpo de un GET no debe cachearlo ningun intermediario.
 */
export async function GET() {
  const { env } = await import("@/config/env");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { issueCsrfToken } = await import("@/server/auth/csrf");

  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHENTICATED", "No autenticado.", 401);

  const csrfToken = issueCsrfToken(env.AUTH_SECRET, user.sessionId);
  const res = NextResponse.json({ csrfToken });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
