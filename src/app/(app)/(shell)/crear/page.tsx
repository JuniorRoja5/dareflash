import { LanzadorSubida } from "./lanzador-subida";

export const metadata = { title: "Crear · DareFlash" };

/**
 * CREAR — "Subir tu vídeo" por libre. La subida vive en el `ModalSubida` reutilizable (mismo modal que
 * usan "Participar" en un reto y otras entradas); esta ruta ofrece el CTA que lo abre sin `challengeId`.
 * Columna centrada de ancho cómodo, con panel en `lg` (glass + sombra suave); en móvil ocupa la columna.
 */
export default function CrearPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 lg:px-8 lg:py-12">
      <h1
        className="mb-3 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        Subir tu vídeo
      </h1>
      <p className="mb-6 text-sm text-text-dim">
        Comparte tu vídeo (máx. 90 segundos). Se procesa y aparece en tu perfil cuando esté listo.
      </p>
      <div className="df-rise lg:rounded-sm lg:border lg:border-line lg:bg-surface/60 lg:p-8 lg:shadow-[var(--df-shadow-md)] lg:backdrop-blur-md">
        <LanzadorSubida />
      </div>
    </div>
  );
}
