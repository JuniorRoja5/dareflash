import { TarjetaAcceso } from "./tarjeta-acceso";

export const metadata = { title: "Iniciar sesión · DareFlash" };

/**
 * ACCESO (/entrar) — ruta SUELTA, fuera del grupo (app), sin nav (como /verify y /unlock). Es el
 * destino al que se manda a un anónimo que intenta una acción protegida (votar, comentar, crear reto,
 * subir vídeo): la plataforma se ve como invitado, pero INTERACTUAR exige entrar.
 *
 * Login y registro conviven en la misma tarjeta con un TOGGLE (ver `TarjetaAcceso`): en escritorio un
 * panel oscuro se desliza y revela el otro formulario; en móvil, un enlace cambia de vista. Marca
 * (brief v2): fondo void con glow magenta ambiental y tarjeta glass. UNA sola acción magenta por
 * vista (la del formulario activo). El reset de contraseña es una pieza siguiente (enlace listo).
 */
export default function EntrarPage() {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-void px-4 py-10">
      {/* Glow ambiental de marca (muy tenue) detrás de la tarjeta. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <TarjetaAcceso />
    </main>
  );
}
