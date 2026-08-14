"use client";

import { useState } from "react";

import { Boton } from "@/components/ui/boton";

import { FormularioLogin } from "./formulario-login";
import { FormularioRegistro } from "./formulario-registro";

/**
 * TARJETA DE ACCESO — login y registro en la MISMA superficie (/entrar), con un TOGGLE.
 *
 * ESCRITORIO (lg+): tarjeta deslizante. Los dos formularios ocupan cada mitad; un panel oscuro de
 * bienvenida (void + glow) se desliza sobre la mitad inactiva, TAPANDO el formulario anterior y
 * revelando el otro. La ÚNICA acción magenta la aporta el formulario activo ("Iniciar sesión" o
 * "Crear cuenta"); el botón del panel oscuro es secundario (solo cambia de vista, no envía nada).
 *
 * MÓVIL: sin deslizamiento (una sola columna). Se muestra el formulario activo y un enlace de texto
 * cambia a la otra vista. Misma marca, más simple.
 *
 * `motion-reduce:transition-none` respeta a quien pide menos movimiento: el cambio es instantáneo,
 * pero la posición final (transform) se mantiene, así que la tarjeta nunca queda descuadrada.
 */
const estiloDisplay = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 780, "wdth" 118',
} as const;

export function TarjetaAcceso() {
  const [modo, setModo] = useState<"login" | "registro">("login");
  const activo = modo === "registro";
  const irLogin = () => setModo("login");
  const irRegistro = () => setModo("registro");

  return (
    <div className="df-rise relative w-full max-w-4xl overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--df-shadow-lg)] lg:min-h-[640px]">
      {/* ===================== FORMULARIO: LOGIN ===================== */}
      {/* Móvil: visible solo cuando NO estamos en registro. Escritorio: mitad derecha, se atenúa. */}
      <div
        className={`p-8 sm:p-10 lg:absolute lg:inset-y-0 lg:left-1/2 lg:z-10 lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:p-10 xl:p-14 lg:transition-[opacity,transform] lg:duration-500 lg:ease-mechanical motion-reduce:lg:transition-none ${
          activo
            ? "hidden lg:flex lg:pointer-events-none lg:opacity-0"
            : "block lg:flex lg:opacity-100"
        }`}
      >
        <div className="lg:mx-auto lg:w-full lg:max-w-sm">
          <h1 className="mb-1.5 text-3xl text-text" style={estiloDisplay}>
            Iniciar sesión
          </h1>
          <p className="mb-6 text-sm text-text-dim">
            Entra para votar, comentar y subir tus retos.
          </p>
          <FormularioLogin />
          {/* Toggle SOLO móvil (en escritorio lo aporta el panel oscuro). */}
          <p className="mt-6 text-sm text-text-dim lg:hidden">
            ¿Nuevo por aquí?{" "}
            <button
              type="button"
              onClick={irRegistro}
              className="rounded-xs font-medium text-text underline underline-offset-2"
            >
              Crear cuenta
            </button>
          </p>
        </div>
      </div>

      {/* ===================== FORMULARIO: REGISTRO ===================== */}
      {/* Móvil: visible solo en registro. Escritorio: mitad izquierda, se atenúa cuando no está activo. */}
      <div
        className={`p-8 sm:p-10 lg:absolute lg:inset-y-0 lg:left-0 lg:z-10 lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:p-10 xl:p-14 lg:transition-[opacity,transform] lg:duration-500 lg:ease-mechanical motion-reduce:lg:transition-none ${
          activo
            ? "block lg:flex lg:opacity-100"
            : "hidden lg:flex lg:pointer-events-none lg:opacity-0"
        }`}
      >
        <div className="lg:mx-auto lg:w-full lg:max-w-sm">
          <h1 className="mb-1.5 text-3xl text-text" style={estiloDisplay}>
            Crear cuenta
          </h1>
          <p className="mb-6 text-sm text-text-dim">
            Únete y compite por premios de verdad. Es gratis.
          </p>
          <FormularioRegistro />
          <p className="mt-6 text-sm text-text-dim lg:hidden">
            ¿Ya tienes cuenta?{" "}
            <button
              type="button"
              onClick={irLogin}
              className="rounded-xs font-medium text-text underline underline-offset-2"
            >
              Iniciar sesión
            </button>
          </p>
        </div>
      </div>

      {/* ===================== PANEL DESLIZANTE (SOLO ESCRITORIO) ===================== */}
      {/* Base en la mitad izquierda (tapa registro). Cuando activo -> se desliza a la derecha (tapa
          login). z por encima de los formularios para cubrirlos. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-1/2 overflow-hidden transition-transform duration-500 ease-mechanical motion-reduce:transition-none lg:block ${
          activo ? "translate-x-full" : "translate-x-0"
        }`}
      >
        <div className="absolute inset-0 bg-void" />
        <div className="absolute inset-0" style={{ background: "var(--df-glow-accion)" }} />
        {/* Bisel interior tenue hacia el formulario (da profundidad al corte). */}
        <div className="absolute inset-y-0 right-0 w-px bg-line/60" />

        {/* El contenido cambia de lado con el panel: el botón (secundario) solo alterna la vista. */}
        <div className="pointer-events-auto relative flex h-full flex-col items-center justify-center gap-5 p-10 text-center xl:p-14">
          <h2 className="text-3xl text-text" style={estiloDisplay}>
            {activo ? "¿Ya tienes cuenta?" : "¿Nuevo por aquí?"}
          </h2>
          <p className="max-w-[26ch] text-text-dim">
            {activo
              ? "Inicia sesión y sigue compitiendo por premios de verdad."
              : "Únete y compite por premios de verdad. Creas tu cuenta en segundos."}
          </p>
          <Boton variante="secundario" onClick={activo ? irLogin : irRegistro}>
            {activo ? "Iniciar sesión" : "Crear cuenta"}
          </Boton>
        </div>
      </div>
    </div>
  );
}
