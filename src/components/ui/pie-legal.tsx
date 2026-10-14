import Link from "next/link";

/**
 * EL PIE LEGAL — la única puerta a los documentos legales desde dentro del producto.
 *
 * ┌─ EL FALLO QUE CIERRA ─────────────────────────────────────────────────────────────────────────────┐
 * │ `/privacidad` se escribió, se montó y quedó inalcanzable: la ÚNICA puerta era el enlace de la    │
 * │ casilla del registro. O sea que quien ya tenía cuenta no podía volver a leer lo que aceptó, y    │
 * │ nada fallaba por ello —la ruta existe, renderiza y pasa sus tests—. Es el mismo patrón que dejó  │
 * │ cinco destinos sin puerta en móvil: lo que falta no es la página, es el camino.                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `/terminos` SE NOMBRA PERO NO SE ENLAZA, porque la página todavía no existe: un enlace a una
 * página que no está es un 404 justo en el sitio donde alguien va a comprobar qué aceptó. Se dice
 * "pronto" —que es verdad y gestiona la expectativa— y el guard de `pie-legal` se pondrá rojo el día
 * que la página aparezca, que es el día de enlazarlo. La misma regla que ya aplica la casilla del
 * registro (ver `paginas-legales`).
 *
 * DISCRETO A PROPÓSITO: texto secundario, un filete arriba y nada más. Un pie legal no compite con el
 * contenido; tiene que estar, no lucirse. Y por eso tampoco lleva el acento: `--df-action` marca lo
 * que se hace, y leer la política no es la acción de ninguna pantalla.
 *
 * NO VA EN EL FEED. El feed es inmersivo a pantalla completa y vive FUERA del grupo `(shell)` justo
 * para eso; colgarle un pie sería meterle una banda de texto debajo del vídeo. Tampoco va en el
 * panel: el admin no es público y ya tiene su propio armazón.
 */
export function PieLegal({
  /**
   * `true` donde debajo hay BARRA INFERIOR FIJA (todo el grupo `(app)`): el pie se queda detrás de
   * ella si no se reserva el hueco. Es un booleano y no un `className` libre porque dos clases de
   * `padding-bottom` en el mismo elemento las resuelve el ORDEN DEL CSS, no el de las clases —y eso
   * no se ve mirando el JSX—.
   */
  sobreNavMovil = false,
}: {
  sobreNavMovil?: boolean;
}) {
  return (
    <footer
      className={`mt-auto border-t border-line px-4 pt-6 text-xs text-text-dim lg:px-8 ${
        sobreNavMovil ? "pb-28 lg:pb-6" : "pb-6"
      }`}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
        {/* SIN AÑO, a propósito. Escrito a mano envejece sin que nada falle, y calculado con
            `new Date()` tampoco sirve: `/privacidad` se PRERENDERIZA, así que ahí el año se
            congelaría en el del build. Un año en el pie no dice nada que no diga mejor la "última
            actualización" del propio documento legal. */}
        <span>© DareFlash</span>
        <Link
          href="/privacidad"
          className="rounded-xs underline underline-offset-2 hover:text-text focus-visible:text-text"
        >
          Privacidad
        </Link>
        {/* NO ES UN ENLACE, y no es un olvido: la página no existe todavía. Un `<span>` no promete un
            clic (ver la familia de "sin botones muertos"). */}
        <span>Términos (pronto)</span>
      </div>
    </footer>
  );
}
