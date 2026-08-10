import { RankingVistas } from "./ranking-vistas";

export const metadata = { title: "Ranking · DareFlash" };

/**
 * RANKING — re-maquetado a lo ancho (Rama C). Vive dentro del shell (barra lateral + superior +
 * region ancha); contenedor coherente con la portada (`max-w-7xl` + mismo padding) para que el ancho
 * case con /inicio. El encabezado, el conmutador de dos vistas, el PODIO del top-3 (color por puesto
 * + geometria) y la lista del 4 en adelante los monta `RankingVistas`. Datos de PRUEBA; sin backend.
 */
export default function RankingPage() {
  return (
    <div className="relative mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      {/* ATMÓSFERA v2: glow --df-glow-accion MUY tenue detrás del contenido. NO es un magenta de
          acción (no hay botón): da profundidad y color para que el glass (bg-surface/60 +
          backdrop-blur + sombras) LEA sobre el fondo plano, en vez de verse como v1. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <RankingVistas />
    </div>
  );
}
