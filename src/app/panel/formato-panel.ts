/**
 * EL FORMATO DEL PANEL (Fase 11 · P1): el admin trabaja EN UTC, y el panel LO DICE.
 *
 * El panel compara cosas de todo el mundo (un cierre, un pago, una denuncia), y para compararlas hacen
 * falta en UNA zona: UTC. Por eso aquí la zona no es la de quien mira, y por eso toda hora que se pinta
 * lleva « UTC» detrás —puesto AQUÍ, una vez, y no a mano en cada pantalla, que es como quedaban unas
 * con la marca y otras sin ella—. Una fecha sin hora no la lleva: un día no tiene zona que leer.
 *
 * El idioma del panel es el castellano, con nombre propio (`IDIOMA_PANEL`), no un «es» suelto: el día
 * que el panel hable otro, se cambia aquí. Solo lo usa `src/app/panel/**` (lo vigila el censo).
 */
import {
  estiloLlevaHora,
  formatearFecha,
  formatearNumero,
  type EstiloFecha,
  type Idioma,
  IDIOMA_DEL_EQUIPO,
  ZONA_UTC,
} from "@/lib/formato";

export const IDIOMA_PANEL: Idioma = IDIOMA_DEL_EQUIPO;

/** Un instante en el panel: en UTC, y si lleva hora, con « UTC» detrás. */
export function fechaPanel(instante: Date | number | string, estilo: EstiloFecha): string {
  const texto = formatearFecha(instante, IDIOMA_PANEL, ZONA_UTC, estilo);
  return estiloLlevaHora(estilo) ? `${texto} UTC` : texto;
}

/** Un número corriente en el panel. */
export function numeroPanel(n: number): string {
  return formatearNumero(n, IDIOMA_PANEL);
}
