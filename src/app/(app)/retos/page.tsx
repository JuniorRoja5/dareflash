import { FeedRetos } from "./feed-retos";

export const metadata = { title: "Retos · DareFlash" };

/**
 * RETOS — el feed (Paso C · unidad 2). Estructura del boceto 2 ("Retos activos"): encabezado + fila
 * de filtros + lista de tarjetas. Tratamiento del brief: el marcador manda por jerarquia, geometria
 * severa, un solo magenta (el [+] de la nav). Datos de PRUEBA; sin backend (Bunny/datos reales
 * llegan despues).
 */
export default function RetosPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1
        className="mb-5 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        Retos activos
      </h1>
      <FeedRetos />
    </div>
  );
}
