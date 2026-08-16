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

import type { Env } from "@/config/env";
import type { PrismaClient } from "@/generated/prisma/client";
import { apiError, originAllowed } from "@/server/http/api";

import { verifyCsrfToken } from "./csrf";
import type { SessionUser } from "./session";

/**
 * Handler protegido. Recibe TRES argumentos:
 *  - `req`: la peticion.
 *  - `{ user, env, prisma }`: el usuario ya resuelto por el envoltorio, MAS los dos "universales"
 *    (`env` y `prisma`) que casi toda ruta mutante necesita. El envoltorio ya los cargaba (env) o los
 *    arrastraba (prisma via getCurrentUser); pasarlos INYECTADOS evita que cada ruta repita sus propios
 *    `await import("@/config/env")` / `await import("@/server/db/client")`. Siguen siendo dinamicos (se
 *    resuelven aqui, dentro de la funcion, NUNCA en ambito de modulo): el build no evalua env ni BD.
 *  - `routeContext`: el 2o argumento que Next pasa a la ruta, INTACTO. En una ruta
 *    dinamica (`/api/x/[id]/route.ts`) es `{ params: Promise<{ id: string }> }`; sin
 *    propagarlo, una ruta dinamica no podria leer sus params y alguien la sacaria del
 *    envoltorio "para que funcione", perdiendo la proteccion. Es generico en `C` para
 *    conservar el tipo de los params de cada ruta.
 */
type MutatingHandler<C> = (
  req: Request,
  ctx: { user: SessionUser; env: Env; prisma: PrismaClient },
  routeContext: C,
) => Promise<Response>;

export function mutatingRoute<C = unknown>(
  handler: MutatingHandler<C>,
): (req: Request, routeContext: C) => Promise<Response> {
  return async (req: Request, routeContext: C): Promise<Response> => {
    // Imports DINAMICOS (dentro del handler, nunca en ambito de modulo): getCurrentUser
    // arrastra el singleton de Prisma; cargarlo de forma estatica evaluaria esa cadena en
    // `next build` (recogida de datos de pagina) donde no hay variables -> build caido.
    // (Prisma ya es perezoso, pero se mantiene el import dinamico como defensa en capas.)
    const { env } = await import("@/config/env");
    const { prisma } = await import("@/server/db/client");
    const { getCurrentUser } = await import("./current-user");

    if (!originAllowed(req, env.APP_URL)) {
      return apiError("BAD_ORIGIN", "Origen no permitido.", 403);
    }

    const user = await getCurrentUser();
    if (!user) return apiError("UNAUTHENTICATED", "No autenticado.", 401);

    const csrf = req.headers.get("x-csrf-token");
    if (!verifyCsrfToken(env.AUTH_SECRET, user.sessionId, csrf)) {
      return apiError("CSRF", "Token CSRF invalido o ausente.", 403);
    }

    return handler(req, { user, env, prisma }, routeContext);
  };
}
