/**
 * RUNNER de la cola de trabajos: sondea la tabla `Job` (fuente de verdad), reclama un lote
 * con `claimJobs` (UPDATE atomico, sin duplicados) y despacha cada job a su handler del
 * registro. Fallo -> reintento con backoff+jitter hasta agotar -> FAILED. Un reaper recupera
 * los jobs que quedaron RUNNING por un worker caido, segun la politica de CADA tipo.
 *
 * NO usa Redis: con MariaDB como fuente de verdad, el sondeo basta. El despertador del confirm
 * (event-kick) es TAMBIEN MariaDB: una marca en SystemState que la ruta de subida escribe al crear
 * la fila fuerza un barrido en el siguiente tick, sin sondear Bunny en vacio (ver el bucle).
 */
import {
  CONFIRM_CADENCIA_ACTIVO_MS,
  CONFIRM_CADENCIA_REPOSO_MS,
  CONFIRM_WAKE_KEY,
  JOB_DONE_RETENTION_DAYS,
  JOB_FAILED_ALERT_THRESHOLD,
  JOB_FAILED_RETENTION_DAYS,
  RATE_LIMIT_PURGE_RETENER_MS,
  RECON_CADENCIA_MS,
  RECON_HUERFANOS_CADENCIA_MS,
  RECON_PUBLICADOS_CADENCIA_MS,
} from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { purgeExpiredSessions } from "@/server/auth/session";
import type { EmailAdapter, EmailMessage } from "@/server/email/adapter";
import { sanearError } from "@/server/observability/sanitize-error";
import { claimJobs } from "@/server/services/jobs";
import type { ResultadoHuerfanos } from "@/server/services/reconciliacion-huerfanos";
import type { ResultadoPublicados } from "@/server/services/reconciliacion-publicados";
import { escribirEstado, leerEstado } from "@/server/services/system-state";
import { cadenciaConfirmMs, type ResultadoConfirm } from "@/server/services/video-confirmacion";
import type { ResultadoReconciliacion } from "@/server/services/video-reconciliacion";

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
/** Tamano de LOTE de las purgas (RateLimit/Job): un DELETE de millones de filas bloquea la
 *  tabla y tumba los logins. Se borra en tandas de este tamano hasta drenar (o hasta el tope). */
const PURGA_LOTE = 1000;
/** Tope de tandas por CICLO de purga (backstop anti-bucle). Si se alcanza, NO se drenó todo:
 *  se registra y se sigue en el proximo ciclo (nada de tope silencioso). */
const PURGA_MAX_TANDAS = 1000;
/** Clave en SystemState de la histeresis del aviso de FAILED (ver `avisarSiFallidos`). */
const CLAVE_AVISO_FAILED = "aviso:job_failed";
const AVISO_ARMADO = "armado";
const AVISO_DISPARADO = "disparado";

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

