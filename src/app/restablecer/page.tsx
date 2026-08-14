import { FormularioRestablecer } from "./formulario-restablecer";

export const metadata = { title: "Restablecer contraseña · DareFlash" };

const estiloDisplay = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 780, "wdth" 118',
} as const;

/**
 * RESTABLECER (/restablecer?token=...) — ruta SUELTA, fuera del grupo (app), sin nav (como /entrar,
 * /verify y /unlock). Destino del enlace del correo de recuperación: el usuario elige aquí su
 * contraseña nueva.
 *
 * ANTI-PREFETCH: el GET solo MUESTRA la página (no consume el token); el botón hace POST a
 * /api/auth/reset-password y ahí se consume (un solo uso). Los escáneres de correo hacen prefetch
 * del enlace y, sin esto, quemarían el token antes del clic (misma lección que /verify y /unlock).
 *
 * Marca (brief v2): fondo void con glow magenta ambiental y tarjeta glass. UNA sola acción magenta.
 */
export default function RestablecerPage() {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-void px-4 py-10">
      {/* Glow ambiental de marca (muy tenue) detrás de la tarjeta. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <div className="df-rise relative w-full max-w-md rounded-lg border border-line bg-surface p-8 shadow-[var(--df-shadow-lg)] sm:p-10">
        <h1 className="mb-1.5 text-3xl text-text" style={estiloDisplay}>
          Nueva contraseña
        </h1>
        <FormularioRestablecer />
      </div>
    </main>
  );
}
