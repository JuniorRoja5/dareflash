/**
 * EL IDIOMA Y LA ZONA DE LA PETICIÓN (Fase 11 · P1) — server-only.
 *
 * Lo que las páginas y las rutas pasan al formateador (`lib/formato`). Se lee POR PETICIÓN (cookies),
 * nunca en ámbito de módulo: el build corre sin petición.
 */
import "server-only";

import { cookies, headers } from "next/headers";

import type { Idioma, ZonaHoraria } from "@/lib/formato";
import { CABECERA_IDIOMA, CABECERA_RUTA, esIdioma, IDIOMA_RAIZ } from "@/lib/idioma-ruta";
import { ZONA_COOKIE, zonaDesdeCookie } from "@/lib/zona-espectador";

/**
 * EL IDIOMA DE LA PÁGINA, y el único sitio del que sale (Fase 11 · P5a). La URL manda: lo pone el proxy
 * en `x-df-idioma` a partir del prefijo (`/en/…`), y pisa siempre el que mande el cliente. Sin cabecera
 * —una ruta que no pasa por el proxy (la API, el panel) o el build—, el de la raíz: «es».
 *
 * Todavía no hay textos traducidos (P5b/P5c): hoy cambia `<html lang>` y lo que formatea con el idioma;
 * y mientras `IDIOMAS_PUBLICADOS` sea solo «es», el proxy no deja llegar aquí otro.
 */
export async function idiomaDeLaPeticion(): Promise<Idioma> {
  const valor = (await headers()).get(CABECERA_IDIOMA);
  return esIdioma(valor) ? valor : IDIOMA_RAIZ;
}

/**
 * La ruta de la página SIN prefijo de idioma (`/retos/x` también en `/en/retos/x`), de `x-df-ruta`. Para
 * la canónica y el `hreflang`. `null` si la petición no pasó por el proxy (panel, API, build): ahí no
 * se publica ninguna.
 */
export async function rutaDeLaPeticion(): Promise<string | null> {
  const valor = (await headers()).get(CABECERA_RUTA);
  return valor && valor.startsWith("/") && !valor.startsWith("//") ? valor : null;
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
