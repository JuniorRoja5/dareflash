/**
 * ESQUELETOS DE CARGA — las piezas con las que un `loading.tsx` dibuja la pantalla que viene.
 *
 * ┌─ EL FALLO QUE CIERRAN ─────────────────────────────────────────────────────────────────────────┐
 * │ 27 páginas son `force-dynamic` y no había NI UN `loading.tsx`. Al navegar, Next se queda en la │
 * │ pantalla anterior hasta que el servidor responde: pulsas y no pasa nada. Con 4 usuarios eso    │
 * │ son 60 ms y no se ve; con tráfico es la diferencia entre "va lento" y "está roto", y la        │
 * │ reacción natural es volver a pulsar, que duplica la carga justo cuando sobra menos.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LAS TRES REGLAS ──────────────────────────────────────────────────────────────────────────────┐
 * │ 1. NI UNA CIFRA, NI UN NOMBRE, NI UN TEXTO DE CONTENIDO. Un esqueleto que escribe "0 €" o      │
 * │    "Reto" está AFIRMANDO algo que todavía no se ha leído de la base de datos, y la mitad de    │
 * │    las veces afirma mal. Misma disciplina que las tarjetas "próximamente" del panel: nada de   │
 * │    cifras inventadas. Lo vigila `tests/pantallas-de-carga`.                                     │
 * │ 2. LA MISMA FORMA QUE LO QUE VIENE. Si el esqueleto no ocupa el sitio del contenido real, al    │
 * │    llegar los datos la página SALTA, y un salto molesta más que la espera que evitaba. Por eso  │
 * │    cada `loading.tsx` copia el contenedor y la rejilla de SU página, no una genérica.           │
 * │ 3. SE LEE SIN EL LATIDO. La regla global de `prefers-reduced-motion` apaga las animaciones con  │
 * │    `!important`, así que para quien lo pide esto es un bloque quieto: el contraste lo da el     │
 * │    token `--df-raised` contra el fondo, nunca el movimiento.                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ACCESIBILIDAD: los bloques son `aria-hidden` y el anuncio lo hace UNA vez `PantallaCargando` con
 * `role="status"`. Sin eso, un lector de pantalla recitaría cuarenta divs vacíos — y el `role` solo
 * está aquí porque hay algo de verdad que anunciar, que es la regla que sigue el resto del producto.
 */
import type { ReactNode } from "react";

/**
 * Los dos tonos de relleno, y por qué hacen falta DOS.
 *
 * La escala del tema es `void` (fondo de página) < `surface` < `raised`. Un bloque suelto va en
 * `raised`, que es el que se despega del fondo. Pero cuando un bloque se pinta ENCIMA de otro —el
 * raíl de acciones del feed sobre el vídeo— los dos en `raised` son el MISMO color y lo de arriba
 * desaparece: la captura del feed a 390 px salía como un rectángulo liso, sin raíl y sin pie.
 * Entonces el de abajo baja a `surface` y el de arriba se queda en `raised`, que es un escalón por
 * encima. No es una excepción: es la misma escala, usada en dos niveles.
 */
type Tono = "raised" | "surface" | "sobreVideo";
const FONDO: Record<Tono, string> = {
  raised: "bg-raised",
  surface: "bg-surface",
  /**
   * ENCIMA DE UN VÍDEO no vale ningún tono de la escala de superficies: con `raised` sobre
   * `surface` la captura a 390 px no enseñaba ni el raíl ni el avatar —diez puntos de diferencia
   * por canal no son un contraste, son una suposición—. Lo que se pinta sobre el vídeo tiene que ir
   * en el color del CONTENIDO, que es lo que hace el feed de verdad con sus iconos y su texto.
   *
   * Es `text` y no un blanco literal porque la paleta de `@theme` NO declara `white`: `bg-white/15`
   * se escribía en el HTML y Tailwind no generaba la regla, así que el bloque quedaba sin fondo y
   * la pantalla salía lisa. Comprobado en el CSS compilado, no supuesto.
   */
  sobreVideo: "bg-text/15",
};

