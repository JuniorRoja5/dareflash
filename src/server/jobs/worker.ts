/**
 * RUNNER de la cola de trabajos: sondea la tabla `Job` (fuente de verdad), reclama un lote
 * con `claimJobs` (UPDATE atomico, sin duplicados) y despacha cada job a su handler del
 * registro. Fallo -> reintento con backoff+jitter hasta agotar -> FAILED. Un reaper recupera
 * los jobs que quedaron RUNNING por un worker caido, segun la politica de CADA tipo.
 *
 * NO usa Redis: con MariaDB como fuente de verdad, el sondeo basta. Se anadira un despertador
 * solo si una necesidad medida lo justifica.
 */
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { claimJobs } from "@/server/services/jobs";

import type { Registro } from "./registry";

/** Timeout de UN handler. INVARIANTE: debe ser < REAPER_UMBRAL_MS (ver validarInvarianteReaper). */
export const JOB_TIMEOUT_MS = Number(process.env["JOB_TIMEOUT_MS"] ?? String(60 * 1000)); // 60 s
/** El reaper recupera jobs RUNNING mas viejos que esto (worker caido a media ejecucion). */
export const REAPER_UMBRAL_MS = Number(
  process.env["JOB_REAPER_UMBRAL_MS"] ?? String(10 * 60 * 1000),
); // 10 min

/**
 * INVARIANTE CRITICO: el timeout de un job debe ser SIEMPRE menor que el umbral del reaper.
 * Si un job puede correr 15 min y el reaper recupera a los 10, habria DOS ejecuciones del
 * mismo job a la vez. Se valida al arrancar el worker y en un test.
 */
export function validarInvarianteReaper(jobTimeoutMs: number, reaperUmbralMs: number): void {
  if (jobTimeoutMs >= reaperUmbralMs) {
    throw new Error(
      `Invariante rota: JOB_TIMEOUT_MS (${jobTimeoutMs}) debe ser < REAPER_UMBRAL_MS ` +
        `(${reaperUmbralMs}); si no, el reaper recuperaria un job que AUN corre -> doble ejecucion.`,
    );
  }
}

/**
 * Backoff exponencial acotado + JITTER +-20%. Sin jitter, si 20 correos fallan por la misma
 * caida del SMTP reintentan todos a la vez y vuelven a tumbarlo. Progresion base: 1m, 5m, 25m,
 * ... con tope 6h. `aleatorio` es inyectable para tests.
 */
export function backoffMs(attempts: number, aleatorio: () => number = Math.random): number {
  const base = Math.min(5 ** (attempts - 1) * 60_000, 6 * 60 * 60_000); // 1m,5m,25m... tope 6h
  const jitter = 0.8 + aleatorio() * 0.4; // +-20%
  return Math.round(base * jitter);
}

function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_r, rej) => setTimeout(() => rej(new Error("JOB_TIMEOUT")), ms)),
  ]);
}

export interface LoteResultado {
  hechos: number;
  fallidos: number;
}

export interface ProcesarLoteInput {
  workerToken: string;
  limit: number;
  now?: Date;
  /** Inyectable para tests del jitter. */
  aleatorio?: () => number;
}

/**
 * Reclama un lote y despacha cada job. DONE (borra el payload) / reintento con backoff /
 * FAILED (conserva el resumen no sensible). Un tipo desconocido va a FAILED (no colgado).
 */
