import { nivelPorPuntos, type ClaveEmblema, type Nivel } from "@/lib/niveles";

/**
 * EL EMBLEMA DE NIVEL — glifos NUESTROS, en SVG.
 *
 * NADA DE EMOJI. Un emoji lo dibuja cada sistema operativo a su manera: la "llama" de Pro sería una
 * llama en Android, otra en iOS y un cuadrado en algún navegador viejo. Con SVG propio, el emblema es
 * el mismo píxel en todas partes y el color lo pone nuestro token, no la fuente del sistema.
 *
 * `currentColor` en todos los trazos: el color lo fija quien lo pinta con `style={{ color }}` desde el
 * token del nivel, así que el mismo glifo sirve en claro y en oscuro sin una segunda versión.
 *
 * VIEWBOX COMÚN (24) y formas que se distinguen POR SILUETA, no solo por color: en una foto de perfil
 * pequeña, y para quien no distingue bien los tonos, la forma es lo único que queda. Por eso la corona
 * de Legend es una corona reconocible y no un disco dorado — el oro ya lo usa el podio para la
 * medalla, y dos discos dorados con dos significados serían indistinguibles.
 */
const GLIFOS: Record<ClaveEmblema, React.ReactNode> = {
  // CHALLENGER — marca de verificación: "ya has hecho algo".
  marca: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  // PRO — llama.
  llama: (
    <path d="M12 3c2.5 3 1 5 3 7.5 1.6 2 1.4 4.6-.4 6.2a5 5 0 01-7 0c-1.9-1.8-1.8-4.7.2-6.6C9.5 8.5 9 6 12 3z" />
  ),
  // ELITE — gema tallada.
  gema: <path d="M6 4h12l3 5-9 11L3 9z M6 4l3 5 3-5 3 5 3-5 M3 9h18" />,
  // LEGEND — corona. Se reconoce por la SILUETA (tres puntas y base), no por el relleno.
  corona: <path d="M4 17h16 M4 17l-1-8 5 3.5L12 5l4 7.5L21 9l-1 8" />,
};

/**
 * Pinta el emblema del nivel que corresponda a `puntos`, o nada si es Rookie (sin marca).
 *
 * El nivel se deriva con `nivelPorPuntos`, la MISMA función que usa la insignia de texto: un solo
 * origen, para que las dos no puedan discrepar en una frontera.
 */
export function EmblemaNivel({ puntos, clase = "" }: { puntos: number; clase?: string }) {
  const nivel = nivelPorPuntos(puntos);
  return <EmblemaDeNivel nivel={nivel} clase={clase} />;
}

/** La misma pieza, cuando quien llama ya tiene el nivel resuelto (evita derivarlo dos veces). */
export function EmblemaDeNivel({ nivel, clase = "" }: { nivel: Nivel; clase?: string }) {
  if (!nivel.emblema || !nivel.tokenColor) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={`Nivel ${nivel.nombre}`}
      className={clase}
      style={{ color: `var(${nivel.tokenColor})` }}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLIFOS[nivel.emblema]}
    </svg>
  );
}
