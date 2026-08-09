import { RankingVistas } from "./ranking-vistas";

export const metadata = { title: "Ranking · DareFlash" };

/**
 * TOPRANKING (Paso C · unidad 4) — boceto 5 + tratamiento del brief. Encabezado + conmutador de dos
 * vistas + lista numerada. El oro del podio y los puntos neutros viajan con la primitiva
 * `FilaPuesto`; el conmutador y el resaltado del usuario son estado de cliente. Un solo magenta en
 * pantalla: el [+] de la nav (cero magenta de contenido). Datos de PRUEBA; sin backend.
 */
export default function RankingPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1
        className="mb-5 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        TopRanking
      </h1>
      <RankingVistas />
    </div>
  );
}
