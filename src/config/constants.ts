/**
 * Constantes centralizadas de configuracion de producto/infraestructura.
 *
 * Las reglas de producto que aun no ha cerrado el propietario van aqui con un
 * comentario `// PENDIENTE`, nunca esparcidas por el codigo.
 */
import { z } from "zod";

/**
 * Limite de conexiones del pool contra MariaDB. Bajo y explicito: el plan
 * compartido de Hostinger limita las conexiones simultaneas.
 * PENDIENTE: confirmar el limite real del plan de Hostinger. 5 es provisional.
 */
export const DB_CONNECTION_LIMIT = 5;

/**
 * Moneda por defecto de la app. Toda la documentacion de producto esta en dolares
 * (premios "$20", VIP "$10/mes", Boost "$5"). NO se incrusta como default en el
 * esquema: la app la aplica desde aqui al crear filas con `currency`.
 * PENDIENTE: decision final del propietario (Sergio).
 */
export const DEFAULT_CURRENCY = "USD"; // PENDIENTE

/**
 * Zona horaria de TODOS los limites temporales del producto. Decidido
 * EXPLICITAMENTE: **UTC**, como el resto del sistema. Afecta al "dia" del limite
 * de boosts y al "mes" del reinicio del ranking. Fijarlo aqui evita que cada
 * implementador elija distinto y aparezcan discrepancias en los bordes del dia/mes.
 * El corte del dia es 00:00 UTC; el del mes, el dia 1 a las 00:00 UTC.
 */
export const RESET_TIMEZONE = "UTC";

/**
 * Maximo de activaciones de Boost por usuario y DIA (UTC, ver RESET_TIMEZONE).
 * Fuente: documentacion de producto ("3 apariciones destacadas por usuario al dia").
 */
export const BOOST_DAILY_LIMIT = 3;

// ============================================================================
// ESTADOS/TIPOS que en la BD son String (flexibles, sin migracion por estado
// nuevo) pero tipados y validados con Zod aqui. La capa de servicio valida con
// estos esquemas ANTES de insertar, para que un valor mal escrito (p.ej.
// "PENDNIG" en WalletLedger.status = dinero en un estado inexistente) no entre
// nunca en la base de datos.
// ============================================================================

/** Estado de los movimientos de monedero (dinero). */
export const WalletStatusSchema = z.enum(["PENDING", "APPROVED", "PAID", "REJECTED", "COMPLETED"]);
export type WalletStatus = z.infer<typeof WalletStatusSchema>;

/** Tipo de movimiento de monedero. */
export const WalletEntryTypeSchema = z.enum(["CREDIT", "DEBIT"]);
export type WalletEntryType = z.infer<typeof WalletEntryTypeSchema>;

/** Ciclo de vida de un reto. */
export const ChallengeStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CLOSED"]);
export type ChallengeStatus = z.infer<typeof ChallengeStatusSchema>;

/** Razon de un movimiento de creditos de Boost. */
export const BoostReasonSchema = z.enum([
  "PURCHASE",
  "VIP_WEEKLY",
  "ACTIVATION",
  "REFUND",
  "ADMIN_ADJUST",
]);
export type BoostReason = z.infer<typeof BoostReasonSchema>;

/** Estado de una denuncia. */
export const ReportStatusSchema = z.enum(["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

/** Tipo de entidad denunciada. COMMENT llega con los comentarios (Fase 1). */
export const ReportTargetTypeSchema = z.enum(["VIDEO", "SUBMISSION", "USER", "COMMENT"]);
export type ReportTargetType = z.infer<typeof ReportTargetTypeSchema>;

/** Estado de un job de la cola. */
export const JobStatusSchema = z.enum(["PENDING", "RUNNING", "DONE", "FAILED"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** Tipos de job previstos. */
export const JobTypeSchema = z.enum([
  "BOOST_EXPIRY",
  "CHALLENGE_CLOSE",
  "RANKING_RESET",
  "SEND_EMAIL",
  "LEDGER_RECONCILE",
  "RETENTION_PURGE",
  "PAYOUT_PROCESS",
]);
export type JobType = z.infer<typeof JobTypeSchema>;
