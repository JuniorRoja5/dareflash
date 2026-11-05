import type { EstadoRetoSolicitud, EstadoVisibleSolicitud } from "@/config/constants";

/**
 * QUÉ LE DECIMOS A LA EMPRESA DE SU PROPUESTA (Fase 9 · P3). Pura, para atarla con tests. Es el ÚNICO
 * sitio donde se decide el estado que se enseña: ni el portal ni el panel deducen nada por su cuenta.
 *
 * La propuesta tiene cuatro estados guardados (PENDIENTE, APROBADA, RECHAZADA, CADUCADA), pero no
 * bastan para lo que la empresa quiere saber:
 *  - "aprobada" no dice si la gente ya puede participar: eso lo decide el RETO que nació al aprobarla
 *    (borrador hasta que llega el pago y se publica). Se calcula con su `status`.
 *  - una PENDIENTE cuyo cierre ya pasó NO está "en revisión": ya no se puede aprobar. Es CADUCADA
 *    desde ese instante, aunque el barrido horario todavía no lo haya escrito en la columna. Si se
 *    esperara al barrido, durante una hora la pantalla diría algo que ya no es verdad.
 */
export function estadoVisibleSolicitud(
  estado: EstadoRetoSolicitud,
  /** `Challenge.status` del reto que nació de ella, o `null` si aún no hay reto. */
  estadoReto: string | null,
  /** El cierre que propuso la empresa. */
  cierre: Date,
  ahora: Date,
): EstadoVisibleSolicitud {
  if (estado === "RECHAZADA") return "RECHAZADA";
  if (estado === "CADUCADA") return "CADUCADA";
  if (estado === "PENDIENTE") return estaCaducada(cierre, ahora) ? "CADUCADA" : "EN_REVISION";
  // Aprobada: publicada si su reto ya salió (abierto o ya cerrado), aprobada mientras es borrador.
  return estadoReto === "PUBLISHED" || estadoReto === "CLOSED" ? "PUBLICADA" : "APROBADA";
}

/**
 * ¿Ha caducado una propuesta pendiente? El cierre ya pasó (o es ahora mismo). La MISMA regla que
 * usan el filtro de la cola del panel y la aprobación (que no reclama una propuesta vencida): una
 * definición, para que el portal, el contador y el botón de aprobar no puedan discrepar.
 */
export function estaCaducada(cierre: Date, ahora: Date): boolean {
  return cierre.getTime() <= ahora.getTime();
}
