/**
 * USUARIO DEMO — FUENTE UNICA del usuario de la maqueta (`usuario_demo`), consumida por /ranking Y
 * /perfil para que sus cifras cuadren en todas las pantallas (misma persona, mismos puntos, mismo
 * nivel). El NIVEL no se guarda: se DERIVA con `nivelPorPuntos` (dominio) alla donde haga falta, para
 * que no pueda desincronizarse. Es maqueta (sin backend); anticipa el usuario real de Fase 4.
 *
 * Persona: jugador de MEDIA TABLA (puesto 9 de 15 en el ranking mensual) -> Challenger.
 */
export const USUARIO_DEMO = {
  username: "usuario_demo",
  /** Puntos GLOBALES (acumulados): mueven el nivel y son los que muestra la vista Mensual. */
  puntos: 320,
  retosGanados: 12,
  videos: 34,
} as const;
