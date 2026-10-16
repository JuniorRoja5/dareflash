import type { CSSProperties } from "react";

import { EmblemaVipGrande } from "@/components/ui/identidad-usuario";
import { ImportePremio } from "@/components/ui/importe-premio";
import { DEFAULT_CURRENCY, VIP_PRECIO_CENTS } from "@/config/constants";

/**
 * HERO DE /vip — qué es Mythic, cuánto cuesta y qué pasa si te arrepientes.
 *
 * MISMO CUERPO QUE LOS OTROS TRES HEROES (glass al 60% + desenfoque + sombra grande + halo
 * recortado): `tests/simetria-secciones` lo exige a los cuatro a la vez. Esta pantalla NACE dentro
 * de esa familia a propósito — la lección de /referidos, que heredó las primitivas y no el cuerpo y
 * parecía de otra app.
 *
 * ┌─ LO QUE CAMBIA RESPECTO A LA MAQUETA, Y POR QUÉ ────────────────────────────────────────────┐
 * │ La maqueta envuelve el hero en el BORDE DE LUZ QUE GIRA del perfil VIP. Aquí no, y no es    │
 * │ pereza: ese borde (`.df-vip-borde`) gira una capa CUADRADA dimensionada desde el ALTO       │
 * │ (`height: 200%`), y eso solo cubre las esquinas mientras la caja sea una COLUMNA — está      │
 * │ escrito en su propio comentario. Este hero es una BANDA apaisada, así que el mismo recurso   │
 * │ dejaría las esquinas descubiertas media vuelta de cada giro. La alternativa —una segunda     │
 * │ variante dimensionada desde el ancho— sería correcta solo mientras la banda no se vuelva más │
 * │ alta que ancha en móvil, que es justo la clase de invariante que no se puede atar con un     │
 * │ test. El borde que gira se queda donde se midió: en el perfil.                               │
 * │                                                                                               │
 * │ La firma VIP sigue estando, con lo que SÍ es robusto: el halo en `--vip-gold`, el filete     │
 * │ dorado y el emblema flotando con su resplandor (`df-vip-emblema`).                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL PRECIO SALE DE `VIP_PRECIO_CENTS` y se pinta con `ImportePremio`, el mismo tratamiento que el
 * premio de un reto y que los paquetes de Boost: dinero es `--df-money`, SIEMPRE, también cuando la
 * pantalla va de oro. Un "10$" escrito a mano aquí sería el precio inventado de siempre — el día que
 * suba, la página seguiría anunciando el viejo mientras Stripe cobra el nuevo.
 *
 * EL TÍTULO VA EN ORO, y eso está medido: `--vip-gold` sobre la superficie da 12,8:1 en oscuro y
 * 4,7:1 en claro (ver `MarcaVip`), de sobra para un texto de este tamaño en los dos temas.
 */
export function HeroVip() {
  return (
    <section
      aria-labelledby="vip-mythic"
      style={
        {
          "--df-halo-color": "var(--vip-gold)",
          borderColor: "color-mix(in srgb, var(--vip-gold) 40%, transparent)",
        } as CSSProperties
      }
      className="relative overflow-hidden rounded-sm border bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md lg:p-10"
    >
      <span className="df-halo" aria-hidden />

      {/* DOS COLUMNAS EN ESCRITORIO, el mismo reparto que el hero de /boosts: el discurso a la
          izquierda y la cifra a la derecha. A ancho completo —y esta pantalla va a ancho completo—
          con todo en una columna la banda se queda medio vacía por la derecha; se vio mirándola. En
          móvil se apilan, y entonces el precio cae justo debajo del texto que lo justifica. */}
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-12">
        <div className="flex flex-wrap items-center gap-5">
          {/* El emblema es la MISMA marca que lleva un VIP junto a su nombre, en grande: aquí dice
              qué se compra, y allí quién lo tiene. Una sola pieza (ver `MarcaVip`). */}
          <EmblemaVipGrande clase="df-vip-emblema" />

          <div className="min-w-0">
            <h1
              id="vip-mythic"
              className="text-[clamp(1.75rem,5vw,2.75rem)] leading-none text-[var(--vip-gold)]"
              style={{
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"wght" 800, "wdth" 110',
              }}
            >
              VIP Mythic
            </h1>
            <p className="mt-3 max-w-[52ch] text-sm text-text-dim">
              La membresía premium de DareFlash. Tu nombre y tu perfil destacan en toda la
              plataforma, y cada semana recibes un Boost para ponerte en el espacio destacado.
            </p>
          </div>
        </div>

        {/* EL PRECIO Y SU LETRA PEQUEÑA, JUNTOS Y ARRIBA. "Cancela cuando quieras" no es un detalle
            del pie: es la mitad de la decisión de suscribirse, y al final de la página se lee
            después de haber dudado. */}
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:flex-col lg:items-end lg:text-right">
          <span className="flex items-baseline gap-x-2">
            <ImportePremio cents={VIP_PRECIO_CENTS} currency={DEFAULT_CURRENCY} tamano="tarjeta" />
            <span className="text-sm text-text-dim">al mes</span>
          </span>
          <span className="text-xs text-text-dim">
            Cancela cuando quieras · acceso hasta fin de periodo
          </span>
        </p>
      </div>
    </section>
  );
}
