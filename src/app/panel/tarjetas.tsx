import { ImportePremio } from "@/components/ui/importe-premio";

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

/**
 * Métrica REAL: número grande (tabular) + etiqueta. CUENTA COSAS, y por eso es neutra.
 *
 * TUVO UN `acento` que la pintaba de `--df-money`, pensado "para cuando haya dinero". Cuando llegó el
 * dinero resultó que no servía: un importe no es un número grande con otro color, es céntimos
 * formateados con la primitiva del dinero. Nadie lo usó nunca, así que se ha ido — un permiso
 * aparcado "para el futuro" es el camino más corto a pintar un recuento con el color del dinero. Para
 * importes está `TarjetaDinero`.
 */
export function TarjetaMetrica({
  valor,
  etiqueta,
  nota,
}: {
  valor: number;
  etiqueta: string;
  /** Matiz opcional bajo la cifra (p.ej. de qué se está contando exactamente). */
  nota?: string;
}) {
  return (
    <div className="rounded-sm border border-line bg-surface/60 p-5 shadow-[var(--df-shadow-md)]">
      <p className="text-3xl leading-none tabular-nums text-text" style={ESTILO_CIFRA}>
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
 * Métrica de DINERO. Céntimos enteros, nunca un número suelto: un importe pintado con
 * `toLocaleString` se lee como una cantidad de cosas, y "5000" no es cinco mil euros.
 *
 * LA CIFRA LA PINTA `ImportePremio`, la primitiva del dinero del producto (Archivo Expanded,
 * `--df-money`, el entero mandando sobre símbolo y céntimos). Así el importe se ve IGUAL en el panel
 * que en el monedero del usuario y que en el premio de un reto; con un tamaño escrito aquí a mano,
 * serían tres tratamientos del dinero libres de separarse.
 */
export function TarjetaDinero({
  cents,
  etiqueta,
  nota,
}: {
  cents: number;
  etiqueta: string;
  nota?: string;
}) {
  return (
    <div className="rounded-sm border border-line bg-surface/60 p-5 shadow-[var(--df-shadow-md)]">
      <ImportePremio cents={cents} tamano="tarjeta" className="block" />
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
 *
 * Y CUANDO LLEGA SU FASE, SE VA. Un `próximamente` que sobrevive a la fase que prometía dice "aún no
 * se mide" sobre algo que ya se mide, o sea que miente igual que una cifra inventada y encima parece
 * honesto. Pasó con "Premios pagados · Fase 7", que siguió ahí con el monedero ya construido.
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
