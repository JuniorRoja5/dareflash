/**
 * Control de acceso por rol (RBAC) y barreras de autenticacion/verificacion.
 * server-only: usa `getCurrentUser` (cookie + BD). Lanza `AuthError`, que el
 * boundary de la API traduce a 401/403 sin filtrar detalles.
 */
import "server-only";

import type { SessionUser } from "./session";
import { getCurrentUser } from "./current-user";

type Role = SessionUser["role"];

const ROLE_RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2 };

export type AuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "EMAIL_NOT_VERIFIED";

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = "AuthError";
  }
}

/** Exige sesion valida. Lanza UNAUTHENTICATED si no la hay. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  return user;
}

/**
 * Exige sesion Y email verificado. La verificacion es la barrera antifraude: sin
 * ella, ninguna accion con efectos (participar, votar, cobrar).
 */
export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.emailVerified === null) throw new AuthError("EMAIL_NOT_VERIFIED");
  return user;
}

/**
 * Exige un rol minimo (USER < MODERATOR < ADMIN) Y email verificado. Un rol elevado
 * debe ser el caso MAS estricto, no el mas laxo: parte de requireVerifiedUser, no de
 * requireUser. (El admin de bootstrap se crea ya verificado en create-admin.ts.)
 */
export async function requireRole(min: Role): Promise<SessionUser> {
  const user = await requireVerifiedUser();
  if (ROLE_RANK[user.role] < ROLE_RANK[min]) throw new AuthError("FORBIDDEN");
  return user;
}
