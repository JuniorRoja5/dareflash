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
 * SUELO MINIMO de tablas que deben existir en una base restaurada valida. Es solo un
 * suelo: la comprobacion FUERTE es comparar contra el conjunto real de produccion
 * (faltanRespectoAProduccion), que se mantiene solo al crecer el esquema. Incluye las de
 * dinero, las de auth y `_prisma_migrations` (sin ella, un `migrate deploy` sobre la base
 * restaurada intentaria reaplicar TODAS las migraciones).
 */
export const TABLAS_CRITICAS = [
  "_prisma_migrations",
  "User",
  "Session",
  "VerificationToken",
  "WalletLedger",
  "PointsLedger",
  "BoostLedger",
  "Job",
] as const;

/** Tablas del suelo minimo que FALTAN entre las presentes (vacio = todas estan). */
export function faltanTablasCriticas(presentes: readonly string[]): string[] {
  const set = new Set(presentes);
  return TABLAS_CRITICAS.filter((t) => !set.has(t));
}

/**
 * Comprobacion FUERTE (se mantiene sola): tablas que existen en PRODUCCION pero NO en la
 * base restaurada. Si hay alguna, la restauracion esta incompleta. Al crecer el esquema no
 * hay que tocar ninguna lista: se compara el conjunto vivo contra el restaurado.
 */
export function faltanRespectoAProduccion(
  produccion: readonly string[],
  restauradas: readonly string[],
): string[] {
  const set = new Set(restauradas);
  return produccion.filter((t) => !set.has(t)).sort();
}

/**
 * Tablas cuyo NUMERO DE FILAS se compara entre produccion y la restaurada. Un volcado de
 * SOLO ESTRUCTURA (18 tablas, 0 filas) pasaria la comparacion de conjuntos; esto lo caza.
 * Son efectivamente APPEND-ONLY (User se borra en blando -> deletedAt, sin quitar la fila;
 * los ledgers nunca se borran), asi que la restaurada JAMAS puede tener menos filas que
 * las que produccion tenia al volcar. Por eso la condicion es "no menos", no igualdad: la
 * BD viva sigue creciendo entre el volcado y la comparacion.
 *
 * OJO al ampliar esta lista: SOLO tablas append-only. Una tabla con borrado REAL podria
 * BAJAR de filas entre el conteo previo y la comparacion, y "no menos" dispararia falsos
 * positivos cada noche. Para esos casos haria falta otra estrategia (p.ej. rango tolerado).
 */
export const TABLAS_CON_FILAS = ["User", "WalletLedger", "PointsLedger"] as const;

/** Tablas donde la restaurada tiene MENOS filas que produccion (volcado incompleto/vacio). */
export function filasInsuficientes(
  prod: Record<string, number>,
  restaurada: Record<string, number>,
): string[] {
  const bajaron: string[] = [];
  for (const [tabla, n] of Object.entries(prod)) {
    const r = restaurada[tabla] ?? 0;
    if (r < n) bajaron.push(`${tabla}: produccion=${n}, restaurada=${r}`);
  }
  return bajaron;
}