// `sanearError` se movio a `@/server/observability/sanitize-error` (lo usan el worker y las rutas).
// Se re-exporta para no romper importadores (p.ej. tests/worker.test.ts).
export { sanearError };

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
  /** Log operativo por trabajo (tipo, id, resultado, duracion). NUNCA datos sensibles. */
  log?: (m: string) => void;
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

  // Una linea por trabajo procesado: tipo, id, resultado, duracion. Sin payload/token/correo.
  const registrar = (job: { type: string; id: string }, resultado: string, durMs: number): void =>
    input.log?.(`[worker] job type=${job.type} id=${job.id} resultado=${resultado} dur=${durMs}ms`);

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
      registrar(job, "DESCONOCIDO", 0);
      fallidos += 1;
      continue;
    }

    const t0 = Date.now();
    try {
      await conTimeout(def.handler(job), timeout);
      await db.job.update({
        where: { id: job.id },
        // Borrar el payload: puede llevar enlace/token, no debe quedar retenido.
        data: { status: "DONE", payload: Prisma.DbNull, lockedBy: null },
      });
      hechos += 1;
      registrar(job, "DONE", Date.now() - t0);
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
        registrar(job, "FAILED", Date.now() - t0);
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
      registrar(job, agotado ? "FAILED" : "REINTENTO", Date.now() - t0);
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

/**
 * Borrado POR LOTES (DELETE ... LIMIT) hasta drenar o hasta PURGA_MAX_TANDAS. Un unico DELETE
 * de millones de filas bloquea la tabla; en tandas pequenas no. Devuelve el total borrado y si
 * se drenó del todo (para avisar si un ciclo se quedó corto, sin tope silencioso).
 * `tabla` es una union CERRADA de literales internos (nunca entrada de usuario) -> `Prisma.raw`
 * es seguro aqui; la condicion `cond` lleva sus valores parametrizados.
 */
async function borrarPorLotes(
  db: PrismaClient,
  tabla: "Job" | "RateLimit",
  cond: Prisma.Sql,
  lote: number,
): Promise<{ total: number; drenado: boolean }> {
  const n = Math.floor(lote);
  const tablaRaw = Prisma.raw(`\`${tabla}\``);
  let total = 0;
  for (let i = 0; i < PURGA_MAX_TANDAS; i += 1) {
    const borradas = await db.$executeRaw(
      Prisma.sql`DELETE FROM ${tablaRaw} WHERE ${cond} LIMIT ${Prisma.raw(String(n))}`,
    );
    total += borradas;
    if (borradas < n) return { total, drenado: true };
  }
  return { total, drenado: false };
}

/**
 * Borra los jobs DONE con mas de `dias` (por lotes). OJO: acota SOLO los DONE. Los FAILED tienen
 * su propia poda (`podarFailed`, retencion larga) porque son señal de diagnostico: no se borran
 * con este plazo. (Antes este comentario decia "la tabla no crece sin fin", cierto solo de DONE.)
 */
export async function podarDone(
  db: PrismaClient,
  input: { now?: Date; dias: number },
): Promise<{ total: number; drenado: boolean }> {
  const limite = new Date((input.now ?? new Date()).getTime() - input.dias * 24 * 60 * 60_000);
  return borrarPorLotes(
    db,
    "Job",
    Prisma.sql`\`status\` = 'DONE' AND \`createdAt\` < ${limite}`,
    PURGA_LOTE,
  );
}

/**
 * Borra los jobs FAILED con mas de `dias` (por lotes). Retencion LARGA a proposito
 * (JOB_FAILED_RETENTION_DAYS = 90): un FAILED es la señal de que algo fue mal y se conserva para
 * diagnostico. NUNCA borrado silencioso antes de plazo.
 */
export async function podarFailed(
  db: PrismaClient,
  input: { now?: Date; dias: number },
): Promise<{ total: number; drenado: boolean }> {
  const limite = new Date((input.now ?? new Date()).getTime() - input.dias * 24 * 60 * 60_000);
  return borrarPorLotes(
    db,
    "Job",
    Prisma.sql`\`status\` = 'FAILED' AND \`createdAt\` < ${limite}`,
    PURGA_LOTE,
  );
}

/**
 * Purga las ventanas de RateLimit ya CERRADAS con holgura (windowStart < now - retenerMs), por
 * lotes. NUNCA toca la ventana en curso ni la inmediatamente anterior (retenerMs > la ventana
 * mas larga): una peticion en vuelo podria estar incrementandola, y borrarla RESETEARIA el
 * limite —dejaria de proteger—. Se apoya en `@@index([windowStart])`. Devuelve cuantas borro.
 */
export async function podarRateLimit(
  db: PrismaClient,
  input: { now?: Date; retenerMs: number },
): Promise<{ total: number; drenado: boolean }> {
  const limite = new Date((input.now ?? new Date()).getTime() - input.retenerMs);
  return borrarPorLotes(db, "RateLimit", Prisma.sql`\`windowStart\` < ${limite}`, PURGA_LOTE);
}

/** Numero de jobs en FAILED (para /api/health y el log de arranque del worker). */
export function contarFallidos(db: PrismaClient): Promise<number> {
  return db.job.count({ where: { status: "FAILED" } });
}

// ── Aviso al admin por acumulacion de FAILED, con histeresis durable ─────────────────────────
// (leerEstado/escribirEstado viven ahora en @/server/services/system-state, compartidos con la ruta.)

export interface AvisoResultado {
  fallidos: number;
  enviado: boolean;
}

/**
 * AVISO al admin por acumulacion de jobs FAILED, con HISTERESIS DURABLE:
 *  - Se avisa UNA vez al CRUZAR el umbral hacia arriba; NO se reavisa mientras siga por encima
 *    (con el correo caido serian cien correos identicos en una hora, y dejarias de mirarlos).
 *  - Cuando baja por debajo del umbral, se RE-ARMA (sin correo); volver a cruzar vuelve a avisar.
 *  - El estado ("armado"/"disparado") vive en SystemState (BD), asi SOBREVIVE a un reinicio del
 *    worker; sin eso, cada reinicio reavisaria.
 * El aviso viaja DIRECTO por el adaptador SMTP, NUNCA por la cola: si lo que falla es justamente
 * el envio de correos, encolarlo lo condenaria al mismo fallo -> silencio total cuando mas falta
 * hace. Si el envio directo falla (SMTP caido) NO se marca disparado: se reintenta el proximo
 * ciclo (no hay spam: ningun correo salio).
 */
export async function avisarSiFallidos(
  db: PrismaClient,
  adapter: EmailAdapter,
  input: { now?: Date; umbral: number; adminEmail?: string; log?: (m: string) => void },
): Promise<AvisoResultado> {
  const log = input.log ?? (() => {});
  const fallidos = await contarFallidos(db);
  const estado = (await leerEstado(db, CLAVE_AVISO_FAILED)) ?? AVISO_ARMADO;

  // Por DEBAJO del umbral: re-armar (sin correo) si estaba disparado.
  if (fallidos < input.umbral) {
    if (estado === AVISO_DISPARADO) await escribirEstado(db, CLAVE_AVISO_FAILED, AVISO_ARMADO);
    return { fallidos, enviado: false };
  }
  // En/por encima del umbral y YA disparado: silencio.
  if (estado === AVISO_DISPARADO) return { fallidos, enviado: false };

  // CRUCE del umbral: avisar una vez.
  const mensaje: EmailMessage = {
    to: input.adminEmail ?? "",
    subject: `[DareFlash] ${fallidos} trabajos en FAILED (umbral ${input.umbral})`,
    text: [
      `La cola tiene ${fallidos} trabajos en estado FAILED (umbral de aviso: ${input.umbral}).`,
      "",
      "Algo esta fallando de forma sostenida (correo, ledger u otro tipo). Revisa la cola.",
      "Este aviso NO se repite hasta que el contador baje del umbral y lo cruce de nuevo.",
    ].join("\n"),
  };

  if (!input.adminEmail) {
    // Sin destinatario: no se puede enviar. Se registra en cada ciclo por encima del umbral y NO
    // se marca DISPARADO. Motivo (correccion de Junior): no ha salido ningun correo, asi que no
    // hay spam que evitar; un log repetido es molesto, pero un silencio total es PELIGROSO (se
    // olvida ADMIN_EMAIL en el VPS y el sistema de avisos queda muerto y callado para siempre).
    // Ademas, al dejarlo ARMADO, en cuanto se configure ADMIN_EMAIL el aviso sale sin esperar a
    // que el contador baje y vuelva a cruzar. El aviso destacado de que falta la variable se da
    // AL ARRANCAR el worker (scripts/worker.ts).
    log(
      `[worker] AVISO (sin ADMIN_EMAIL, NO enviado): ${fallidos} jobs en FAILED (umbral ${input.umbral}).`,
    );
    return { fallidos, enviado: false };
  }

  try {
    await adapter.send(mensaje);
  } catch (e) {
    // Fallo el envio DIRECTO (SMTP caido). NO marcar disparado: reintentar el proximo ciclo.
    log(`[worker] AVISO no enviado (fallo el envio directo: ${sanearError(e)}); reintento luego.`);
    return { fallidos, enviado: false };
  }
  await escribirEstado(db, CLAVE_AVISO_FAILED, AVISO_DISPARADO);
  log(
    `[worker] AVISO enviado al admin (${input.adminEmail}): ${fallidos} jobs en FAILED (umbral ${input.umbral}).`,
  );
  return { fallidos, enviado: true };
}

export interface OpcionesBucle {
  workerToken: string;
  limit: number;
  intervaloMs: number;
  umbralReaperMs?: number;
  reaperCadaMs?: number;
  podaCadaMs?: number;
  doneRetenerDias?: number;
  /** Retencion de FAILED antes de purgarlos (dias). Por defecto JOB_FAILED_RETENTION_DAYS (90). */
  failedRetenerDias?: number;
  /** Holgura de RateLimit: se borran ventanas mas viejas que esto. Por defecto 2 h. */
  rateLimitRetenerMs?: number;
  /** Cada cuanto se comprueba el aviso de FAILED. Por defecto 60 s. */
  avisoCadaMs?: number;
  /** Umbral de FAILED para avisar al admin. Por defecto JOB_FAILED_ALERT_THRESHOLD (10). */
  alertaUmbral?: number;
  /** Adaptador de correo para el aviso DIRECTO (sin cola). Sin el, no se comprueba el aviso. */
  emailAdapter?: EmailAdapter;
  /** Destinatario del aviso. Sin el, el aviso se registra en el log en vez de enviarse. */
  adminEmail?: string;
  /** Log operativo (por trabajo y de las purgas/avisos). */
  log?: (m: string) => void;
  /** true -> dejar de reclamar y salir (SIGTERM). Se comprueba entre lotes Y entre trabajos. */
  parar: () => boolean;
  dormir: (ms: number) => Promise<void>;
  ahora?: () => Date;
  /**
   * Barrido de CONFIRMACION de subidas (sondeo a Bunny), en su propia cadencia adaptativa. Sin el,
   * no se confirma (p. ej. en tests que no lo ejercitan). Devuelve el resultado para la cadencia.
   */
  confirmar?: (now: Date) => Promise<ResultadoConfirm>;
  confirmActivoMs?: number;
  confirmReposoMs?: number;
  /**
   * Barrido de RECONCILIACION de subidas abandonadas (Parte A), en su propia cadencia BAJA (red de
   * seguridad, no latencia). Sin el, no se reconcilia (p. ej. en tests que no lo ejercitan).
   */
  reconciliar?: (now: Date) => Promise<ResultadoReconciliacion>;
  reconCadaMs?: number;
  /**
   * Barrido de LIMPIEZA de huerfanos en Bunny (reconciliacion Parte B, destructiva con salvaguardas),
   * cadencia BAJA propia. Sin el, no se limpia (p. ej. en tests que no lo ejercitan). Por defecto el
   * modo es dry-run (no borra) hasta que se configure RECON_HUERFANOS_MODO=borrar.
   */
  limpiarHuerfanos?: (now: Date) => Promise<ResultadoHuerfanos>;
  huerfanosCadaMs?: number;
  /**
   * Barrido de PUBLICADOS DESAPARECIDOS (reconciliacion Parte C, integridad de datos — NO destructivo:
   * degrada la fila a FAILED, no borra nada). Cadencia BAJA propia. Por defecto dry-run hasta que se
   * configure RECON_PUBLICADOS_MODO=actuar. Sin el, no se reconcilia (p. ej. en tests que no lo usan).
   */
  reconciliarPublicados?: (now: Date) => Promise<ResultadoPublicados>;
  publicadosCadaMs?: number;
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
  let ultimoAviso = 0;
  let proximoConfirm = 0;
  let proximoRecon = 0;
  let proximoHuerfanos = 0;
  let proximoPublicados = 0;
  // Ultima marca de wake HONRADA (event-kick). Comparacion por igualdad de STRING, NUNCA contra el
  // reloj: no depende de sincronia web/worker. En reinicio arranca null -> la primera marca existente
  // fuerza UN barrido (recoge PENDING previos).
  let ultimoWakeHonrado: string | null = null;

  while (!o.parar()) {
    const t = ahora();
    const { hechos, fallidos } = await procesarLote(db, registro, {
      workerToken: o.workerToken,
      limit: o.limit,
      now: t,
      parar: o.parar,
      log: o.log,
    });

    if (o.parar()) break;

    if (t.getTime() - ultimoReaper >= (o.reaperCadaMs ?? 60_000)) {
      await repasarColgados(db, registro, { now: t, umbralMs: o.umbralReaperMs });
      ultimoReaper = t.getTime();
    }
    // Las TRES purgas, juntas (misma cadencia que la poda de Job): la tabla no crece sin fin.
    if (t.getTime() - ultimaPoda >= (o.podaCadaMs ?? 24 * 60 * 60_000)) {
      const done = await podarDone(db, {
        now: t,
        dias: o.doneRetenerDias ?? JOB_DONE_RETENTION_DAYS,
      });
      const rateLimit = await podarRateLimit(db, {
        now: t,
        retenerMs: o.rateLimitRetenerMs ?? RATE_LIMIT_PURGE_RETENER_MS,
      });
      const sesiones = await purgeExpiredSessions(db, t);
      const failed = await podarFailed(db, {
        now: t,
        dias: o.failedRetenerDias ?? JOB_FAILED_RETENTION_DAYS,
      });
      o.log?.(
        `[worker] poda: DONE=${done.total} RateLimit=${rateLimit.total} ` +
          `Session=${sesiones.total} FAILED=${failed.total}`,
      );
      // No silencioso: si alguna purga alcanzo el tope de tandas (no drenó), se DICE en el log;
      // sigue en el proximo ciclo. (Antes `drenado` se calculaba y se tiraba: comentario que
      // prometia lo que el codigo no hacia.)
      for (const [nombre, r] of [
        ["DONE", done],
        ["RateLimit", rateLimit],
        ["Session", sesiones],
        ["FAILED", failed],
      ] as const) {
        if (!r.drenado) {
          o.log?.(
            `[worker] poda: ${nombre} NO drenó (tope de tandas alcanzado); sigue en el proximo ciclo.`,
          );
        }
      }
      ultimaPoda = t.getTime();
    }
    // Aviso al admin por acumulacion de FAILED (directo, fuera de la cola). Cadencia propia,
    // mas frecuente que la poda: un pico de FAILED debe avisar pronto, no dentro de 24 h.
    if (o.emailAdapter && t.getTime() - ultimoAviso >= (o.avisoCadaMs ?? 60_000)) {
      await avisarSiFallidos(db, o.emailAdapter, {
        now: t,
        umbral: o.alertaUmbral ?? JOB_FAILED_ALERT_THRESHOLD,
        adminEmail: o.adminEmail,
        log: o.log,
      });
      ultimoAviso = t.getTime();
    }

    // Barrido de CONFIRMACION de subidas (sondeo a Bunny). Cadencia ADAPTATIVA propia; try/catch
    // propio para que un fallo de la API de Bunny NO rompa el bucle (como las purgas/aviso). El
    // reloj `t` es inyectable (tests).
    // El barrido dispara por el reloj adaptativo O por una marca de wake NUEVA (event-kick escrito por
    // upload-credential): la marca fuerza el barrido saltandose el reposo. Solo se lee la marca si el
    // confirm esta cableado (hay tests que no lo ejercitan).
    if (o.confirmar) {
      const wakeActual = await leerEstado(db, CONFIRM_WAKE_KEY);
      const kicked = wakeActual !== null && wakeActual !== ultimoWakeHonrado;
      if (t.getTime() >= proximoConfirm || kicked) {
        const activo = o.confirmActivoMs ?? CONFIRM_CADENCIA_ACTIVO_MS;
        const reposo = o.confirmReposoMs ?? CONFIRM_CADENCIA_REPOSO_MS;
        try {
          const r = await o.confirmar(t);
          o.log?.(
            `[worker] confirm: revisados=${r.revisados} publicados=${r.publicados} ` +
              `fallidos=${r.fallidos} pendientes=${r.pendientes}`,
          );
          proximoConfirm = t.getTime() + cadenciaConfirmMs(r.revisados > 0, activo, reposo);
        } catch (e) {
          o.log?.(`[worker] confirm: barrido fallo (${sanearError(e)}); reintento en reposo.`);
          proximoConfirm = t.getTime() + reposo;
        }
        // Marca honrada TRAS el barrido: la MISMA marca no vuelve a disparar; solo una nueva lo hara.
        ultimoWakeHonrado = wakeActual;
      }
    }

    // Barrido de RECONCILIACION de subidas abandonadas (Parte A). Cadencia BAJA y FIJA (red de
    // seguridad); try/catch propio para que un fallo de Bunny NO rompa el bucle (como el confirm).
    if (o.reconciliar && t.getTime() >= proximoRecon) {
      const cada = o.reconCadaMs ?? RECON_CADENCIA_MS;
      try {
        const r = await o.reconciliar(t);
        o.log?.(
          `[worker] reconcile: revisados=${r.revisados} rescatados=${r.rescatados} ` +
            `incompletos=${r.incompletos} fallidos=${r.fallidos} pendientes=${r.pendientes}`,
        );
      } catch (e) {
        o.log?.(`[worker] reconcile: barrido fallo (${sanearError(e)}); reintento luego.`);
      }
      proximoRecon = t.getTime() + cada;
    }

    // Limpieza de HUERFANOS en Bunny (Parte B). Cadencia MUY BAJA (listar la biblioteca es pesado);
    // try/catch propio (un fallo de Bunny no rompe el bucle). Por defecto en dry-run (no borra).
    if (o.limpiarHuerfanos && t.getTime() >= proximoHuerfanos) {
      const cada = o.huerfanosCadaMs ?? RECON_HUERFANOS_CADENCIA_MS;
      try {
        const r = await o.limpiarHuerfanos(t);
        o.log?.(
          `[worker] huerfanos (${r.modo}): revisados=${r.revisados} candidatos=${r.candidatos} ` +
            `borrados=${r.borrados} conservados=${r.conservados}`,
        );
      } catch (e) {
        o.log?.(`[worker] huerfanos: barrido fallo (${sanearError(e)}); reintento luego.`);
      }
      proximoHuerfanos = t.getTime() + cada;
    }

    // PUBLICADOS DESAPARECIDOS en Bunny (Parte C). Cadencia BAJA (una getVideo por PUBLISHED); try/catch
    // propio; por defecto dry-run (no muta). El resumen muestra SIEMPRE el modo y si el tope abortо.
    if (o.reconciliarPublicados && t.getTime() >= proximoPublicados) {
      const cada = o.publicadosCadaMs ?? RECON_PUBLICADOS_CADENCIA_MS;
      try {
        const r = await o.reconciliarPublicados(t);
        o.log?.(
          `[worker] publicados (${r.modo}${r.abortadoPorTope ? ", ABORTADO por tope" : ""}): ` +
            `publicados=${r.publicados} revisados=${r.revisados} candidatos=${r.candidatos} ` +
            `degradados=${r.degradados} reintentos=${r.reintentos}`,
        );
      } catch (e) {
        o.log?.(`[worker] publicados: barrido fallo (${sanearError(e)}); reintento luego.`);
      }
      proximoPublicados = t.getTime() + cada;
    }

    if (o.parar()) break;
    if (hechos + fallidos === 0) await o.dormir(o.intervaloMs); // nada que hacer -> esperar
  }
}
