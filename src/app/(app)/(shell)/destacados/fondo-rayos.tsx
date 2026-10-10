/**
 * EL TEJIDO DE RAYOS — el escenario de la vitrina. Siete descargas de marca que cruzan la pantalla
 * de arriba abajo, detrás de todo.
 *
 * ┌─ UNA CAPA, NUNCA UN EFECTO POR TARJETA ───────────────────────────────────────────────────────┐
 * │ Con cuarenta caras en pantalla, un rayo por tarjeta son cuarenta animaciones corriendo a la   │
 * │ vez: eso se paga en batería y se nota en el móvil como calor. Esto es UN SVG que cubre el     │
 * │ viewport, pase quien pase por delante — el coste no crece con la gente destacada.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SOLO AQUÍ. En /inicio la fila de destacados es una sección entre otras y ya hay un hero y un
 * vídeo de fondo; un tejido animado encima convertiría la portada en una feria. Esta pantalla ES
 * la vitrina. Hay un test de que esta capa no se monta en ninguna otra.
 *
 * NO LLEVA NI UN COLOR: el trazo va en `currentColor` y el color lo pone `.df-rayos` desde
 * `--df-action`, así que sigue al tema y al repintado de marca sin tocar nada aquí. Y la opacidad
 * va por TEMA, porque sobre blanco un trazo verde solo puede restar luminosidad y necesita más.
 *
 * ┌─ HERMANO DEL CONTENEDOR DE PÁGINA, NUNCA HIJO ────────────────────────────────────────────────┐
 * │ Es `position: fixed`, y un ancestro que anime `transform` —el contenedor lleva `df-rise`— le  │
 * │ crea BLOQUE CONTENEDOR: dejaría de cubrir el viewport y se quedaría recortado dentro del      │
 * │ `div`. Es la misma trampa que ya enseñaron el fondo de vídeo de la portada y el rescoldo.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL MOVIMIENTO ES OPACIDAD Y NADA MÁS. Ni `filter` ni `box-shadow`, que repintan en cada
 * fotograma: el brillo que en la maqueta daba un `drop-shadow` lo pone el rescoldo, que ya está
 * detrás. La regla global de `prefers-reduced-motion` lo apaga y queda un tejido quieto — que
 * sigue siendo el escenario, no un hueco. `aria-hidden`: no dice nada que haya que leer.
 */

/**
 * Los siete trazos, en un lienzo de 1200×760 que se recorta para llenar (`slice`). Cada uno baja
 * con dos quiebros: es la silueta del rayo de la marca estirada, no una línea en zigzag cualquiera.
 * Las tres cortas rellenan los huecos sin cerrar el tejido.
 */
const RAYOS = [
  "M150 40 L120 180 L165 200 L110 420 L150 440 L95 720",
  "M420 10 L395 160 L440 180 L390 360 L430 380 L380 740",
  "M640 30 L615 150 L660 175 L610 400 L650 420 L600 730",
  "M860 20 L835 170 L880 190 L825 410 L870 430 L820 720",
  "M1060 40 L1030 180 L1075 205 L1020 430 L1065 450 L1010 740",
  "M280 120 L255 300 L300 320 L250 560",
  "M960 120 L935 300 L980 320 L930 560",
];

export function FondoRayos() {
  return (
    <div className="df-rayos" aria-hidden>
      <svg viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice" focusable="false">
        {RAYOS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>
  );
}
