import { PieLegal } from "@/components/ui/pie-legal";

import { TarjetaAcceso } from "./tarjeta-acceso";

export const metadata = { title: "Iniciar sesión · DareFlash" };

/**
 * ACCESO (/entrar) — ruta SUELTA, fuera del grupo (app), sin nav (como /verify y /unlock). Es el
 * destino al que se manda a un anónimo que intenta una acción protegida (votar, comentar, crear reto,
 * subir vídeo): la plataforma se ve como invitado, pero INTERACTUAR exige entrar.
 *
 * Login y registro conviven en la misma tarjeta con un TOGGLE (ver `TarjetaAcceso`): en escritorio un
 * panel oscuro se desliza y revela el otro formulario; en móvil, un enlace cambia de vista. Marca
 * (brief v2): fondo void con glow de acción ambiental y tarjeta glass. UNA sola acción principal por
 * vista (la del formulario activo). El reset de contraseña es una pieza siguiente (enlace listo).
 */
export default function EntrarPage() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-void">
      {/* Glow ambiental de marca (muy tenue) detrás de la tarjeta. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <main className="relative grid flex-1 place-items-center px-4 py-10">
        <TarjetaAcceso />
      </main>
      {/* EL PIE AQUÍ NO ES DECORACIÓN: esta es la pantalla donde se pide el consentimiento, así que
          es donde más falta hace poder abrir la política. Sin barra inferior: /entrar está fuera del
          grupo `(app)`. */}
      <PieLegal />
    </div>
  );
}
