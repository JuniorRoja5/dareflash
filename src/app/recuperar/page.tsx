import Link from "next/link";

import { FormularioRecuperar } from "./formulario-recuperar";

export const metadata = { title: "Recuperar contraseña · DareFlash" };

const estiloDisplay = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 780, "wdth" 118',
} as const;

/**
 * RECUPERAR (/recuperar) — ruta SUELTA, fuera del grupo (app), sin nav (como /entrar, /verify y
 * /unlock). Destino del enlace "He olvidado mi contraseña" de /entrar: pide el correo y, si esa
 * cuenta existe, envía un enlace de un solo uso a /restablecer.
 *
 * Marca (brief v2): fondo void con glow magenta ambiental y tarjeta glass. UNA sola acción magenta
 * (la del formulario). La respuesta es UNIFORME (sin enumeración): el mismo mensaje exista o no la
 * cuenta, para no revelar qué direcciones tienen cuenta.
 */
export default function RecuperarPage() {
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
          Recuperar contraseña
        </h1>
        <p className="mb-6 text-sm text-text-dim">
          Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.
        </p>
        <FormularioRecuperar />
        <p className="mt-6 text-sm text-text-dim">
          ¿Ya te acuerdas?{" "}
          <Link
            href="/entrar"
            className="rounded-xs font-medium text-text underline underline-offset-2"
          >
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
