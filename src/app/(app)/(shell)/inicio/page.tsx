export const metadata = { title: "Inicio · DareFlash" };

/**
 * INICIO (portada de escritorio) — PLACEHOLDER. El enrutado raiz ya manda escritorio aqui; la portada
 * real (rejilla ancha multicolumna: destacados, top ranking, etc.) se construye en la Rama B. Aqui
 * solo se demuestra que el shell existe y aprovecha el ancho.
 */
export default function InicioPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
      <h1
        className="text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        Inicio
      </h1>
      <p className="mt-3 max-w-prose text-sm text-text-dim">
        Portada de escritorio en construcción (Rama B): aquí irá la rejilla ancha con destacados,
        retos del momento y un vistazo al TopRanking. De momento, el shell (barra lateral + barra
        superior + región ancha) ya está en su sitio.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="flex h-40 items-center justify-center rounded-sm border border-line bg-surface text-2xs uppercase tracking-widest text-text-dim"
          >
            Bloque {n}
          </div>
        ))}
      </div>
    </div>
  );
}
