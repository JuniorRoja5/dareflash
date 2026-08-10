import { FeedRetos } from "./feed-retos";

export const metadata = { title: "Retos · DareFlash" };

/**
 * RETOS — el feed (Paso C · unidad 2, re-maquetado a lo ancho en la Rama E). Estructura del boceto 2
 * ("Retos activos"): encabezado + fila de filtros + rejilla de tarjetas. Dentro del (shell), mismo
 * contenedor que portada/ranking/perfil (`max-w-7xl` + mismo padding) para que el ancho case entre
 * pantallas. Tratamiento del brief: el marcador manda; "Participar" secundario, sin magenta de
 * contenido. Datos de PRUEBA; sin backend.
 */
export default function RetosPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      {/* El UNICO magenta de accion de la pantalla es "Crear reto" del cromo (top bar en escritorio,
          nav [+] en movil): no se repite aqui. "Participar" en cada tarjeta es secundario. */}
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
