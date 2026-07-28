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
/** Tope por defecto del backoff (los tipos pueden acortarlo; SEND_EMAIL lo baja mucho). */
export const TOPE_BACKOFF_DEFECTO_MS = 6 * 60 * 60_000; // 6 h
/** Cota del findMany del reaper: no cargar miles de filas colgadas en memoria. */
const REAPER_LOTE = 1000;

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
 * caida del SMTP reintentan todos a la vez y vuelven a tumbarlo. Base 1m, 5m, 25m... con TOPE
 * configurable por tipo (SEND_EMAIL lo baja a minutos: un correo que llega 9 h tarde no sirve).
 */
export function backoffMs(
  attempts: number,
  topeMs: number = TOPE_BACKOFF_DEFECTO_MS,
  aleatorio: () => number = Math.random,
): number {
  const base = Math.min(5 ** (attempts - 1) * 60_000, topeMs);
  const jitter = 0.8 + aleatorio() * 0.4; // +-20%
  return Math.round(base * jitter);
}

/** Timeout del handler que MARCA el error como ambiguo (`code: JOB_TIMEOUT`): puede haber
 *  ocurrido el efecto. Es una RED de seguridad; el abort real lo hace el propio transporte. */
function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_r, reject) =>
      setTimeout(() => {
        const e = new Error(
          "JOB_TIMEOUT: el handler no termino a tiempo (efecto posiblemente en vuelo)",
        );
        (e as { code?: string }).code = "JOB_TIMEOUT";
        reject(e);
      }, ms),
    ),
  ]);
}

/** Fases SMTP (nodemailer `error.command`) ANTERIORES al envio de los datos: si el fallo
 *  ocurrio aqui, el correo NO salio -> reintentar es seguro. */
const FASES_LIMPIAS = new Set(["CONN", "EHLO", "HELO", "AUTH", "MAIL FROM", "RCPT TO"]);

/**
 * ¿El fallo es AMBIGUO (el efecto PUDO ocurrir)? Los dos costes enfrentados: clasificar mal como
 * AMBIGUO un correo que NO salio -> se pierde (recuperable con "reenviar"); clasificar mal como
 * LIMPIO uno que SI salio -> se reintenta y llega DUPLICADO. Para SEND_EMAIL preferimos no
 * duplicar, PERO sin anular el reintento en el corte transitorio (el fallo mas comun).
 *
 * Criterio: LIMPIO solo con SEÑAL POSITIVA de que no salio, no por ausencia de senal. Se mira la
 * FASE (nodemailer `error.command`), no el `code`: un mismo ETIMEDOUT es de CONEXION (no salio ->
 * limpio) o de DATA (pudo salir -> ambiguo).
 *  - CONN/EHLO/AUTH/MAIL FROM/RCPT TO -> antes de los datos: LIMPIO, reintentar con backoff.
 *  - DATA, el punto final, o SIN `command` -> AMBIGUO, aplicar la politica del tipo.
 *  - JOB_TIMEOUT (la red de seguridad) -> AMBIGUO siempre: ahi no sabemos en que fase estaba.
 * Ante la duda, AMBIGUO. Antes de "simplificar" esto, entender por que esta asi.
 */
export function esAmbiguo(e: unknown): boolean {
  if (!(e instanceof Error)) return true; // sin senal -> ambiguo
  if ((e as { code?: unknown }).code === "JOB_TIMEOUT") return true; // no sabemos la fase
  const command = (e as { command?: unknown }).command;
  if (typeof command === "string" && FASES_LIMPIAS.has(command)) return false; // no salio
  return true; // DATA, punto final, o sin command -> ambiguo
}

/**
 * Mensaje de error SANEADO para `lastError`: alguien lo va a leer (Junior, al depurar un correo
 * que no llega). NUNCA el mensaje crudo: puede llevar tokens, enlaces o credenciales. Se guarda
 * el `code` de nodemailer (EAUTH, ECONNECTION, EDNS, ETIMEDOUT, EENVELOPE...) y el responseCode
 * SMTP, que es justo lo que distingue auth / certificado / DNS / rechazo del destinatario.
 */
export function sanearError(e: unknown): string {
  if (!(e instanceof Error)) return "error desconocido";
  const code = (e as { code?: unknown }).code;
  const rc = (e as { responseCode?: unknown }).responseCode;
  if (typeof code === "string") return typeof rc === "number" ? `${code} (${rc})` : code;
  if (/cert|tls/i.test(e.message)) return "error de certificado TLS";
  return e.name || "error de envio"; // fallback SIN el mensaje crudo
}

export interface LoteResultado {
  hechos: number;
  fallidos: number;
  liberados: number;
}

export interface ProcesarLoteInput {
  workerToken: string;
  limit: number;
  now?: Date;
  /** Timeout del handler (override para tests). */
  jobTimeoutMs?: number;
  /** Inyectable para tests del jitter. */
  aleatorio?: () => number;
  /** Apagado limpio: si pasa a true, se libera el RESTO del lote a PENDING (no se deja RUNNING). */
  parar?: () => boolean;
}

/**
 * Reclama un lote y despacha cada job. Entre trabajos comprueba `parar` (apagado limpio):
 * libera los NO procesados a PENDING —no los deja RUNNING esperando al reaper—. DONE borra el
 * payload; el fallo se clasifica (ver mas abajo) en reintento con backoff o FAILED.
 */
