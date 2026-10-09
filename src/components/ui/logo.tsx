/**
 * EL LOGOTIPO — marca grafica (rayo en circulo, con tres lineas de velocidad detras) + la palabra.
 * Sustituye al wordmark de texto pelado que habia en la barra lateral. Sin PNG, sin dependencias y
 * sin un solo hex: el color sale del token y por tanto sigue al tema Y al repintado de marca.
 *
 * TRES DECISIONES QUE PARECEN DETALLES Y NO LO SON:
 *
 *  - LA PALABRA ES TEXTO REAL, NO UN `<text>` DENTRO DEL SVG. Un `<text>` depende de que la fuente
 *    variable haya cargado: si no carga, el nombre de la marca DESAPARECE, porque dentro de un SVG no
 *    hay reserva que valga (en HTML cae a la pila de sistema y se sigue leyendo). Ademas no se
 *    selecciona ni lo traduce el navegador. Asi que el SVG lleva solo la GEOMETRIA.
 *  - EL COLOR ENTRA POR `currentColor`, nunca con `var(--df-*)` en un atributo del SVG. Los atributos
 *    de presentacion no admiten `var()` de forma fiable en todos los navegadores: se queda sin pintar
 *    y el rayo desaparece. Lo que si es CSS es la clase `text-action` del `<svg>`, y de ahi baja el
 *    color a todos los trazos.
 *  - SE ANUNCIA UNA VEZ. El contenedor es `role="img"` con `aria-label`, asi que un lector de
 *    pantalla dice "DareFlash" y no "DareFlash DareFlash" (la marca y luego la palabra). El `<svg>`
 *    va `aria-hidden` por lo mismo.
 *
 * El REALCE (glow) NO esta aqui a proposito: un halo verde pesa distinto sobre negro que sobre blanco
 * —por eso el tema claro ya baja `--df-halo-fuerza` a la mitad—, asi que se decide por tema y con
 * medidas, que es el encargo de la pieza del glow. Un realce a medias ahora seria rehacerlo despues.
 */

/** El rayo. Es el MISMO trazado que el favicon (`src/app/icon.svg`): una sola silueta de marca. */
const RAYO = "M13 3 5 13.5h5l-1 7.5 8-10.5h-5z";

/**
 * MARCA sola (sin la palabra). El centro del circulo es (30,16) y el rayo se centra ahi mismo: su
 * trazado nace en una caja de 24 con el centro en (11,12), de ahi el `translate(19 4)` — o sea
 * (30-11, 16-12). SI SE CAMBIA LA ESCALA HAY QUE RECALCULARLO, o el rayo se descentra. Medido: con
 * escala 1 el vertice mas lejano queda a 9,22 del centro y el borde interior del aro esta a 11,87
 * (r 13 menos media pluma de 2,25), asi que hay 2,65 de aire. El rayo ocupa el 76% del hueco: mas
 * pequeno se pierde dentro del circulo y mas grande toca el aro.
 */
function Marca({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 32"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {/* LINEAS DE VELOCIDAD: detras del circulo (o sea a la izquierda, que es como se lee que algo
          va hacia la derecha). Van a RAS por la derecha y desiguales por la izquierda: asi se leen
          como una estela. Al reves —todas naciendo en el mismo margen izquierdo— a 28 px se leen
          como un icono de MENU; se vio en la prueba a tamano real y por eso estan asi. */}
      <line x1="4" y1="10" x2="13" y2="10" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <line x1="0" y1="16" x2="15" y2="16" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      <line x1="6" y1="22" x2="12" y2="22" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <circle cx="30" cy="16" r="13" strokeWidth="2.25" />
      <path d={RAYO} transform="translate(19 4)" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * EL LOCKUP COMPLETO: marca + palabra. `compacto` deja solo la marca, para un cromo estrecho.
 * No es un enlace: en la lateral el destino "Inicio" ya es una fila de la nav, y dos puertas al
 * mismo sitio pegadas una encima de otra es una trampa para el dedo, no una comodidad.
 */
export function Logo({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label="DareFlash"
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
    >
      <Marca className="h-7 w-auto shrink-0 text-action" />
      {compacto ? null : (
        <span
          aria-hidden="true"
          className="text-xl leading-none text-text"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 800, "wdth" 125',
          }}
        >
          DAREFLASH
        </span>
      )}
    </span>
  );
}
