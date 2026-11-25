"use client";

import { useTextos } from "@/components/textos-provider";

/*
 * Una HOJA DE CLIENTE (Fase 11 · P5b2a): la marca sale junto a cualquier nombre, en componentes de
 * servidor y de cliente, y su texto («VIP Mythic») viene del diccionario. Como hoja de cliente lo lee
 * del proveedor (`marcas`, en el armazón y en el panel) sin que cada uno de los sitios que pintan un
 * nombre tenga que pasárselo. Se reexporta desde `identidad-usuario`, que es por donde se importa.
 */

/**
 * LA MARCA MYTHIC: las letras "VIP" en una píldora dorada. UNA pieza para los tres tamaños.
 *
 * ┌─ POR QUÉ LETRAS Y NO UNA FIGURA ────────────────────────────────────────────────────────────┐
 * │ Antes era una estrella con una gema dentro. Una figura a 14 px tiene que pelear por decir    │
 * │ QUÉ es —y la primera versión de la gema se leía como un punto—, mientras que tres letras se  │
 * │ leen o no se leen, sin ambigüedad. A los tamaños a los que esto vive (14 px junto a un        │
 * │ nombre, 18 px en la esquina de un avatar) eso lo decide todo.                                 │
 * │                                                                                               │
 * │ Y de paso desaparece el problema que arrastraba la figura: nada de `<linearGradient>` con su  │
 * │ `id` repetido veinte veces en un feed, ni paths que había que mantener en dos sitios.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ PÍLDORA DORADA CON TINTA OSCURA, NO LETRAS DORADAS SUELTAS ────────────────────────────────┐
 * │ Es lo que trae la maqueta y además es lo que se lee. Unas letras doradas finas sobre el      │
 * │ fondo claro del tema claro se quedan en 4,69:1 en el mejor caso y desaparecen a 14 px; la     │
 * │ píldora sólida siempre contrasta con su fondo (12,8:1 en oscuro, 4,7:1 en claro) y el texto   │
 * │ contrasta con la píldora.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LA TINTA CAMBIA CON EL TEMA, Y ESO NO ES UN CAPRICHO ──────────────────────────────────────┐
 * │ En oscuro el oro es VIVO y la tinta tiene que ser oscura: 12,89:1. En claro el oro va        │
 * │ APAGADO —bajado para leerse sobre blanco— y esa misma tinta oscura se queda en 3,96:1, por   │
 * │ debajo de AA. Allí la tinta tiene que ser blanca: 4,69:1. Un solo valor para los dos temas   │
 * │ deja la marca ilegible en uno de ellos, así que la tinta es un TOKEN (los valores, en        │
 * │ `globals.css`, que es donde vive la paleta; aquí solo el porqué).                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UNA "VIP" POR IDENTIDAD: DOS TAMAÑOS, NO TRES ─────────────────────────────────────────────┐
 * │ Hubo un tercero, `esquina`, que iba superpuesto en la esquina del avatar. Con la figura       │
 * │ anterior —una estrella con una gema dentro— sumaba: era un adorno que decía "premium" sin     │
 * │ competir con nada. Con LETRAS no suma, resta: en una fila de feed, de comentarios, de ranking │
 * │ o de participaciones salía "VIP" en el avatar y "VIP" otra vez pegado al nombre, a dos        │
 * │ centímetros. La misma palabra dos veces no informa el doble; y en el avatar, además, le       │
 * │ disputaba el sitio al emblema de NIVEL, que sí dice algo que no está dicho en ningún otro     │
 * │ lugar del renglón.                                                                            │
 * │                                                                                               │
 * │ Así que la marca de las filas es `compacta`, SIEMPRE junto al nombre —el mismo criterio que    │
 * │ ya seguía `MarcaBoost`, y por el mismo motivo escrito en su docblock— y en el perfil la marca │
 * │ es el EMBLEMA del hero. Antes de quitarla se hizo el CENSO: todas las superficies que pasaban │
 * │ `esVip` a un avatar pintan al lado el nombre con su marca, así que no queda ni una donde el   │
 * │ dato se pierda. `tests/render/identidad-vip` lo fija midiendo UNA marca por fila, no "que     │
 * │ haya marca" — que es lo que dejaba pasar la duplicada.                                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const TAMANO_MARCA = {
  /** Junto al nombre, a escala de texto. Es la marca de TODAS las filas (ver abajo). */
  compacta: "px-1 py-px text-[9px] rounded-[4px]",
  /**
   * El hero del perfil VIP. El RADIO es proporcional a la altura, como en los dos de arriba
   * (~0,35 del alto): con el mismo radio absoluto que la píldora pequeña, a este tamaño la pieza
   * deja de leerse como una insignia y se lee como un BLOQUE amarillo. Se vio en una captura.
   */
  grande: "px-3 py-1.5 text-[22px] rounded-xl",
} as const;

export type TamanoMarcaVip = keyof typeof TAMANO_MARCA;

export function MarcaVip({
  tamano = "compacta",
  clase = "",
}: {
  tamano?: TamanoMarcaVip;
  clase?: string;
}) {
  const t = useTextos("marcas");
  return (
    <span
      data-marca-vip={tamano}
      // `aria-hidden` NO: a diferencia de una figura decorativa, esto DICE algo que no está dicho
      // en ninguna otra parte del renglón —que esta persona es VIP—, y un lector de pantalla que
      // se lo salte deja a su usuario sin el dato. Con `title` + `aria-label` se anuncia una vez.
      aria-label={t("vip")}
      title={t("vip")}
      role="img"
      className={`inline-flex shrink-0 items-center justify-center bg-[var(--vip-gold)] font-black tracking-[0.04em] text-[var(--vip-tinta)] tabular-nums ${TAMANO_MARCA[tamano]} ${clase}`}
      style={{ fontFamily: "var(--font-display)", lineHeight: 1 }}
    >
      {t("vipCorta")}
    </span>
  );
}

/**
 * EL EMBLEMA GRANDE DEL PERFIL VIP. La MISMA marca, en grande: no es otra pieza, y por eso no
 * tiene un dibujo propio que mantener aparte.
 *
 * SIN DEGRADADO, y aquí sí se midió antes de decidir: con la píldora en degradado, la tinta no
 * puede leerse en los dos extremos a la vez —la oscura cae a 3,13:1 en el extremo profundo del
 * oro de oscuro, y la blanca a 2,28:1 en el extremo claro del de claro—. Un degradado que obliga
 * a elegir en qué mitad de la pieza se lee el texto no es un degradado: es un defecto.
 */
export function EmblemaVipGrande({ clase = "" }: { clase?: string }) {
  return <MarcaVip tamano="grande" clase={clase} />;
}
