"use client";

/**
 * TARJETA de verificacion de email (/verify) — identidad v2: tarjeta glass sobre el void con glow
 * (el fondo lo aporta `page.tsx`), tipografia display, primitivas `Boton`/`Campo`. Como en
 * `/entrar`, UNA sola accion magenta por vista (el boton principal del estado activo); el resto de
 * botones son secundarios (filete).
 *
 * LOGICA INTACTA (Rama 4 es solo rebrand, no toca el contrato con el backend):
 *  - El token NO se consume en el GET: se muestra un BOTON que hace POST a /api/auth/verify. Es
 *    deliberado (Pieza 3): los escaneres de correo hacen prefetch de los enlaces y consumirian un
 *    token de un solo uso antes de que el usuario pulse.
 *  - Estados: sin-token / listo / enviando / ok / error — mismos nombres, misma maquina de estados.
 *  - El error NO distingue "ya verificado" de "token invalido/caducado" (seria un oraculo, abre
 *    enumeracion): se cubre con TEXTO, igual que antes.
 *  - Reenvio: POST a /api/auth/resend-verification con respuesta UNIFORME (sin enumeracion) y el
 *    mismo trato especial del 429 (el rate-limit se evalua antes del lookup, asi que el 429 es
 *    identico para una direccion real y una inventada).
 */
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";

const estiloDisplay = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 780, "wdth" 118',
} as const;

type Estado = "sin-token" | "listo" | "enviando" | "ok" | "error";

export function TarjetaVerificacion() {
  const token = useSearchParams().get("token");
  const [estado, setEstado] = useState<Estado>(token ? "listo" : "sin-token");
  const [mensaje, setMensaje] = useState("");

  async function verificar() {
    if (!token) return;
    setEstado("enviando");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      const msg = typeof data === "object" && data && "message" in data ? String(data.message) : "";
      if (res.ok) {
        setMensaje(msg || "Cuenta verificada. Ya puedes iniciar sesion.");
        setEstado("ok");
      } else {
        setMensaje(msg || "El enlace de verificacion es invalido o ha caducado.");
        setEstado("error");
      }
    } catch {
      setMensaje("No se pudo conectar. Intentalo de nuevo mas tarde.");
      setEstado("error");
    }
  }

  return (
    <div className="df-rise relative w-full max-w-md overflow-hidden rounded-lg border border-line bg-surface p-8 shadow-[var(--df-shadow-lg)] sm:p-10">
      <h1 className="mb-1.5 text-3xl text-text" style={estiloDisplay}>
        Verificar tu cuenta
      </h1>

      {estado === "sin-token" && (
        <p className="mt-4 text-sm text-text-dim">
          Falta el token en el enlace. Abre el enlace completo del correo de verificación.
        </p>
      )}

      {(estado === "listo" || estado === "enviando") && (
        <>
          <p className="mb-6 mt-1.5 text-sm text-text-dim">
            Pulsa el botón para confirmar tu dirección de correo.
          </p>
          {/* ÚNICA acción magenta de la vista: plano (magenta sólido) + realce --df-cta-lift. */}
          <Boton
            type="button"
            variante="principal"
            onClick={verificar}
            disabled={estado === "enviando"}
            className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
          >
            {estado === "enviando" ? "Verificando…" : "Verificar mi cuenta"}
          </Boton>
        </>
      )}

      {estado === "ok" && (
        <>
          <p role="status" className="mb-6 mt-1.5 text-sm text-ok">
            {mensaje}
          </p>
          <Boton href="/" variante="secundario" className="w-full">
            Volver al inicio
          </Boton>
        </>
      )}

      {estado === "error" && (
        <>
          <p role="alert" className="mb-3 mt-1.5 text-sm text-alarm">
            {mensaje}
          </p>
          {/* El token es de UN SOLO USO: quien ya verifico y refresca /verify cae aqui. No se puede
              distinguir "ya verificado" de "token invalido" sin un oraculo (seria enumeracion), asi
              que se cubre con TEXTO. */}
          <p className="mb-6 text-sm text-text-dim">
            Si ya has verificado tu cuenta, este enlace deja de funcionar: puedes iniciar sesión
            directamente.
          </p>
          <Reenviar />
        </>
      )}
    </div>
  );
}

/** Reenvio del correo de verificacion (enlace caducado/invalido). Pide el email porque el token
 *  ya no sirve para identificar la cuenta. Respuesta uniforme (sin enumeracion), como el endpoint. */
function Reenviar() {
  const [email, setEmail] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function reenviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        // Respuesta UNIFORME: no revela si la cuenta existe (sin enumeracion).
        setResultado("Si corresponde, te hemos reenviado el correo de verificación.");
      } else if (res.status === 429) {
        // Mostrar el 429 NO abre enumeracion: en resend-verification/route.ts los dos rateLimit()
        // se evaluan ANTES del findUnique, asi que el 429 es IDENTICO para una direccion real y
        // una inventada. No revela nada. No "arreglarlo" ocultandolo.
        setResultado("Demasiados intentos. Intenta más tarde.");
      } else {
        setResultado("No se pudo conectar. Inténtalo de nuevo más tarde.");
      }
    } catch {
      setResultado("No se pudo conectar. Inténtalo de nuevo más tarde.");
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <p
        role="status"
        className="rounded-sm border border-line bg-surface/60 p-3 text-sm text-text-dim"
      >
        {resultado}
      </p>
    );
  }

  return (
    <form onSubmit={reenviar} noValidate className="flex flex-col gap-4">
      <Campo
        id="verify-reenviar-email"
        label="Reenviar el correo de verificación"
        type="email"
        autoComplete="email"
        required
        placeholder="tu@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={enviando}
      />
      <Boton type="submit" variante="secundario" disabled={enviando} className="w-full">
        {enviando ? "Enviando…" : "Reenviar"}
      </Boton>
    </form>
  );
}
