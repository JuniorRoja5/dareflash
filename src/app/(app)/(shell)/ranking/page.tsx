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
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <RankingVistas />
    </div>
  );
}
