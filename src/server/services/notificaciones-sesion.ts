/**
 * No-leídas del usuario de la SESIÓN, memoizadas POR PETICIÓN con `cache()` de React.
 *
 * Las piden dos layouts en la misma petición: el del armazón (`(app)`, para el número del icono de
 * Perfil en la barra inferior del móvil) y el del shell (para la campana de escritorio). Sin `cache()`
 * serían dos COUNT idénticos por página; con él, uno. Mismo patrón y mismo ámbito que `getCurrentUser`
 * (ver su comentario: solo deduplica dentro de una petición del App Router; no guarda nada entre ellas).
 *
 * Invitado -> 0, sin consultar nada.
 */
import "server-only";

import { cache } from "react";

export const noLeidasDeSesion = cache(async (): Promise<number> => {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();
  if (!user) return 0;
  const { prisma } = await import("@/server/db/client");
  const { contarNoLeidas } = await import("./notificaciones");
  return contarNoLeidas(prisma, user.userId);
});
