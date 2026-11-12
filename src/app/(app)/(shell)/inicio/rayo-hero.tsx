import { Imagen3d } from "@/components/ui/imagen-3d";
import type { Tema } from "@/lib/tema";

/**
 * EL RAYO DEL HERO, VIVO: el objeto de la marca con sensación de movimiento y un brillo que lo recorre.
 * Todo es CSS (`globals.css`, bloque «EL RAYO DEL HERO»); aquí solo están las capas:
 *
 *  - `.df-rayo` (fuera): gira unos grados con el SCROLL donde el navegador sabe atarlo, y lleva el glow
 *    de la acción. Ya existía.
 *  - `.df-rayo-flota`: flota y se balancea despacio, siempre, para que se sienta vivo aunque no se baje.
 *    Detrás, un halo de la acción que late (solo opacidad).
 *  - `.df-rayo-brillo` + `.df-rayo-destello`: un DESTELLO que cruza el rayo de vez en cuando. La capa va
 *    RECORTADA con la silueta del propio rayo (`mask-image` con su misma imagen), así que la luz solo se
 *    ve sobre el rayo, nunca como una banda sobre el fondo. Lo que se mueve es una franja con
 *    `transform` (MARCA.md §7: en bucle, solo `transform` y `opacity`).
 *
 * Sigue siendo UNO de los dos elementos que se mueven en la vista (el otro, el recuento de las cifras):
 * son capas del mismo objeto. `prefers-reduced-motion` y Save-Data (`data-ahorro`) lo paran todo.
 * Decorativo (`aria-hidden`): el titular ya dice lo que hay que decir.
 */
export function RayoHero({ tema }: { tema: Tema }) {
  return (
    <span
      aria-hidden
      className="df-rayo pointer-events-none relative block w-20 shrink-0 sm:w-28 lg:w-44"
    >
      <span className="df-rayo-flota relative block">
        {/* CON PRIORIDAD, y es la ÚNICA de la página: medido, el rayo ES el elemento LCP en escritorio. */}
        <Imagen3d pieza="rayo" tema={tema} tamano={176} prioridad className="w-full" />
        {/* La silueta para recortar la luz: la forma es la misma en los dos temas (solo cambia el color),
            así que vale la imagen de 2× de cualquiera de ellos. */}
        <span
          className="df-rayo-brillo"
          style={{
            maskImage: "url(/img/3d/rayo-oscuro-352.webp)",
            WebkitMaskImage: "url(/img/3d/rayo-oscuro-352.webp)",
          }}
        >
          <span className="df-rayo-destello" />
        </span>
      </span>
    </span>
  );
}
