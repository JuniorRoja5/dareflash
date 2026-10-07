/**
 * EL MOTIVO DE UN MOVIMIENTO DE BOOSTS, EN CASTELLANO Y EN VOZ DEL DUEÑO (puro).
 *
 * UN JUEGO DE COPY Y NO DOS, al revés que en los puntos: el historial de boosts solo lo mira su
 * dueño. El panel tiene el inspector de PUNTOS porque ahí se ajustan a mano con una nota; los boosts
 * no se inspeccionan desde ninguna pantalla todavía. El día que haya un inspector, se añade la voz
 * en tercera persona aquí —como en `razones-puntos`— y no una copia en el componente del panel.
 *
 * EL AJUSTE DEL EQUIPO SE DICE POR SU SIGNO, igual que en los puntos y por el mismo motivo: un
 * ajuste puede sumar o restar, y el dueño no tiene por qué deducir qué le ha pasado del número de al
 * lado. Y NO DICE POR QUÉ: el porqué de un ajuste es traza interna del equipo; si algún día hay que
 * explicárselo, será un campo nuevo escrito para él, no esta línea girada.
 *
 * UNA RAZÓN SIN COPY SE ENSEÑA TAL CUAL. Feo a propósito: un código raro a la vista se arregla, una
 * etiqueta inventada ("Bonus") se queda para siempre diciendo algo que no es. El test exige que toda
 * razón de `BoostReasonSchema` tenga la suya, así que solo pasa con una razón nueva sin declarar.
 */
import { RAZON_BOOST_COMPRA } from "@/config/constants";

/** Razón del ledger -> copy en segunda persona. Las claves son las de `BoostReasonSchema`. */
const EN_SEGUNDA: Record<string, string> = {
  [RAZON_BOOST_COMPRA]: "Compraste Boosts",
  VIP_WEEKLY: "Boost de tu VIP semanal",
  // La activación es el único movimiento NEGATIVO del uso normal: gastar un boost en destacar.
  ACTIVATION: "Destacaste tu perfil",
  REFUND: "Devolución de una compra",
  ADMIN_ADJUST: "Ajuste del equipo",
};

/** Clave del ajuste manual de boosts. Vive aquí porque es la única que no escribe el producto. */
export const RAZON_BOOST_AJUSTE = "ADMIN_ADJUST";

const AJUSTE_POR_SIGNO = {
  suma: "El equipo te añadió Boosts",
  resta: "El equipo te retiró Boosts",
} as const;

/**
 * Motivo dirigido al dueño de la cuenta.
 *
 * `delta` es OPCIONAL y solo lo usa el ajuste, que es el único motivo que va en las dos direcciones.
 * Sin él se cae al texto neutro, que sigue siendo cierto — solo menos útil.
 */
export function razonBoostPropia(razon: string, delta?: number): string {
  if (razon === RAZON_BOOST_AJUSTE && typeof delta === "number" && delta !== 0) {
    return delta > 0 ? AJUSTE_POR_SIGNO.suma : AJUSTE_POR_SIGNO.resta;
  }
  return EN_SEGUNDA[razon] ?? razon;
}
