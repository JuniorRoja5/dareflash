import type { EstadoRetoSolicitud } from "@/config/constants";

/**
 * La palabra del estado de una propuesta, en el PANEL (el portal tiene la suya, que sabe si ya está
 * publicada). La leen la cola y la ficha: una sola lista.
 */
export const ETIQUETA_SOLICITUD_PANEL: Record<EstadoRetoSolicitud, string> = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CADUCADA: "Caducada",
};
