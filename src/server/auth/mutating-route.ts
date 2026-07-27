/**
 * Envoltorio OBLIGATORIO para rutas que MUTAN estado de una sesion autenticada
 * (logout, cambio de contrasena y, mas adelante, retiradas, pagos, voto...).
 *
 * Que hace, en orden:
 *  1. Comprobacion de ORIGIN: el header Origin debe coincidir con env.APP_URL, o 403.
 *     Ataja la mayoria de CSRF antes de mirar el token.
 *  2. SESION: exige una sesion valida (si no, 401).
 *  3. CSRF: exige `X-CSRF-Token` atado a ESA sesion (si no, 403).
 * Solo si las tres pasan se llama al handler, con el usuario ya resuelto.
 *
 * Es ESTRUCTURAL, no por memoria: `tests/route-csrf.test.ts` recorre las rutas y
 * falla si alguna que exporta POST/PUT/PATCH/DELETE no pasa por aqui (salvo la lista
 * de exenciones justificadas: login, register, verify, resend — no tienen sesion a la
 * que atar el token).
 */
import "server-only";

import { apiError, originAllowed } from "@/server/http/api";

import { getCurrentUser } from "./current-user";
import { verifyCsrfToken } from "./csrf";
import type { SessionUser } from "./session";

type MutatingHandler = (req: Request, ctx: { user: SessionUser }) => Promise<Response>;

export function mutatingRoute(handler: MutatingHandler): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const { env } = await import("@/config/env");

    if (!originAllowed(req, env.APP_URL)) {
      return apiError("BAD_ORIGIN", "Origen no permitido.", 403);
    }

    const user = await getCurrentUser();
    if (!user) return apiError("UNAUTHENTICATED", "No autenticado.", 401);

    const csrf = req.headers.get("x-csrf-token");
    if (!verifyCsrfToken(env.AUTH_SECRET, user.sessionId, csrf)) {
      return apiError("CSRF", "Token CSRF invalido o ausente.", 403);
    }

    return handler(req, { user });
  };
}
