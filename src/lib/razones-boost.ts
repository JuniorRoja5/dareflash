/**
 * EL MOTIVO DE UN MOVIMIENTO DE BOOSTS, EN VOZ DEL DUEÑO (puro).
 *
 * UN JUEGO DE COPY Y NO DOS, al revés que en los puntos: el historial de boosts solo lo mira su
 * dueño. El panel tiene el inspector de PUNTOS porque ahí se ajustan a mano con una nota; los boosts
 * no se inspeccionan desde ninguna pantalla todavía. El día que haya un inspector, se añade la voz
 * en tercera persona —como en `razones-puntos`— y no una copia en el componente del panel.
 *
 * LAS PALABRAS viven en el diccionario desde la P5b2a (`razonesBoost.propia_*`, las pone `razonBoost`
 * en src/textos/razones-boost.ts): aquí queda la DECISIÓN de qué frase toca, que es lo que se prueba.
 *
 * EL AJUSTE DEL EQUIPO SE DICE POR SU SIGNO, igual que en los puntos y por el mismo motivo: un
 * ajuste puede sumar o restar, y el dueño no tiene por qué deducir qué le ha pasado del número de al
 * lado. Y NO DICE POR QUÉ: el porqué de un ajuste es traza interna del equipo; si algún día hay que
 * explicárselo, será un campo nuevo escrito para él, no esta línea girada. Sin importe, la frase neutra.
 *
 * UNA RAZÓN SIN COPY SE ENSEÑA TAL CUAL (`null` aquí). Feo a propósito: un código raro a la vista se
 * arregla, una etiqueta inventada ("Bonus") se queda para siempre diciendo algo que no es. El test exige
 * que toda razón de `BoostReasonSchema` tenga la suya, así que solo pasa con una razón nueva sin declarar.
 */
import { RAZON_BOOST_COMPRA } from "@/config/constants";

/** Clave del ajuste manual de boosts. Vive aquí porque es la única que no escribe el producto. */
export const RAZON_BOOST_AJUSTE = "ADMIN_ADJUST";

/** Qué frase del diccionario toca (`razonesBoost.propia_<clave>`). */
export type ClaveRazonBoost =
  | "PURCHASE"
  | "VIP_WEEKLY"
  | "ACTIVATION"
  | "REFUND"
  | "ADMIN_ADJUST"
  | "ajusteSuma"
  | "ajusteResta";

/** Las razones con frase. Las claves son las de `BoostReasonSchema`. */
const CONOCIDAS = new Set<string>([
  RAZON_BOOST_COMPRA,
  "VIP_WEEKLY",
  // La activación es el único movimiento NEGATIVO del uso normal: gastar un boost en destacar.
  "ACTIVATION",
  "REFUND",
  RAZON_BOOST_AJUSTE,
]);

/**
 * `delta` es OPCIONAL y solo lo usa el ajuste, que es el único motivo que va en las dos direcciones.
 * Sin él se cae a la frase neutra, que sigue siendo cierta — solo menos útil.
 */
export function claveRazonBoost(razon: string, delta?: number): ClaveRazonBoost | null {
  if (razon === RAZON_BOOST_AJUSTE && typeof delta === "number" && delta !== 0) {
    return delta > 0 ? "ajusteSuma" : "ajusteResta";
  }
  return CONOCIDAS.has(razon) ? (razon as ClaveRazonBoost) : null;
}