export async function procesarLote(
  db: PrismaClient,
  registro: Registro,
  input: ProcesarLoteInput,
): Promise<LoteResultado> {
  const now = input.now ?? new Date();
  const jobs = await claimJobs(db, { workerToken: input.workerToken, limit: input.limit, now });

  let hechos = 0;
  let fallidos = 0;

  for (const job of jobs) {
    const def = registro[job.type];
    if (!def) {
      await db.job.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          lockedBy: null,
          lastError: `tipo de job desconocido: ${job.type}`,
        },
      });
      fallidos += 1;
      continue;
    }

    try {
      await conTimeout(def.handler(job), JOB_TIMEOUT_MS);
      await db.job.update({
        where: { id: job.id },
        // Borrar el payload: puede llevar enlace/token, no debe quedar retenido.
        data: { status: "DONE", payload: Prisma.DbNull, lockedBy: null },
      });
      hechos += 1;
    } catch {
      const attempts = job.attempts + 1;
      const agotado = attempts >= job.maxAttempts;
      await db.job.update({
        where: { id: job.id },
        data: agotado
          ? {
              status: "FAILED",
              attempts,
              lockedBy: null,
              lastError: "job fallido (agotados los intentos)",
              payload: def.resumenFallo?.(job) ?? Prisma.DbNull,
            }
          : {
              status: "PENDING",
              attempts,
              lockedBy: null,
              lastError: "job fallido (reintentara)",
              runAt: new Date(now.getTime() + backoffMs(attempts, input.aleatorio)),
            },
      });
      fallidos += 1;
    }
  }

  return { hechos, fallidos };
}

export interface ReaperResultado {
  reencolados: number;
  fallados: number;
}

/**
 * Recupera los jobs RUNNING mas viejos que `umbralMs` (worker caido). Aplica la politica de
 * CADA tipo: "REQUEUE" -> PENDING (reintento inmediato); "FAIL" (o tipo desconocido) -> FAILED
 * conservando el resumen no sensible.
 */
export async function repasarColgados(
  db: PrismaClient,
  registro: Registro,
  input: { now?: Date; umbralMs?: number },
): Promise<ReaperResultado> {
  const now = input.now ?? new Date();
  const umbral = input.umbralMs ?? REAPER_UMBRAL_MS;
  const limite = new Date(now.getTime() - umbral);

  const colgados = await db.job.findMany({
    where: { status: "RUNNING", lockedAt: { lt: limite } },
  });

  let reencolados = 0;
  let fallados = 0;
  for (const job of colgados) {
    const def = registro[job.type];
    if (def?.reaper === "REQUEUE") {
      await db.job.update({
        where: { id: job.id },
        data: { status: "PENDING", lockedBy: null, lockedAt: null, runAt: now },
      });
      reencolados += 1;
    } else {
      await db.job.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          lockedBy: null,
          lastError: "reaper: worker caido a media ejecucion",
          payload: def?.resumenFallo?.(job) ?? Prisma.DbNull,
        },
      });
      fallados += 1;
    }
  }
  return { reencolados, fallados };
}

/** Numero de jobs en FAILED (para /api/health y el log de arranque del worker). */
export function contarFallidos(db: PrismaClient): Promise<number> {
  return db.job.count({ where: { status: "FAILED" } });
}

export interface OpcionesBucle {
  workerToken: string;
  limit: number;
  intervaloMs: number;
  umbralReaperMs?: number;
  reaperCadaMs?: number;
  /** true -> dejar de reclamar y salir (SIGTERM). Se comprueba ENTRE lotes, no a media faena. */
  parar: () => boolean;
  dormir: (ms: number) => Promise<void>;
  ahora?: () => Date;
}

/**
 * Bucle permanente. Apagado LIMPIO: `parar` se comprueba ANTES de reclamar y despues de cada
 * lote, nunca a media faena -> un SIGTERM deja de reclamar nuevos y termina el lote en curso.
 * (El apagado limpio es el camino normal; el reaper solo actua ante una caida DURA.)
 */
export async function bucleWorker(
  db: PrismaClient,
  registro: Registro,
  o: OpcionesBucle,
): Promise<void> {
  validarInvarianteReaper(JOB_TIMEOUT_MS, o.umbralReaperMs ?? REAPER_UMBRAL_MS);
  const ahora = o.ahora ?? (() => new Date());
  let ultimoReaper = 0;

  while (!o.parar()) {
    const t = ahora();
    const { hechos, fallidos } = await procesarLote(db, registro, {
      workerToken: o.workerToken,
      limit: o.limit,
      now: t,
    });

    if (t.getTime() - ultimoReaper >= (o.reaperCadaMs ?? 60_000)) {
      await repasarColgados(db, registro, { now: t, umbralMs: o.umbralReaperMs });
      ultimoReaper = t.getTime();
    }

    if (o.parar()) break;
    if (hechos + fallidos === 0) await o.dormir(o.intervaloMs); // nada que hacer -> esperar
  }
}
