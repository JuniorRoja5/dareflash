/**
 * Sección PLACEHOLDER del panel (honesta): título + qué hará + estado "En construcción · Fase N". CERO
 * datos falsos (ni saldos, ni listas, ni conteos inventados): solo estructura y propósito. Su fase
 * futura la implementará. Hereda el guard y el noindex del layout del panel.
 */
export function Placeholder({
  titulo,
  descripcion,
  fase,
}: {
  titulo: string;
  descripcion: string;
  fase: number;
}) {
  return (
    <div className="df-rise">
      <div className="flex flex-wrap items-center gap-3">
        <h1
          className="text-2xl leading-none text-text"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 720, "wdth" 112',
          }}
        >
          {titulo}
        </h1>
        <span className="rounded-full border border-line px-3 py-0.5 text-2xs font-semibold tracking-widest text-text-dim uppercase">
          En construcción · Fase {fase}
        </span>
      </div>
      <p className="mt-3 max-w-prose text-sm text-text-dim">{descripcion}</p>
      <div className="mt-6 rounded-sm border border-dashed border-line bg-surface/40 p-8 text-center text-sm text-text-dim">
        Esta sección aún no está disponible. Llegará en la Fase {fase}.
      </div>
    </div>
  );
}
