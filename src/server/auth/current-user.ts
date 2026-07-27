/**
 * Capa de COOKIE de sesion (server-only): lee/escribe la cookie y resuelve el
 * usuario actual usando el nucleo `session.ts`. Aqui es donde entra Next
 * (`next/headers`) y el singleton Prisma, por eso es `server-only` y no se importa
 * desde el cliente. La logica testeable vive en `session.ts`.
 */
import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE } from "@/config/constants";
import { env } from "@/config/env";
import { prisma } from "@/server/db/client";

import { validateSession, type SessionUser } from "./session";

/** Usuario de la sesion actual, o null. Valida caducidad en cada llamada. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(prisma, token);
}

/**
 * Fija la cookie de sesion. SOLO se llama tras verificar la contrasena (nunca una
 * sesion "provisional" antes). httpOnly + secure (en prod) + sameSite=lax +
 * caducidad explicita.
 */
export async function setSessionCookie(rawToken: string, expires: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/** Borra la cookie de sesion (logout). */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Lee el token de sesion crudo de la cookie (para revocar en logout). */
export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}
