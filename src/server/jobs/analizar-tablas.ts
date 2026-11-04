/**
 * RECALCULAR LAS ESTADÍSTICAS que mantienen barato el plan del feed.
 *
 * ┌─ POR QUÉ HACE FALTA UN TRABAJO PERIÓDICO ──────────────────────────────────────────────────────┐
 * │ El plan del feed depende de DOS piezas: el índice ordenado de `Video` y las estadísticas       │
 * │ persistentes. Medido sobre 6.000 vídeos y 2.000 usuarios:                                      │
 * │                                                                                                 │
 * │   sin nada                      34,2 ms   arranca por `User`, filesort                          │
 * │   SOLO el índice                34,2 ms   arranca por `User`, filesort  (el optimizador lo ignora) │
 * │   solo estadísticas             10,9 ms   arranca por `Video`, filesort                         │
 * │   índice + estadísticas          1,1 ms   arranca por `Video`, sin filesort                     │
 * │                                                                                                 │
 * │ Las estadísticas son una FOTO del momento en que se calcularon. Según crecen los datos dejan   │
 * │ de parecerse a la realidad, y el día que el optimizador vuelva a creer que entrar por `User`   │
 * │ es barato, el feed vuelve a los 34 ms sin que nada falle ni avise. Por eso se repiten.         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ DE MADRUGADA, Y POR QUÉ ESA HORA ─────────────────────────────────────────────────────────────┐
 * │ `ANALYZE … PERSISTENT FOR ALL` recorre la tabla entera. Con el volumen sembrado cuesta ~300 ms │
 * │ entre las cuatro y no se apreció bloqueo de escrituras, pero el coste crece con las filas y la │
 * │ máquina tiene UN núcleo compartido: no es trabajo para la hora punta. Se hace a las 4 de la    │
 * │ madrugada en Europe/Madrid, que es el valle de una app de vídeo en España.                     │
 * │                                                                                                 │
 * │ UNA VEZ AL DÍA basta: lo que invalida las estadísticas es que cambie la FORMA de los datos     │
 * │ (qué proporción de usuarios está borrada, cuántos vídeos hay por autor), y eso se mueve en     │
 * │ semanas, no en horas. Más a menudo sería pagar el escaneo sin comprar nada.                    │
 * │                                                                                                 │
 * │ Y SOLO LAS CUATRO TABLAS QUE DECIDEN ESTE PLAN. Analizar la base entera arrastraría tablas     │
 * │ grandes que no intervienen (`BoostActivation` guarda todo el historial) por un plan que no es  │
 * │ el suyo.                                                                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Las tablas del plan del feed. Son las que salen en el `EXPLAIN`: `Video` conduce, `User` es
 * quien lo desviaba, y `Submission`/`Challenge` son los joins del `OR`.
 *
 * Lista blanca CERRADA, y no un parámetro: estos nombres se interpolan en el SQL porque
 * `ANALYZE TABLE` no admite parámetros. Que sean constantes de este módulo es lo que hace que no
 * pueda llegar aquí nada de fuera.
 */
const TABLAS_DEL_FEED = ["Video", "User", "Submission", "Challenge"] as const;

/** Las 4 de la madrugada, en la hora de España. */
const HORA_VALLE = 4;

/**
 * ¿Toca ya? Puro, para poder atar la cadencia con un test sin esperar un día.
 *
 * Se compara el DÍA, no un intervalo de 24 h: con un intervalo, cada reinicio del worker correría
 * el análisis otra vez, y un día con tres despliegues serían tres escaneos en hora punta. Mirando
 * el día local, como mucho se hace una vez por jornada y siempre en la ventana del valle.
 */
export function tocaAnalizar(ahora: Date, ultimoDiaHecho: string | null): boolean {
  const { dia, hora } = diaYHoraEnMadrid(ahora);
  if (hora !== HORA_VALLE) return false;
  return dia !== ultimoDiaHecho;
}

/**
 * El día y la hora en Europe/Madrid. Se usa `Intl` y no una resta de horas: España cambia de
 * huso dos veces al año, y un desplazamiento fijo convertiría "las 4" en "las 3" o "las 5" medio
 * año — justo en la ventana que se quería evitar.
 */
export function diaYHoraEnMadrid(ahora: Date): { dia: string; hora: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(ahora);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")) };
}

/** Recalcula las estadísticas. Devuelve cuánto tardó, para el log. */
export async function analizarTablasDelFeed(
  db: PrismaClient,
  log: (m: string) => void = () => {},
): Promise<{ ms: number; tablas: number }> {
  const t0 = Date.now();
  for (const tabla of TABLAS_DEL_FEED) {
    // `$executeRawUnsafe` porque `ANALYZE TABLE` no admite parámetros. El nombre NO viene de
    // fuera: sale de la lista blanca cerrada de arriba.
    await db.$executeRawUnsafe(`ANALYZE TABLE \`${tabla}\` PERSISTENT FOR ALL`);
  }
  const ms = Date.now() - t0;
  log(`[worker] estadisticas del feed recalculadas (${TABLAS_DEL_FEED.length} tablas, ${ms} ms).`);
  return { ms, tablas: TABLAS_DEL_FEED.length };
}
