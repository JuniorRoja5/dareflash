/**
 * LA ZONA HORARIA DE QUIEN PIDE (Fase 11 · P2), sin leer cabeceras: la cookie del navegador y, si no,
 * la guardada en la sesión. Vive aparte de `formato-peticion` (que la reexporta para las páginas) para
 * que la API la use sin arrastrar las lecturas de `x-df-idioma` / `x-df-ruta`, que en `/api` nadie
 * pisa (P5b3, `api-sin-cabeceras-de-idioma`).
 */
import "server-only";

import { cookies } from "next/headers";

import type { ZonaHoraria } from "@/lib/formato";
import { ZONA_COOKIE, zonaDesdeCookie } from "@/lib/zona-espectador";

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
