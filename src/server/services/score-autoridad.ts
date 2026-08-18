/**
 * SCORE DE AUTORIDAD — punto ÚNICO de cálculo del ranking de búsqueda (columna `scoreAutoridad` de
 * User y Challenge). La búsqueda NO calcula nada al vuelo: LEE la columna, que el WORKER recalcula en
 * barridos de baja cadencia con estas funciones. Son PURAS (sin BD ni reloj implícito: el `now` entra
 * por parámetro) -> deterministas y testeables.
 *
 * PUNTO ÚNICO DE ENRIQUECIMIENTO (futuro-proof): la BÚSQUEDA se escribe una vez y no se reescribe; lo
 * único que evoluciona por fase es CÓMO se calcula el score, y vive AQUÍ:
 *   - HOY (Fase 1): solo señales EXISTENTES. Usuario = nº de vídeos publicados + recencia de actividad.
 *     Reto = premio + proximidad del deadline + activo por encima de cerrado.
 *   - Fase 3: sumar VOTOS. Fase 4: nivel/puntos/likes. Se añaden aquí, sin tocar la búsqueda.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

// --- Usuario -----------------------------------------------------------------
const PESO_VIDEO_USUARIO = 10; // cada vídeo publicado pesa esto en el score

/** Bonus por RECENCIA de la última actividad: más reciente -> más autoridad. Escalones (deterministas). */
function bonusRecencia(msDesdeUltima: number): number {
  if (msDesdeUltima < 7 * DIA_MS) return 20;
  if (msDesdeUltima < 30 * DIA_MS) return 10;
  if (msDesdeUltima < 90 * DIA_MS) return 5;
  return 0;
}

export interface SenalesUsuario {
  /** Nº de vídeos PUBLISHED del usuario. */
  videosPublicados: number;
  /** Última actividad relevante (hoy: el vídeo publicado más reciente; null si no tiene). */
  ultimaActividad: Date | null;
  /** Ahora (UTC), inyectado para que la función sea determinista. */
  now: Date;
}

/** Score de autoridad de un USUARIO a partir de sus señales. Pura y determinista. */
export function calcularScoreAutoridadUsuario(s: SenalesUsuario): number {
  const base = s.videosPublicados * PESO_VIDEO_USUARIO;
  const recencia = s.ultimaActividad
    ? bonusRecencia(s.now.getTime() - s.ultimaActividad.getTime())
    : 0;
  return base + recencia;
}

// --- Reto --------------------------------------------------------------------
const TOPE_PREMIO_SCORE = 1000; // el premio (en unidades monetarias) se capa: no debe dominar solo
const BONUS_RETO_ACTIVO = 2000; // un reto ACTIVO (vigente) SIEMPRE por encima de uno cerrado

/** Bonus por PROXIMIDAD del deadline (solo activos): cuanto más cerca del cierre, más relevante. */
function bonusProximidad(msHastaDeadline: number): number {
  if (msHastaDeadline < 1 * DIA_MS) return 100;
  if (msHastaDeadline < 7 * DIA_MS) return 50;
  if (msHastaDeadline < 30 * DIA_MS) return 20;
  return 5;
}

export interface SenalesReto {
  /** Premio en CÉNTIMOS (entero, como en la BD). */
  premioCentimos: number;
  /** Cierre del reto (UTC). */
  deadline: Date;
  /** Estado (union de constants): "PUBLISHED" vigente vs "CLOSED"/otros. */
  status: string;
  /** Ahora (UTC), inyectado. */
  now: Date;
}

/** Score de autoridad de un RETO a partir de sus señales. Pura y determinista. */
export function calcularScoreAutoridadReto(s: SenalesReto): number {
  const activo = s.status === "PUBLISHED" && s.deadline.getTime() > s.now.getTime();
  const premio = Math.min(Math.floor(s.premioCentimos / 100), TOPE_PREMIO_SCORE);
  const estado = activo ? BONUS_RETO_ACTIVO : 0;
  const proximidad = activo ? bonusProximidad(s.deadline.getTime() - s.now.getTime()) : 0;
  return premio + estado + proximidad;
}
