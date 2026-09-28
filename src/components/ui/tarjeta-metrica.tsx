import type { ReactNode } from "react";

/**
 * TARJETA DE MÉTRICA — una cifra con su nombre. La usan las cabeceras de /puntos y /referidos.
 *
 * LA CIFRA MANDA Y ES NEUTRA. Nada de color semántico aquí: `--df-money` es del dinero y estas
 * pantallas no lo tienen —los puntos no son dinero ni se canjean por dinero—, y `--df-action` es del
 * botón principal, que tampoco es esto. Un número grande y tabular ya pesa lo suficiente sin pintarlo.
 *
 * `pie` es para lo que matiza la cifra (el nivel al que se avanza, cuántos quedan). Va debajo y en
 * tono apagado: si compitiera con el número, habría dos cifras y ninguna principal.
 */
export function TarjetaMetrica({
  etiqueta,
  valor,
  pie,
  destacado,
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
}) {
  return (
    <div className="rounded-sm border border-line bg-surface p-4">
      <p className="text-2xs tracking-widest text-text-dim uppercase">{etiqueta}</p>
      <p
        className="mt-1.5 text-2xl leading-none font-semibold tabular-nums text-text"
        style={destacado ? { color: `var(${destacado})` } : undefined}
      >
        {valor}
      </p>
      {pie ? <p className="mt-1.5 text-2xs text-text-dim">{pie}</p> : null}
    </div>
  );
}
