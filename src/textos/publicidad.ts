/**
 * LAS FRASES DE LA PUBLICIDAD DEL PORTAL QUE SE CONSTRUYEN CON CIFRAS, en el idioma de la página (Fase
 * 11 · P5b2b). Las cifras y la hora salen de `lib/` (`inicioLocalDelDia`, la tabla de capitales); las
 * palabras, del espacio `campanaComun`. Puras: reciben la `t` del espacio, así que valen en el servidor y
 * en el formulario (cliente).
 */
import type { AlcancePublicidad, EstadoVisiblePublicidad } from "@/config/constants";
import { CAPITAL_DE_PAIS_CON_VARIAS_ZONAS, inicioLocalDelDia } from "@/lib/zona-horaria-pais";

import type { FuncionT } from "./plantilla";
import type { Textos } from "./servidor";

type TComun = FuncionT<Textos["campanaComun"]>;

/**
 * EL SALDO EN HUMANO, con lo que ya está comprometido. Una sola frase para todo el portal (lista,
 * formulario, ficha): si cada pantalla lo dijera a su manera, una diría «tienes 90» y otra «te quedan 30»
 * sobre el mismo dinero, y las dos serían verdad a medias. Las cifras, tal cual (como antes de la P5b2b).
 */
export function fraseSaldo(
  t: TComun,
  saldo: number,
  comprometido: number,
  /** «otras» en la ficha y el formulario (se habla de UNA campaña); «todas» en la lista. */
  cuales: "otras" | "todas" = "otras",
): string {
  const palabra = t("creditosPalabra", { n: saldo });
  if (comprometido <= 0) return t("saldoSolo", { saldo: String(saldo), palabra });
  return t("saldoComprometido", {
    saldo: String(saldo),
    palabra,
    comprometido: String(comprometido),
    donde: t(`donde_${cuales}`),
    quedan: String(Math.max(0, saldo - comprometido)),
  });
}

/**
 * A QUÉ HORA DE SU PAÍS EMPIEZA CADA DÍA DE CAMPAÑA, o `null` si no se sabe la zona (mejor no decir nada
 * que decir una hora inventada). Si cae en la víspera, se dice («del día anterior»): «empieza a las
 * 19:00» a secas se leería como las 19:00 del mismo día, y el anuncio ya llevaría cinco horas fuera. En
 * un país con varias zonas, la de su capital, nombrándola.
 */
export function fraseInicioDelDia(t: TComun, paisIso: string, dia: Date): string | null {
  const inicio = inicioLocalDelDia(paisIso, dia);
  if (!inicio) return null;
  // «a la 1:00» / «a las 19:00»: la forma la elige la HORA, con las reglas de plural del idioma (P1).
  const cuando = t("aLaHora", { n: Number.parseInt(inicio.hora, 10), hora: inicio.hora });
  const capital = CAPITAL_DE_PAIS_CON_VARIAS_ZONAS[paisIso.trim().toUpperCase()];
  if (capital) {
    return t(inicio.diaAnterior ? "inicioCapitalVispera" : "inicioCapital", { cuando, capital });
  }
  return t(inicio.diaAnterior ? "inicioLocalVispera" : "inicioLocal", { cuando });
}

export const alcanceCampana = (t: TComun, a: AlcancePublicidad) => t(`alcance_${a}`);
export const estadoCampana = (t: FuncionT<Textos["publicidad"]>, e: EstadoVisiblePublicidad) =>
  t(`estado_${e}`);
