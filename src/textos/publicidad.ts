/**
 * LAS FRASES DE LA PUBLICIDAD DEL PORTAL QUE SE CONSTRUYEN CON CIFRAS, en el idioma de la página (Fase
 * 11 · P5b2b). Las cifras y la hora salen de `lib/` (`inicioLocalDelDia`, la tabla de capitales); las
 * palabras, del espacio `campanaComun`. Puras: reciben la `t` del espacio, así que valen en el servidor y
 * en el formulario (cliente).
 */
import type { AlcancePublicidad, EstadoVisiblePublicidad } from "@/config/constants";
import { formatearNumero, type Idioma } from "@/lib/formato";
import { nombrePais } from "@/lib/paises";
import type { NombreDeZona, ZonaCampana } from "@/lib/publicidad";
import { esUnoDe } from "@/lib/valores";
import { inicioLocalDelDia, PAISES_CON_VARIAS_ZONAS } from "@/lib/zona-horaria-pais";

import type { FuncionT } from "./plantilla";
import type { Textos } from "./servidor";

type TComun = FuncionT<Textos["campanaComun"]>;

/**
 * EL SALDO EN HUMANO, con lo que ya está comprometido. Una sola frase para todo el portal (lista,
 * formulario, ficha): si cada pantalla lo dijera a su manera, una diría «tienes 90» y otra «te quedan 30»
 * sobre el mismo dinero, y las dos serían verdad a medias. Las cifras, por el formateador (P1; aprobado
 * por Junior el 26 nov): «12.485» en español.
 */
export function fraseSaldo(
  t: TComun,
  idioma: Idioma,
  saldo: number,
  comprometido: number,
  /** «otras» en la ficha y el formulario (se habla de UNA campaña); «todas» en la lista. */
  cuales: "otras" | "todas" = "otras",
): string {
  const palabra = t("creditosPalabra", { n: saldo });
  const cifra = (n: number) => formatearNumero(n, idioma);
  if (comprometido <= 0) return t("saldoSolo", { saldo: cifra(saldo), palabra });
  return t("saldoComprometido", {
    saldo: cifra(saldo),
    palabra,
    comprometido: cifra(comprometido),
    donde: t(`donde_${cuales}`),
    quedan: cifra(Math.max(0, saldo - comprometido)),
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
  const iso = paisIso.trim().toUpperCase();
  if (esUnoDe(PAISES_CON_VARIAS_ZONAS, iso)) {
    const capital = t(`capital_${iso}`);
    return t(inicio.diaAnterior ? "inicioCapitalVispera" : "inicioCapital", { cuando, capital });
  }
  return t(inicio.diaAnterior ? "inicioLocalVispera" : "inicioLocal", { cuando });
}

export const alcanceCampana = (t: TComun, a: AlcancePublicidad) => t(`alcance_${a}`);
export const estadoCampana = (t: FuncionT<Textos["publicidad"]>, e: EstadoVisiblePublicidad) =>
  t(`estado_${e}`);

/**
 * La zona de una campaña dicha en el idioma de `t` (P5b3). La usan el portal y, en castellano, el panel
 * (`zonaLegible`): una sola redacción. Los países, unidos con «, » como siempre.
 */
export function textoZonaCampana(
  t: FuncionT<Textos["campanaComun"]>,
  z: ZonaCampana,
  idioma: Idioma,
): string {
  switch (z.alcance) {
    case "CIUDAD":
      return t("zonaCiudad", { ciudad: z.ciudad ?? t("zonaCiudadSinNombre") });
    case "ESTADO":
      return t("zonaRegion", { region: z.region });
    case "PAIS":
      return z.paises.map((p) => nombrePais(p, idioma)).join(", ");
    case "GLOBAL":
      return t("zonaGlobal");
  }
}

/** El nombre de una zona DENTRO de una frase de la estimación (P5b3). */
export function nombreDeZona(
  t: FuncionT<Textos["campanaComun"]>,
  n: NombreDeZona,
  idioma: Idioma,
): string {
  switch (n.tipo) {
    case "nombre":
      return n.nombre;
    case "paises":
      return n.paises.map((p) => nombrePais(p, idioma)).join(", ");
    case "esta":
      return t("zonaEsta");
    case "global":
      return t("zonaGlobalEnFrase");
  }
}
