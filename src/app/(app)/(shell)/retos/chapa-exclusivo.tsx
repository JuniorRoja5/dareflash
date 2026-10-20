import { MarcaVip } from "@/components/ui/identidad-usuario";
import { ETIQUETA_RETO_SOLO_VIP } from "@/config/constants";

/**
 * LA CHAPA DEL RETO EXCLUSIVO, con la MARCA de verdad dentro.
 *
 * ┌─ LA CHAPA ES OSCURA Y LA MARCA VA TAL CUAL ─────────────────────────────────────────────────┐
 * │ La maqueta pinta una chapa dorada con un recuadro oscuro donde pone "VIP": o sea, la marca   │
 * │ al revés (tinta de fondo, oro de letra). Aquí la chapa es la OSCURA y dentro va `MarcaVip`   │
 * │ sin invertir, por dos razones: la marca Mythic es UNA pieza con su par oro/tinta medido por  │
 * │ tema —dibujar su negativo para una esquina es exactamente cómo el sello y la gema acabaron   │
 * │ divergiendo—, y una chapa oscura se lee sobre CUALQUIER portada, mientras que una dorada     │
 * │ desaparece sobre una foto clara.                                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * VIVE EN SU PROPIO FICHERO porque la montan DOS pantallas (la tarjeta del listado y la ficha del
 * detalle) y la segunda existe precisamente para que el detalle no contradiga a la tarjeta: escrita
 * dos veces, acabarían diciendo cosas distintas.
 */
export function ChapaExclusivo({
  compacta = false,
  clase = "",
}: {
  /**
   * En la REJILLA (dos columnas en móvil, tarjeta de ~170 px) la palabra no cabe: con ella, la
   * chapa se come la portada o baja de línea. Compacta, la palabra aparece a partir de `sm`. En el
   * DETALLE hay sitio de sobra, así que allí se dice entera.
   */
  compacta?: boolean;
  clase?: string;
}) {
  return (
    <span
      data-reto-chapa-vip
      className={`pointer-events-none inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-2xs font-semibold tracking-widest uppercase ${clase}`}
      style={{
        color: "var(--vip-gold)",
        borderColor: "color-mix(in srgb, var(--vip-gold) 45%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--df-void) 72%, transparent)",
      }}
    >
      <MarcaVip />
      {/* La MARCA nunca se calla; la palabra, en la rejilla estrecha, sí (ver `compacta`). */}
      <span className={compacta ? "hidden sm:inline" : undefined}>{ETIQUETA_RETO_SOLO_VIP}</span>
    </span>
  );
}
