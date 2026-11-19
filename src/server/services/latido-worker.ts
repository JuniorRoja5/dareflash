import type { PrismaClient } from "@/generated/prisma/client";

import { escribirEstado, leerEstado } from "./system-state";

/**
 * EL LATIDO DEL WORKER (Fase 11 · worker vigilado): una fila de `SystemState` que el worker reescribe
 * cada `LATIDO_WORKER_CADENCIA_MS`, y que `/api/health` lee para decir, con el mismo curl de siempre,
 * QUÉ commit es el worker que corre y si está vivo.
 *
 * ┌─ POR QUÉ HACE FALTA ──────────────────────────────────────────────────────────────────────────┐
 * │ El 19 nov un `.env` con `EMAIL_FROM` distinto de `SMTP_USER` mató al worker al arrancar, en    │
 * │ bucle (`restart: unless-stopped`), y `deploy.sh` terminó con «DESPLEGADO»: solo preguntaba a  │
 * │ la web. Un despliegue sin correos ni tareas de fondo se dio por bueno. Ahora `deploy.sh` no    │
 * │ termina sin un latido del SHA desplegado, reciente, y de un proceso que lleve vivo un rato.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `desde` (cuándo arrancó el proceso) es lo que distingue un worker VIVO de uno EN BUCLE: uno que
 * muere a los diez segundos alcanza a escribir algún latido —reciente y con el commit bueno—, pero su
 * `desde` vuelve a empezar en cada reinicio, y nunca acumula tiempo vivo.
 *
 * Una escritura trivial cada pocos segundos, del worker y nunca por petición de usuario. Lo que sale
 * al health (público) son solo números y el SHA: ni errores, ni hosts, ni nada interno.
 */

/** La clave de la fila. Una sola: hay UN worker por despliegue. */
export const CLAVE_LATIDO_WORKER = "worker:latido";

interface LatidoGuardado {
  commit: string | null;
  /** Cuándo se escribió, ISO. */
  en: string;
  /** Cuándo arrancó el proceso que lo escribió, ISO. */
  desde: string;
}

type Cliente = Pick<PrismaClient, "systemState">;

/** El worker anota que está vivo: su commit, ahora, y desde cuándo corre. */
export async function anotarLatido(
  db: Cliente,
  e: { commit: string | null; ahora: Date; desde: Date },
): Promise<void> {
  const valor: LatidoGuardado = {
    commit: e.commit,
    en: e.ahora.toISOString(),
    desde: e.desde.toISOString(),
  };
  await escribirEstado(db, CLAVE_LATIDO_WORKER, JSON.stringify(valor));
}

/** Lo que el health enseña: el commit, hace cuántos segundos latió y cuántos lleva vivo. */
export interface LatidoVisible {
  commit: string | null;
  haceS: number;
  vivoS: number;
}

/**
 * El último latido, visto desde `ahora`, o `null` si no hay ninguno o la fila no se entiende (una
 * fila rara no puede tumbar el health: es como no tener latido, que es lo que hay que enseñar).
 */
export async function leerLatido(db: Cliente, ahora: Date): Promise<LatidoVisible | null> {
  const crudo = await leerEstado(db, CLAVE_LATIDO_WORKER);
  if (!crudo) return null;
  try {
    const l = JSON.parse(crudo) as Partial<LatidoGuardado>;
    const en = Date.parse(l.en ?? "");
    const desde = Date.parse(l.desde ?? "");
    if (Number.isNaN(en) || Number.isNaN(desde)) return null;
    const commit =
      typeof l.commit === "string" && /^[0-9a-f]{40}$/.test(l.commit) ? l.commit : null;
    return {
      commit,
      haceS: Math.max(0, Math.round((ahora.getTime() - en) / 1000)),
      vivoS: Math.max(0, Math.round((en - desde) / 1000)),
    };
  } catch {
    return null;
  }
}
