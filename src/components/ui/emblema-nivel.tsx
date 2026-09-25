import { nivelPorPuntos, type ClaveEmblema, type Nivel } from "@/lib/niveles";

/**
 * EL EMBLEMA DE NIVEL — glifos NUESTROS, en SVG y RELLENOS.
 *
 * NADA DE EMOJI. Un emoji lo dibuja cada sistema operativo a su manera: la "llama" de Pro sería una
 * llama en Android, otra en iOS y un cuadrado en algún navegador viejo. Con SVG propio, el emblema es
 * el mismo píxel en todas partes y el color lo pone nuestro token, no la fuente del sistema.
 *
 * RELLENOS Y NO DE TRAZO: a 14 píxeles sobre una foto, un contorno de 2 px se pierde entre el ruido
 * de la imagen. Una silueta maciza se lee de un vistazo, que es justo lo que se le pide a una insignia.
 * Van sobre un disco del color del nivel con el glifo CALADO en el fondo de la página (`--df-void`),
 * así que el contraste no depende de la foto que haya debajo.
 *
 * Las formas se distinguen POR SILUETA, no solo por color: en una foto pequeña, y para quien no
 * distingue bien los tonos, la forma es lo único que queda.
 */
const GLIFOS: Record<ClaveEmblema, React.ReactNode> = {
  // CHALLENGER — marca de verificación: "ya has hecho algo".
  marca: <path d="M10.2 16.6L6 12.4l1.7-1.7 2.5 2.5 6.1-6.1L18 8.8z" />,
  // PRO — llama.
  llama: (
    <path d="M12 3.5c3 3.2 1.3 5 3.1 7.4 1.6 2.1 1.3 5-.7 6.7a5.6 5.6 0 01-7.4-.3c-1.8-1.9-1.6-4.9.4-6.8C9.6 8.6 9 6.3 12 3.5zm.1 7.9c-1.4 1.3-2 2.6-1.3 3.9.5 1 1.7 1.4 2.7.9 1.2-.6 1.5-1.9.8-3.2-.4-.7-1.2-1.2-2.2-1.6z" />
  ),
  // ELITE — gema tallada.
  gema: (
    <path d="M7.2 4h9.6l3.2 5-8 11-8-11zm1.3 2l-1.6 2.5h2.9L11 6zm4.1 0l1.2 2.5h2.9L15.1 6zm-.4 12.1l5-7.6H7.8z" />
  ),
  // LEGEND — corona. Se reconoce por la SILUETA (tres puntas y base), no por el relleno.
  corona: (
    <path d="M4.6 18.3l-1.5-9.6 5.2 3.5L12 4.7l3.7 7.5 5.2-3.5-1.5 9.6zm1.7-2h11.4l.6-3.9-3.2 2.1L12 8.9l-3.1 5.6-3.2-2.1z" />
  ),
};

/** Fondo del disco: el mismo en los dos temas, para que el glifo calado se lea sobre cualquier foto. */
const DISCO = "var(--df-void)";

export function EmblemaNivel({ puntos, clase = "" }: { puntos: number; clase?: string }) {
  return <EmblemaDeNivel nivel={nivelPorPuntos(puntos)} clase={clase} />;
}

/** La misma pieza, cuando quien llama ya tiene el nivel resuelto (evita derivarlo dos veces). */
export function EmblemaDeNivel({ nivel, clase = "" }: { nivel: Nivel; clase?: string }) {
  if (!nivel.emblema || !nivel.tokenColor) return null;
  const color = `var(${nivel.tokenColor})`;
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={`Nivel ${nivel.nombre}`}
      className={clase}
      style={{ color }}
    >
      {/* Disco del color del nivel: lo que hace que el glifo se lea encima de cualquier avatar. */}
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      {/* El glifo, CALADO en el fondo de página. */}
      <g fill={DISCO}>{GLIFOS[nivel.emblema]}</g>
    </svg>
  );
}
