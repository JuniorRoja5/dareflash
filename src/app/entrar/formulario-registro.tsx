"use client";

import { type FormEvent, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";

/**
 * FORMULARIO de registro (isla cliente). POST /api/auth/register { email, password, birthDate }
 * (JSON). La validación del formulario es solo UX; el SERVIDOR es el gate (edad, unicidad, política de
 * contraseña). La respuesta del endpoint es UNIFORME (sin enumeración): tanto si el correo es nuevo
 * como si ya existía, contesta "te hemos enviado un correo de verificación" -> aquí NO se redirige ni
 * se inicia sesión: se pide al usuario que confirme su correo. Cada error se MAPEA a copy humano.
 */
type Estado = "idle" | "enviando" | "hecho";

/** Lee `error.code` de la respuesta del endpoint de forma defensiva. */
function codigoDe(data: unknown): string {
  if (typeof data === "object" && data && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "object" && err && "code" in err) {
      return String((err as { code?: unknown }).code ?? "");
    }
  }
  return "";
}

/** Mapea (status, code) a copy humano. El 400 es genérico (edad/correo/contraseña) -> pista útil. */
function mensajeError(status: number, code: string): string {
  if (status === 429 || code === "RATE_LIMITED") return "Demasiados intentos, espera un momento.";
  if (status === 503 || code === "OVERLOADED")
    return "El servicio está ocupado. Reinténtalo en unos segundos.";
  if (status === 400)
    return "Revisa el correo, una contraseña de 8+ caracteres y que tengas al menos 16 años.";
  return "No se pudo crear la cuenta. Reintenta.";
}

export function FormularioRegistro() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nacimiento, setNacimiento] = useState("");
  const [verVisible, setVerVisible] = useState(false);
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState("");

  const ocupado = estado === "enviando";

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setEstado("enviando");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, birthDate: nacimiento }),
      });
      if (res.ok) {
        setEstado("hecho"); // respuesta uniforme: revisa tu correo (sin sesión ni redirección)
        return;
      }
      const data: unknown = await res.json().catch(() => ({}));
      setError(mensajeError(res.status, codigoDe(data)));
      setEstado("idle");
    } catch {
      setError("No se pudo crear la cuenta. Reintenta.");
      setEstado("idle");
    }
  }

  // ÉXITO: mensaje uniforme (no revela si el correo ya tenía cuenta). El usuario verifica por email.
  if (estado === "hecho") {
    return (
      <div
        role="status"
        className="rounded-sm border border-line bg-surface/60 p-4 text-sm text-text-dim"
      >
        <p className="mb-1 font-medium text-text">Revisa tu correo.</p>
        Si la dirección es válida, te hemos enviado un enlace de verificación. Ábrelo para activar
        tu cuenta y poder entrar.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Campo
        id="registro-email"
        label="Correo"
        type="email"
        autoComplete="email"
        required
        placeholder="tu@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={ocupado}
      />

      <Campo
        id="registro-password"
        label="Contraseña"
        type={verVisible ? "text" : "password"}
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={ocupado}
        adorno={
          <button
            type="button"
            onClick={() => setVerVisible((v) => !v)}
            disabled={ocupado}
            aria-label={verVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="grid h-8 w-8 place-items-center rounded-xs text-text-dim transition-colors duration-150 ease-mechanical hover:text-text"
          >
            <IconoOjo abierto={verVisible} />
          </button>
        }
      />

      <Campo
        id="registro-nacimiento"
        label="Fecha de nacimiento"
        type="date"
        autoComplete="bday"
        required
        value={nacimiento}
        onChange={(e) => setNacimiento(e.target.value)}
        disabled={ocupado}
      />

      {error ? (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      ) : null}

      {/* ÚNICA acción magenta de la vista de registro: plano + realce --df-cta-lift. */}
      <Boton
        type="submit"
        variante="principal"
        disabled={ocupado}
        className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
      >
        {ocupado ? "Creando…" : "Crear cuenta"}
      </Boton>

      <p className="text-xs text-text-dim">
        Debes tener al menos 16 años. Te enviaremos un correo para verificar tu cuenta.
      </p>
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
