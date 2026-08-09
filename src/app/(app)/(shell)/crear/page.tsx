import { FormularioCrear } from "./formulario-crear";

export const metadata = { title: "Crear · DareFlash" };

/**
 * CREAR (Paso C · unidad 5) — boceto 4 + tratamiento del brief. Reemplaza el stub. "Subir tu vídeo":
 * zona de video (placeholder, máx. 90 s) + formulario (Campo Título + Categoría) + Publicar. Maqueta
 * sin backend; validacion de cliente. Un solo magenta de contenido (Publicar) + el [+] de la nav.
 */
export default function CrearPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <h1
        className="mb-5 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        Subir tu vídeo
      </h1>
      <FormularioCrear />
    </div>
  );
}