export async function procesarLote(
  db: PrismaClient,
  registro: Registro,
  input: ProcesarLoteInput,
): Promise<LoteResultado> {
  const now = input.now ?? new Date();
  const timeout = input.jobTimeoutMs ?? JOB_TIMEOUT_MS;
  const jobs = await claimJobs(db, { workerToken: input.workerToken, limit: input.limit, now });

  let hechos = 0;
  let fallidos = 0;
  let liberados = 0;

  for (let i = 0; i < jobs.length; i += 1) {
    // Apagado limpio: liberar el resto del lote (incl. este) a PENDING y salir del lote.
    if (input.parar?.()) {
      const resto = jobs.slice(i).map((j) => j.id);
      const r = await db.job.updateMany({
        where: { id: { in: resto }, status: "RUNNING" },
        data: { status: "PENDING", lockedBy: null, lockedAt: null },
      });
      liberados = r.count;
      break;
    }

    const job = jobs[i]!;
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
      await conTimeout(def.handler(job), timeout);
      await db.job.update({
        where: { id: job.id },
        // Borrar el payload: puede llevar enlace/token, no debe quedar retenido.
        data: { status: "DONE", payload: Prisma.DbNull, lockedBy: null },
      });
      hechos += 1;
    } catch (e) {
      const lastError = sanearError(e);
      // Fallo AMBIGUO (timeout: el efecto pudo ocurrir) sobre un tipo con politica FAIL:
      // aplicamos la MISMA politica que el reaper (SEND_EMAIL). Reintentar arriesgaria un
      // duplicado. Un fallo LIMPIO (conexion/auth/DNS: no salio) o un tipo REQUEUE (idempotente)
      // se reintenta con backoff.
      if (esAmbiguo(e) && def.reaper === "FAIL") {
        await db.job.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            attempts: job.attempts + 1,
            lockedBy: null,
            lastError: `ambiguo, posible efecto: ${lastError}`,
            payload: def.resumenFallo?.(job) ?? Prisma.DbNull,
          },
        });
        fallidos += 1;
        continue;
      }

      const attempts = job.attempts + 1;
      const agotado = attempts >= job.maxAttempts;
      const tope = def.backoffTopeMs ?? TOPE_BACKOFF_DEFECTO_MS;
      await db.job.update({
        where: { id: job.id },
        data: agotado
          ? {
              status: "FAILED",
              attempts,
              lockedBy: null,
              lastError,
              payload: def.resumenFallo?.(job) ?? Prisma.DbNull,
            }
          : {
              status: "PENDING",
              attempts,
              lockedBy: null,
              lastError,
              runAt: new Date(now.getTime() + backoffMs(attempts, tope, input.aleatorio)),
            },
      });
      fallidos += 1;
    }
  }

  return { hechos, fallidos, liberados };
}

export interface ReaperResultado {
  reencolados: number;
  fallados: number;
}

/**
 * Recupera los jobs RUNNING mas viejos que `umbralMs` (worker caido). Aplica la politica de
 * CADA tipo: "REQUEUE" -> PENDING (reintento inmediato); "FAIL" (o tipo desconocido) -> FAILED
 * conservando el resumen no sensible. `take` acota la carga en memoria.
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
    take: REAPER_LOTE,
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

/** Borra los jobs DONE con mas de `dias` (la tabla no crece sin fin; sin cron ni nada externo). */
export async function podarDone(
  db: PrismaClient,
  input: { now?: Date; dias: number },
): Promise<number> {
  const now = input.now ?? new Date();
  const limite = new Date(now.getTime() - input.dias * 24 * 60 * 60_000);
  const r = await db.job.deleteMany({ where: { status: "DONE", createdAt: { lt: limite } } });
  return r.count;
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
  podaCadaMs?: number;
  doneRetenerDias?: number;
  /** true -> dejar de reclamar y salir (SIGTERM). Se comprueba entre lotes Y entre trabajos. */
  parar: () => boolean;
  dormir: (ms: number) => Promise<void>;
  ahora?: () => Date;
}

/**
 * Bucle permanente. Apagado LIMPIO: `parar` se comprueba antes de reclamar y —dentro de
 * `procesarLote`— entre trabajos, liberando a PENDING los no procesados. Asi el peor caso de
 * apagado es UN job en vuelo (JOB_TIMEOUT_MS), no lote x timeout.
 */
export async function bucleWorker(
  db: PrismaClient,
  registro: Registro,
  o: OpcionesBucle,
): Promise<void> {
  validarInvarianteReaper(JOB_TIMEOUT_MS, o.umbralReaperMs ?? REAPER_UMBRAL_MS);
  const ahora = o.ahora ?? (() => new Date());
  let ultimoReaper = 0;
  let ultimaPoda = 0;

  while (!o.parar()) {
    const t = ahora();
    const { hechos, fallidos } = await procesarLote(db, registro, {
      workerToken: o.workerToken,
      limit: o.limit,
      now: t,
      parar: o.parar,
    });

    if (o.parar()) break;

    if (t.getTime() - ultimoReaper >= (o.reaperCadaMs ?? 60_000)) {
      await repasarColgados(db, registro, { now: t, umbralMs: o.umbralReaperMs });
      ultimoReaper = t.getTime();
    }
    if (t.getTime() - ultimaPoda >= (o.podaCadaMs ?? 24 * 60 * 60_000)) {
      await podarDone(db, { now: t, dias: o.doneRetenerDias ?? 7 });
      ultimaPoda = t.getTime();
    }

    if (o.parar()) break;
    if (hechos + fallidos === 0) await o.dormir(o.intervaloMs); // nada que hacer -> esperar
  }
}
