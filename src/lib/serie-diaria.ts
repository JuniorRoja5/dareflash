/**
 * SERIE DIARIA — la parte PURA de "Rendimiento en el tiempo": qué días forman la ventana y cómo se
 * cruzan con los recuentos que da la BD.
 *
 * TODO EN DÍAS UTC, como el resto del proyecto (ver `RESET_TIMEZONE`): un voto a las 23:30 UTC es de
 * ese día para cualquiera que mire, y las dos series (participaciones y votos) se cortan igual. La
 * zona del admin solo intervendría al presentar, nunca al contar.
 *
 * LOS CEROS DE DENTRO DE LA VENTANA SON DATO, NO RELLENO: la consulta cubre cada día de la ventana,
 * así que un día sin filas tuvo 0 de verdad. Quitarlos comprimiría el eje y juntaría días que no son
 * contiguos. Lo que queda FUERA de la ventana no se pinta, ni como cero.
 */
const DIA_MS = 86_400_000;

/** Un día (UTC) de actividad de un reto. */
export interface DiaActividad {
  /** "YYYY-MM-DD", día UTC. */
  dia: string;
  participaciones: number;
  votos: number;
}

/** "YYYY-MM-DD" del día UTC de `d`. */
export function diaUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Todos los días UTC de la ventana [desde, hasta], los dos extremos incluidos y en orden. Vacía si la
 * ventana aún no ha empezado (`hasta` antes que `desde`). En UTC todos los días duran lo mismo: no hay
 * cambio de hora que salte o repita uno.
 */
export function diasUtcEntre(desde: Date, hasta: Date): string[] {
  if (hasta.getTime() < desde.getTime()) return [];
  const dias: string[] = [];
  const fin = hasta.getTime();
  for (
    let t = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
    t <= fin;
    t += DIA_MS
  ) {
    dias.push(diaUtc(new Date(t)));
  }
  return dias;
}

/**
 * Cruza los recuentos por día (tal cual los devuelve la BD: solo los días CON filas) con todos los días
 * de la ventana. Un día de la ventana sin filas vale 0; un día que no sea de la ventana se ignora.
 */
export function rellenarSerie(
  dias: readonly string[],
  participaciones: ReadonlyMap<string, number>,
  votos: ReadonlyMap<string, number>,
): DiaActividad[] {
  return dias.map((dia) => ({
    dia,
    participaciones: participaciones.get(dia) ?? 0,
    votos: votos.get(dia) ?? 0,
  }));
}
