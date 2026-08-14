"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";

/**
 * FORMULARIO de inicio de sesión (isla cliente). POST /api/auth/login { email, password } (JSON). La
 * validación del formulario es solo UX; el SERVIDOR es el gate (no hay lógica de auth aquí). Cada
 * error del endpoint se MAPEA a un mensaje HUMANO (nunca códigos crudos ni 401/CSRF al usuario) y, por
 * SEGURIDAD, credenciales malas dan el MISMO mensaje para email inexistente y contraseña mala (sin
 * revelar si el correo existe). Éxito -> "/".
 */
type Estado = "idle" | "enviando";

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

/** Mapea (status, code) a copy humano. EMAIL_NOT_VERIFIED se trata aparte (con reenvío). */
function mensajeError(status: number, code: string): string {
  if (status === 429 || code === "RATE_LIMITED") return "Demasiados intentos, espera un momento.";
  if (status === 503 || code === "OVERLOADED")
    return "El servicio está ocupado. Reinténtalo en unos segundos.";
  // Credenciales malas = MISMO mensaje para email inexistente y contraseña incorrecta (sin enumeración).
  if (status === 401 || code === "INVALID_CREDENTIALS") return "Correo o contraseña incorrectos.";
  if (status === 400) return "Revisa el correo y la contraseña.";
  return "No se pudo iniciar sesión. Reintenta.";
}

export function FormularioLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verVisible, setVerVisible] = useState(false);
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState("");
  const [sinVerificar, setSinVerificar] = useState(false);
  const [reenviado, setReenviado] = useState<string | null>(null);

  const ocupado = estado === "enviando";

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setSinVerificar(false);
    setReenviado(null);
    setEstado("enviando");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        router.push("/"); // éxito -> Inicio
        router.refresh();
        return;
      }
      const data: unknown = await res.json().catch(() => ({}));
      const code = codigoDe(data);
      if (code === "EMAIL_NOT_VERIFIED") {
        setSinVerificar(true);
      } else {
        setError(mensajeError(res.status, code));
      }
      setEstado("idle");
    } catch {
      setError("No se pudo iniciar sesión. Reintenta.");
      setEstado("idle");
    }
  }

  async function reenviarVerificacion(): Promise<void> {
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Respuesta UNIFORME (sin enumeración), como el endpoint.
      setReenviado(
        res.status === 429
          ? "Demasiados intentos. Espera un momento."
          : "Si corresponde, te hemos reenviado el correo de verificación.",
      );
    } catch {
      setReenviado("No se pudo conectar. Reinténtalo más tarde.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Campo
        id="login-email"
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
        id="login-password"
        label="Contraseña"
        type={verVisible ? "text" : "password"}
        autoComplete="current-password"
        required
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

      {error ? (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      ) : null}

      {sinVerificar ? (
        <div
          role="alert"
          className="rounded-sm border border-line bg-surface/60 p-3 text-sm text-text-dim"
        >
          Verifica tu correo antes de entrar.{" "}
          {reenviado ? (
            <span className="mt-1 block text-text">{reenviado}</span>
          ) : (
            <button
              type="button"
              onClick={reenviarVerificacion}
              className="mt-1 block rounded-xs text-text underline underline-offset-2"
            >
              Reenviar el correo de verificación
            </button>
          )}
        </div>
      ) : null}

      {/* ÚNICA acción magenta de la pantalla: plano (magenta sólido) + realce --df-cta-lift. */}
      <Boton
        type="submit"
        variante="principal"
        disabled={ocupado}
        className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
      >
        {ocupado ? "Entrando…" : "Iniciar sesión"}
      </Boton>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <Link
          href="/recuperar"
          className="rounded-xs text-text-dim transition-colors duration-150 ease-mechanical hover:text-text"
        >
          He olvidado mi contraseña
        </Link>
        {/* En móvil no hay panel de bienvenida -> el acceso a registro se ofrece aquí. */}
        <Link
          href="/registro"
          className="rounded-xs font-medium text-text transition-colors duration-150 ease-mechanical hover:text-text-dim lg:hidden"
        >
          Crear cuenta
        </Link>
      </div>
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
