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

/**
 * LA ZONA DE QUIEN MIRA, y el ÚNICO sitio del que sale para mostrar. Por orden (Fase 11 · P2):
 *  1. la del navegador (cookie `df-zona`), validada: la de ESTE dispositivo, que es la que manda;
 *  2. si no la trae —la primera vista desde un dispositivo nuevo—, la GUARDADA del usuario con sesión;
 *  3. si tampoco, `null`: no se inventa (un invitado sin cookie, como en la P1). Nunca sale de la IP.
 *
 * NI UNA CONSULTA MÁS: con la cookie no se mira la sesión, y sin ella `getCurrentUser` es la MISMA
 * promesa memoizada que ya piden el layout y la página (`cache()`), cuya consulta trae la zona en su
 * `select`. Sin cookie de sesión, `validateSession` sale sin consultar nada. Import dinámico, como en
 * las rutas: este módulo lo carga el layout raíz, y no debe arrastrar Prisma al importarse.
 */
export async function zonaDeLaPeticion(): Promise<ZonaHoraria | null> {
  const delNavegador = zonaDesdeCookie((await cookies()).get(ZONA_COOKIE)?.value);
  if (delNavegador) return delNavegador;
  const { getCurrentUser } = await import("@/server/auth/current-user");
  return (await getCurrentUser())?.zonaHoraria ?? null;
}
