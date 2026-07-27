/**
 * Comprobaciones PURAS del respaldo (sin BD, testeables): detectan un dump truncado o
 * sospechosamente pequeño ANTES de darlo por bueno, y que la base restaurada tenga las
 * tablas criticas. Un dump que devuelve exit 0 pero se corto (disco lleno, proceso
 * matado) suele quedarse sin el sentinela final.
 */

/** mariadb-dump escribe "-- Dump completed" al final. Sin esa linea, el dump esta cortado. */
export function dumpPareceCompleto(colaDelFichero: string): boolean {
  return /--\s*Dump completed/i.test(colaDelFichero);
}

export interface EntradaTamano {
  bytes: number;
  /** Tamaño del ultimo dump BUENO (0 si no hay historico todavia). */
  previoBytes: number;
  /** Suelo absoluto: por debajo de esto es sospechoso pase lo que pase. */
  sueloBytes: number;
  /** Fraccion minima respecto al previo (por defecto 0.5 = al menos la mitad). */
  fraccionMinima?: number;
}

export interface ResultadoTamano {
  sospechoso: boolean;
  motivo?: string;
}

/** Marca como sospechoso un dump por debajo del suelo o muy por debajo del ultimo bueno. */
export function evaluarTamano(e: EntradaTamano): ResultadoTamano {
  const fraccion = e.fraccionMinima ?? 0.5;
  if (e.bytes < e.sueloBytes) {
    return { sospechoso: true, motivo: `${e.bytes} B < suelo ${e.sueloBytes} B` };
  }
  if (e.previoBytes > 0 && e.bytes < e.previoBytes * fraccion) {
    const pct = Math.round(fraccion * 100);
    return { sospechoso: true, motivo: `${e.bytes} B < ${pct}% del previo (${e.previoBytes} B)` };
  }
  return { sospechoso: false };
}

/**
 * Tablas que DEBEN existir en una base restaurada valida. Si falta alguna, la restauracion
 * no sirve (esquema incompleto). Incluye las de dinero y las de auth, que son las que no
 * podemos permitirnos perder.
 */
export const TABLAS_CRITICAS = [
  "User",
  "Session",
  "VerificationToken",
  "WalletLedger",
  "PointsLedger",
  "BoostLedger",
  "Job",
] as const;

/** Devuelve las tablas criticas que FALTAN entre las presentes (vacio = todas estan). */
export function faltanTablasCriticas(presentes: readonly string[]): string[] {
  const set = new Set(presentes);
  return TABLAS_CRITICAS.filter((t) => !set.has(t));
}
