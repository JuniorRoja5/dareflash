"use client";

import { type FormEvent, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/**
 * CAMBIAR CONTRASEÑA (isla cliente) — sección del perfil para un usuario logueado. POST al endpoint
 * EXISTENTE /api/auth/change-password (mutatingRoute: Origin + sesión + CSRF). La validación de aquí
 * es solo UX (nueva == confirmar; pista de longitud); el SERVIDOR es el gate: verifica la actual y
 * aplica la MISMA política fuerte a la nueva. Los errores se muestran con COPY HUMANO; cuando el
 * servidor rechaza (política débil o contraseña actual incorrecta) se MUESTRA SU MENSAJE.
 */
type Estado = "idle" | "enviando" | "hecho";

export function CambiarPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verNueva, setVerNueva] = useState(false);
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState("");

  const ocupado = estado === "enviando";

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    // UX: coincidencia y pista de longitud (el servidor manda la fuerza real).
    if (nueva !== confirmar) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }
    if (nueva.length < 10) {
      setError("La nueva contraseña debe tener al menos 10 caracteres.");
      return;
    }
    setEstado("enviando");
    try {
      const r = await postJsonCsrf("/api/auth/change-password", {
        currentPassword: actual,
        newPassword: nueva,
      });
      if (r.ok) {
        setEstado("hecho");
        setActual("");
        setNueva("");
        setConfirmar("");
        return;
      }
      if (r.status === 429) {
        setError("Demasiados intentos. Espera un momento.");
      } else if (r.status === 503) {
        setError("El servicio está ocupado. Reinténtalo en unos segundos.");
      } else if (r.status === 403 || r.status === 400) {
        // 403 = contraseña actual incorrecta; 400 = política débil. En ambos el servidor da el copy.
        setError(mensajeDe(r.data) || "No se pudo cambiar la contraseña. Revisa los datos.");
      } else {
        setError("No se pudo cambiar la contraseña. Reintenta.");
      }
      setEstado("idle");
    } catch (err) {
      setError(
        err instanceof Error && err.message === "SIN_SESION"
          ? "Tu sesión ha caducado. Vuelve a iniciar sesión."
          : "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
      );
      setEstado("idle");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="df-rise rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md"
    >
      <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">Contraseña</h2>

      <div className="mt-4 flex flex-col gap-5">
        <Campo
          id="pw-actual"
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          required
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          disabled={ocupado}
        />
        <Campo
          id="pw-nueva"
          label="Nueva contraseña"
          type={verNueva ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={10}
          placeholder="Mínimo 10 caracteres"
          value={nueva}
          onChange={(e) => {
            setNueva(e.target.value);
            if (estado === "hecho") setEstado("idle");
          }}
          disabled={ocupado}
          adorno={
            <button
              type="button"
              onClick={() => setVerNueva((v) => !v)}
              disabled={ocupado}
              aria-label={verNueva ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="grid h-8 w-8 place-items-center rounded-xs text-text-dim transition-colors duration-150 ease-mechanical hover:text-text"
            >
              <IconoOjo abierto={verNueva} />
            </button>
          }
        />
        <Campo
          id="pw-confirmar"
          label="Repite la nueva contraseña"
          type={verNueva ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          disabled={ocupado}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alarm">
          {error}
        </p>
      ) : null}

      {/* Única acción magenta de esta tarjeta. */}
      <Boton
        type="submit"
        variante="principal"
        disabled={ocupado}
        className="mt-5 w-full py-3.5 shadow-[var(--df-cta-lift)]"
      >
        {ocupado ? "Cambiando…" : "Cambiar contraseña"}
      </Boton>

      {estado === "hecho" ? (
        <p role="status" className="mt-3 text-center text-sm text-ok">
          Contraseña cambiada.
        </p>
      ) : null}
    </form>
  );
}

/** Icono ojo abierto / tachado (mostrar u ocultar la contraseña). SVG inline, trazo de marca. */
function IconoOjo({ abierto }: { abierto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {abierto ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6.5 0 10 6 10 6a15.7 15.7 0 0 1-3.3 3.9M6 6.3A15.8 15.8 0 0 0 2 12s3.5 7 10 7a9.4 9.4 0 0 0 4-.9" />
        </>
      )}
    </svg>
  );
}
