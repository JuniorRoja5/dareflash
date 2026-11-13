/**
 * EL IDIOMA Y LA ZONA DE LA PETICIÓN (Fase 11 · P1) — server-only.
 *
 * Lo que las páginas y las rutas pasan al formateador (`lib/formato`). Se lee POR PETICIÓN (cookies),
 * nunca en ámbito de módulo: el build corre sin petición.
 */
import "server-only";

import { cookies } from "next/headers";

import type { Idioma, ZonaHoraria } from "@/lib/formato";
import { ZONA_COOKIE, zonaDesdeCookie } from "@/lib/zona-espectador";

/**
 * El idioma de quien mira. HOY SIEMPRE «es»: la app solo habla castellano. La pieza de idiomas de la
 * Fase 11 lo leerá de su preferencia; todo lo que formatea ya pide el idioma, así que ese cambio será
 * aquí y en ningún otro sitio.
 */
export async function idiomaDeLaPeticion(): Promise<Idioma> {
  return "es";
}

/** La zona del navegador (cookie `df-zona`), validada. `null` si aún no la sabemos: no se inventa. */
export async function zonaDeLaPeticion(): Promise<ZonaHoraria | null> {
  return zonaDesdeCookie((await cookies()).get(ZONA_COOKIE)?.value);
}
