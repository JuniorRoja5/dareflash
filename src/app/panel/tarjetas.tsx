/**
 * TARJETAS de métrica del panel. Fuente ÚNICA: las usan el Resumen y la gestión de un reto, para que
 * "dato real" y "todavía no hay dato" se lean EXACTAMENTE igual en todo el panel.
 *
 * La distinción es la regla de honestidad del proyecto y por eso vive en el tipo, no en la disciplina
 * de quien pinta: una `TarjetaMetrica` recibe un `number` (siempre un dato calculado de la BD) y una
 * `TarjetaProximamente` NO acepta valor ninguno — es imposible colar una cifra inventada en ella.
 */
const ESTILO_CIFRA = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 780, "wdth" 118',
} as const;

/** Métrica REAL: número grande (tabular) + etiqueta. `acento` la resalta (dinero -> lima). */
export function TarjetaMetrica({
  valor,
  etiqueta,
  acento = false,
  nota,
}: {
  valor: number;
  etiqueta: string;
  acento?: boolean;
  /** Matiz opcional bajo la cifra (p.ej. de qué se está contando exactamente). */
  nota?: string;
}) {
  return (
    <div className="rounded-sm border border-line bg-surface/60 p-5 shadow-[var(--df-shadow-md)]">
      <p
        className={`text-3xl leading-none tabular-nums ${acento ? "text-money" : "text-text"}`}
        style={ESTILO_CIFRA}
      >
        {valor.toLocaleString("es-ES")}
      </p>
      <p className="mt-2 text-2xs font-semibold tracking-widest text-text-dim uppercase">
        {etiqueta}
      </p>
      {nota ? <p className="mt-1 text-2xs text-text-dim">{nota}</p> : null}
    </div>
  );
}

/**
 * Métrica SIN backend todavía. Pinta una RAYA, nunca un número: un 0 aquí sería mentira (no es que
 * haya cero, es que aún no se mide). Cuando llegue su fase se sustituye por una `TarjetaMetrica` en
 * el mismo hueco, sin tocar la maqueta.
 */
export function TarjetaProximamente({ etiqueta, fase }: { etiqueta: string; fase?: number }) {
  return (
    <div className="rounded-sm border border-dashed border-line bg-surface/30 p-5">
      <p className="text-3xl leading-none text-text-dim" style={ESTILO_CIFRA}>
        —
      </p>
      <p className="mt-2 text-2xs font-semibold tracking-widest text-text-dim uppercase">
        {etiqueta}
      </p>
      <p className="mt-1 text-2xs tracking-widest text-text-dim uppercase">
        {fase === undefined ? "Próximamente" : `Próximamente · Fase ${fase}`}
      </p>
    </div>
  );
}

/**
 * RANURA grande para un bloque que aún no existe (una gráfica, una lista de reportes...). Reserva el
 * SITIO y dice qué irá aquí y cuándo, sin dibujar datos falsos: cuando llegue la fase se rellena por
 * dentro y la pantalla no se rediseña.
 */
export function RanuraProximamente({
  titulo,
  descripcion,
  fase,
  alto = "h-48",
}: {
  titulo: string;
  descripcion: string;
  fase: number;
  /** Altura reservada, para que el hueco tenga ya el tamaño que tendrá con datos. */
  alto?: string;
}) {
  return (
    <section className="rounded-sm border border-dashed border-line bg-surface/30 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-text">{titulo}</h3>
        <span className="rounded-full border border-line px-2 py-0.5 text-2xs font-semibold tracking-widest text-text-dim uppercase">
          Próximamente · Fase {fase}
        </span>
      </div>
      <p className="mt-1 text-sm text-text-dim">{descripcion}</p>
      <div
        className={`mt-4 grid ${alto} place-items-center rounded-sm border border-line/60 bg-void/20 text-2xs tracking-widest text-text-dim uppercase`}
      >
        Sin datos todavía
      </div>
    </section>
  );
}
