import { FormularioCrear } from "./formulario-crear";

export const metadata = { title: "Crear · DareFlash" };

/**
 * CREAR (boceto 4; tratamiento desktop en la Rama F) — "Subir tu vídeo": zona de vídeo (placeholder,
 * máx. 90 s) + formulario (Campo Título + Categoría) + Publicar. Maqueta sin backend; validación de
 * cliente. Un solo magenta de contenido (Publicar).
 *
 * Un formulario NO se estira a lo ancho (líneas larguísimas se leen fatal): el tratamiento de
 * escritorio es una COLUMNA CENTRADA de ancho cómodo (`max-w-xl`, no `max-w-7xl`), con el mismo
 * padding vertical que las demás secciones (sin escalón), y un ENCUADRE en `lg` (panel: superficie +
 * filete, sin sombra) para que se lea como una tarea enfocada en la región ancha. En móvil, SIN panel
 * (el form ocupa la columna, como hoy). Todo el tratamiento vive aquí: `formulario-crear.tsx` no se
 * toca (es el fichero que la subida de Bunny reescribe; así el rebase no tiene conflicto).
 */
export default function CrearPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 lg:px-8 lg:py-12">
      <h1
        className="mb-5 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        Subir tu vídeo
      </h1>
      {/* Panel v2 (SOLO en lg, como hoy): glass + sombra suave; en movil el form ocupa la columna
          sin panel. La piel vive AQUI; formulario-crear.tsx no se toca (lo reescribe Bunny). */}
      <div className="df-rise lg:rounded-sm lg:border lg:border-line lg:bg-surface/60 lg:p-8 lg:shadow-[var(--df-shadow-md)] lg:backdrop-blur-md">
        <FormularioCrear />
      </div>
    </div>
  );
}
