import "server-only";

import { notFound, redirect } from "next/navigation";

import { AuthError, requireRole } from "@/server/auth/rbac";
import type { SessionUser } from "@/server/auth/session";

import { rolDeRuta } from "./secciones";

/** Segmento del panel. La SEGURIDAD no es el nombre (es `requireRole`), pero se centraliza. */
export const PANEL_PATH = "/panel";

/**
 * GUARD DEL SHELL (lo llama el layout -> cubre TODO el subárbol). Exige MODERATOR o superior: el panel
 * dejó de ser exclusivo del administrador cuando existieron moderadores de verdad.
 *
 *   - UNAUTHENTICATED -> a login, con vuelta al panel tras entrar.
 *   - FORBIDDEN / no verificado -> a "/", SIN revelar que el panel existe (ni 404 ni mensaje de admin).
 *
 * OJO: ESTE GUARD YA NO DECIDE QUIÉN VE QUÉ. Solo dice quién entra al edificio. Lo que cada sección
 * exige lo declara `secciones.ts` y lo aplica `requireSeccion` en su página. Una página del panel sin
 * `requireSeccion` es una página abierta a cualquier moderador, y por eso hay un test estructural que
 * lo impide.
 */
export async function protegerPanel(): Promise<SessionUser> {
  try {
    return await requireRole("MODERATOR");
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHENTICATED") {
      redirect(`/entrar?siguiente=${encodeURIComponent(PANEL_PATH)}`);
    }
    redirect("/");
  }
}

/**
 * GUARD DE UNA PÁGINA, derivado de su SECCIÓN. Cada página del panel lo llama con su propia ruta; el
 * rol no se escribe aquí ni en la página: se lee de `secciones.ts`, que es lo que ve también la nav.
 * Así no puede pasar que la barra enseñe una sección al moderador y la página le dé un 403, ni al
 * revés — que es lo que ocurriría con `requireRole("ADMIN")` repartidos a mano.
 *
 * Una ruta que no pertenezca a ninguna sección REVIENTA (ver `rolDeRuta`): es un fallo de programación
 * ruidoso, no una puerta que se queda abierta.
 *
 * Y sigue siendo un guard de VISTA: cada endpoint que escriba mantiene el suyo.
 */
export async function requireSeccion(ruta: string): Promise<SessionUser> {
  const rol = rolDeRuta(ruta);
  try {
    return await requireRole(rol);
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNAUTHENTICATED") {
      redirect(`/entrar?siguiente=${encodeURIComponent(ruta)}`);
    }
    // Un moderador en una sección de administrador: NO EXISTE para él. 404 y no un mensaje de
    // "no tienes permiso", que solo serviría para contarle qué hay detrás. El layout sigue envuelto
    // alrededor, así que conserva su nav para irse a lo suyo: no es un callejón.
    notFound();
  }
}
