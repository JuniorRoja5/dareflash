import type { EstadoRetoSolicitud, EstadoVisibleSolicitud } from "@/config/constants";

/**
 * QUÉ LE DECIMOS A LA EMPRESA DE SU PROPUESTA (Fase 9 · P3). Pura, para atarla con tests.
 *
 * La propuesta tiene tres estados (PENDIENTE, APROBADA, RECHAZADA), pero "aprobada" no le dice a la
 * empresa lo que quiere saber —si la gente ya puede participar—: eso lo decide el RETO que nació al
 * aprobarla, que empieza en borrador y lo publica el equipo. Por eso el estado visible se CALCULA
 * con los dos datos, en vez de guardar un cuarto estado que habría que mantener al publicar (y que
 * se quedaría en "aprobada" el día que alguien publique por otro camino).
 */
export function estadoVisibleSolicitud(
  estado: EstadoRetoSolicitud,
  /** `Challenge.status` del reto que nació de ella, o `null` si aún no hay reto. */
  estadoReto: string | null,
): EstadoVisibleSolicitud {
  if (estado === "PENDIENTE") return "EN_REVISION";
  if (estado === "RECHAZADA") return "RECHAZADA";
  // Aprobada: publicada si su reto ya salió (abierto o ya cerrado), aprobada mientras es borrador.
  return estadoReto === "PUBLISHED" || estadoReto === "CLOSED" ? "PUBLICADA" : "APROBADA";
}
