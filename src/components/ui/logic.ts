/**
 * Logica PURA de las primitivas de DareFlash: umbrales y eleccion de token de color. Se extrae
 * aparte —sin React, sin DOM— para poder ATARLA con tests. Dos invariantes de producto que no
 * pueden depender de que alguien se acuerde:
 *   - la cuenta atras pasa de --df-time a --df-alarm por debajo de 24 h;
 *   - el oro (--df-rank) solo sale en el podio (1/2/3).
 */

/** Por debajo de esto la cuenta atras es CRITICA (--df-time -> --df-alarm). Evento de producto. */
export const UMBRAL_ALARMA_MS = 24 * 60 * 60 * 1000; // 24 h

/** ¿La cuenta atras esta en zona CRITICA? (< 24 h restantes, agotado incluido). */
export function esCuentaAtrasCritica(msRestantes: number): boolean {
  return msRestantes < UMBRAL_ALARMA_MS;
}

/**
 * Token de color de la cuenta atras. SOLO "time" o "alarm": el tiempo NUNCA es money/rank/action/ok.
 * "alarm" en zona critica (<24 h), "time" en el resto. En el limite EXACTO de 24 h todavia es time.
 */
export function tokenCuentaAtras(msRestantes: number): "time" | "alarm" {
  return esCuentaAtrasCritica(msRestantes) ? "alarm" : "time";
}

/** Tiempo restante formateado: >=24 h -> "6 d 04 h"; <24 h -> "HH:MM:SS"; agotado -> "00:00:00". */
export function formatearCuentaAtras(msRestantes: number): string {
  if (msRestantes <= 0) return "00:00:00";
  const totalSeg = Math.floor(msRestantes / 1000);
  if (msRestantes >= UMBRAL_ALARMA_MS) {
    const dias = Math.floor(totalSeg / 86_400);
    const horas = Math.floor((totalSeg % 86_400) / 3_600);
    return `${dias} d ${String(horas).padStart(2, "0")} h`;
  }
  const hh = String(Math.floor(totalSeg / 3_600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeg % 3_600) / 60)).padStart(2, "0");
  const ss = String(totalSeg % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Token de color de un puesto de ranking: "rank" (oro) SOLO en 1, 2 y 3; el resto "neutral". El oro
 * NUNCA es decorativo. Un puesto no entero o fuera de rango no es podio.
 */
export function tokenPuesto(puesto: number): "rank" | "neutral" {
  return Number.isInteger(puesto) && puesto >= 1 && puesto <= 3 ? "rank" : "neutral";
}

/** Importe en centimos -> texto de moneda (USD por defecto), formato en-US: 125000 -> "$1,250.00". */
export function formatearImporte(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