/**
 * Un bloque de relleno. `className` lleva el tamaño y, si hace falta, OTRO radio.
 *
 * El `rounded-xs` base solo se pone si quien lo coloca no ha pedido uno: con los dos en la lista,
 * cuál gana lo decide el orden del CSS generado y no el de las clases, y ganaba `rounded-xs` — los
 * avatares del feed salían CUADRADOS en la captura. Esto lo vuelve explícito.
 */
export function Esqueleto({
  className = "",
  tono = "raised",
}: {
  className?: string;
  tono?: Tono;
}) {
  const radio = /(^|\s)rounded-/.test(className) ? "" : "rounded-xs";
  return <div aria-hidden className={`animate-pulse ${radio} ${FONDO[tono]} ${className}`} />;
}

/**
 * Varias líneas de texto falso. La ÚLTIMA sale más corta porque un párrafo real no acaba justo en
 * el margen: con todas iguales se ve un rectángulo, no un texto.
 */
export function EsqueletoTexto({
  lineas = 3,
  className = "",
}: {
  lineas?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lineas }, (_, i) => (
        <Esqueleto
          key={i}
          className={`h-3.5 ${i === lineas - 1 ? "w-3/5" : i % 2 === 0 ? "w-full" : "w-11/12"}`}
        />
      ))}
    </div>
  );
}

/**
 * Una tarjeta: el filete de las de verdad, pero RELLENA.
 *
 * El relleno es `bg-raised` y NO `bg-surface/60`, que es el de las tarjetas reales, porque mirando
 * la captura se vio el fallo: sobre el fondo oscuro, `surface` al 60 % queda a un paso del fondo y
 * la tarjeta se lee como un marco VACÍO —parece que la pantalla cargó y no hay nada— en vez de como
 * un hueco que se está llenando. Una tarjeta de verdad lleva imagen y texto dentro; su esqueleto
 * tiene que pesar lo mismo, no menos. `raised` es el mismo token que usan los demás bloques, así
 * que todo el esqueleto se lee como una sola cosa.
 */
export function EsqueletoTarjeta({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-sm border border-line bg-raised ${className}`}
    />
  );
}

/**
 * Anchos del contenedor que usan las pantallas. Los que existen, no una cadena libre. `max-w-6xl` es
 * el de /wallet y /puntos (participante-diseno-wallet-puntos), el mismo que el portal de empresa.
 */
type Ancho = "max-w-7xl" | "max-w-6xl" | "max-w-5xl";

/**
 * El aire vertical en MÓVIL. También dos, y también los que hay: el detalle del reto usa `py-5`
 * porque en móvil la ficha y las participaciones se aprietan a propósito. Es una union y no una
 * cadena libre para que nadie meta aquí un valor que ninguna página usa — el único trabajo de este
 * contenedor es NO diferenciarse del de la página que viene.
 */
type AireMovil = "py-8" | "py-5";

/**
 * El envoltorio de un `loading.tsx`: repite el contenedor de las páginas del shell y pone el único
 * anuncio para lectores de pantalla.
 *
 * `py-8 lg:py-12` y el `max-w` SALEN DE LAS PÁGINAS REALES (`/inicio`, `/retos`, `/destacados`
 * usan `max-w-7xl`; `/boosts`, `max-w-5xl`). Si alguien cambia el contenedor de una página, hay que
 * cambiarlo aquí: es el precio de que no salte, y no hay forma de deducirlo desde este componente.
 *
 * `sinContenedor`: para un `loading.tsx` que vive DENTRO de un layout que ya pone el ancho y el aire
 * (el portal de empresa, el panel). Repetir ahí el contenedor del shell metería un margen dentro de
 * otro y el contenido saltaría al llegar. Solo el anuncio y el `role`, sin maqueta.
 */
export function PantallaCargando({
  children,
  ancho = "max-w-7xl",
  aireMovil = "py-8",
  sinContenedor = false,
}: {
  children: ReactNode;
  ancho?: Ancho;
  aireMovil?: AireMovil;
  sinContenedor?: boolean;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={
        sinContenedor ? "w-full" : `mx-auto w-full ${ancho} px-4 ${aireMovil} lg:px-8 lg:py-12`
      }
    >
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  );
}

/** El título de la pantalla: una barra del alto de un `h1` y un ancho de titular, no de línea. */
export function EsqueletoTitulo({ className = "" }: { className?: string }) {
  return <Esqueleto className={`h-8 w-56 ${className}`} />;
}
