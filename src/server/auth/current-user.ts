/**
 * Capa de COOKIE de sesion (server-only): lee/escribe la cookie y resuelve el
 * usuario actual usando el nucleo `session.ts`. Aqui es donde entra Next
 * (`next/headers`) y el singleton Prisma, por eso es `server-only` y no se importa
 * desde el cliente. La logica testeable vive en `session.ts`.
 */
import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { SESSION_COOKIE } from "@/config/constants";
import { env } from "@/config/env";
import { prisma } from "@/server/db/client";

import { validateSession, type SessionUser } from "./session";

/**
 * Usuario de la sesion actual, o null. Valida caducidad en cada llamada.
 *
 * MEMOIZADO POR PETICION con `cache()` de React. NO es una cache de datos: no guarda nada entre
 * peticiones, no tiene TTL y no hay que invalidarla. Es deduplicacion DENTRO de una misma peticion:
 * la primera llamada consulta, las siguientes reciben esa misma promesa, y al terminar la peticion
 * el ambito muere. El contrato y el resultado son identicos a los de antes.
 *
 * POR QUE ESTA AQUI, con la medida delante (no con la suposicion que se hizo primero):
 * el layout de `(app)/(shell)` resuelve la sesion para la barra superior y casi cada pagina de ese
 * grupo la vuelve a pedir, asi que el CUERPO se ejecutaba DOS VECES por peticion. Se dio por hecho
 * que eso eran dos SELECT a `Session`, y NO lo era: trazando una peticion real a `/perfil` con el log
 * de consultas de MariaDB salian 2 ejecuciones del cuerpo pero UNA sola consulta, porque el batching
 * de `findUnique` de Prisma junta las dos identicas cuando caen en el mismo tick.
 *
 * O sea: la propiedad "una consulta por peticion" YA se cumplia, pero por CASUALIDAD — depende de que
 * las dos llamadas coincidan en la ventana de batching, que es cuestion de tiempos. Con `cache()` el
 * cuerpo se ejecuta UNA vez (medido: 1 en vez de 2) y la propiedad pasa a estar GARANTIZADA por
 * construccion. Ademas ahorra releer la cookie y revalidar la sesion, que tampoco eran gratis.
 *
 * OJO AL AMBITO: `cache()` solo deduplica donde React establece el ambito de peticion (Server
 * Components y route handlers del App Router). Fuera de ahi —en un test de Node, por ejemplo— NO
 * deduplica y cada llamada vuelve a consultar: comprobado. Eso no es un fallo, es su contrato; por
 * eso la verificacion de esta pieza es una TRAZA sobre una peticion real, no un unitario.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(prisma, token);
});

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
