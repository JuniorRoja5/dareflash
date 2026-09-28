import type { CSSProperties, ReactNode } from "react";

/**
 * TARJETA DE MÉTRICA — una cifra con su nombre. La usan las cabeceras de /puntos y /referidos.
 *
 * GLASS Y ELEVADA, como el resto de tarjetas del producto (`bg-surface/60` + desenfoque + sombra
 * suave). Nació plana —`bg-surface` a secas— y por eso desentonaba: era el único sitio de la app
 * donde una tarjeta se confundía con el fondo. La profundidad se hace por LUMINOSIDAD (capas), que
 * es la filosofía del sistema; la sombra solo la despega de la página.
 *
 * SIN HOVER LUMINOSO, y es deliberado: `--df-glow-hover` lleva el color de ACCIÓN y en este producto
 * marca las tarjetas en las que se puede PULSAR (un reto, un perfil destacado). Estas no llevan a
 * ninguna parte, así que encenderlas al pasar por encima prometería un clic que no existe. El día
 * que una de ellas enlace a algo, ese día se le pone el glow y dirá la verdad.
 *
 * LA CIFRA MANDA Y ES NEUTRA por defecto: nada de `--df-money`, que es del dinero y estas pantallas
 * no lo tienen (los puntos no son dinero ni se canjean por dinero). El único color que entra aquí es
 * el del NIVEL, y solo en la tarjeta que habla del nivel.
 */
export function TarjetaMetrica({
  etiqueta,
  valor,
  pie,
  destacado,
  icono,
}: {
  etiqueta: string;
  /** La cifra ya formateada, o un nodo cuando no es un número (el nombre del nivel, p. ej.). */
  valor: ReactNode;
  pie?: ReactNode;
  /**
   * Color del valor, por TOKEN (`--df-nivel-pro`…). Solo lo usa la tarjeta del nivel, para que la
   * cifra lleve el color de ESE nivel; el resto van neutras. Nunca un hex: los tokens tienen su
   * versión clara y su versión oscura, un hex solo se ve bien en uno de los dos temas.
   */
  destacado?: string | null;
  /** Insignia geométrica opcional (el emblema del nivel). Nunca un icono ilustrado ni un emoji. */
  icono?: ReactNode;
}) {
  const color = destacado ? `var(${destacado})` : null;
  return (
    <div
      className="relative overflow-hidden rounded-sm border border-line bg-surface/60 p-4 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
      style={color ? ({ "--df-halo-color": color } as CSSProperties) : undefined}
    >
      {/* Cuando la tarjeta tiene color propio, el mismo halo del hero pero mucho más contenido:
          solo lo justo para que no sea un rectángulo gris más. */}
      {color ? <span className="df-halo opacity-60" aria-hidden /> : null}
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xs tracking-widest text-text-dim uppercase">{etiqueta}</p>
          <p
            className="mt-1.5 text-3xl leading-none font-semibold tabular-nums text-text"
            style={color ? { color } : undefined}
          >
            {valor}
          </p>
          {pie ? <p className="mt-2 text-2xs text-text-dim">{pie}</p> : null}
        </div>
        {icono ? <span className="shrink-0">{icono}</span> : null}
      </div>
    </div>
  );
}
