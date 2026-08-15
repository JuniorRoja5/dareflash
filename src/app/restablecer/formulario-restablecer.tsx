"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";

/**
 * FORMULARIO de restablecer contraseña (isla cliente). POST /api/auth/reset-password { token,
 * password }. La validación del formulario es solo UX; el SERVIDOR es el gate (token válido, política
 * de contraseña). Cada error se MAPEA a copy humano (nunca códigos crudos ni por qué falló el token).
 *
 * El token viaja en la URL; el POST lo consume (un solo uso) SOLO al pulsar el botón — nunca en el
 * render (anti-prefetch, ver la página).
 */
type Estado = "sin-token" | "listo" | "enviando" | "ok" | "error";

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

function RestablecerContenido() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [verVisible, setVerVisible] = useState(false);
  const [estado, setEstado] = useState<Estado>(token ? "listo" : "sin-token");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const ocupado = estado === "enviando";

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!token) return;
    setError("");
    setEstado("enviando");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      const msg = typeof data === "object" && data && "message" in data ? String(data.message) : "";
      if (res.ok) {
        setMensaje(msg || "Contraseña actualizada. Ya puedes iniciar sesión con la nueva.");
        setEstado("ok");
        return;
      }
      const code = codigoDe(data);
      if (res.status === 503 || code === "OVERLOADED") {
        // Se puede reintentar: no se pierde el enlace (el token no se consumió). Vuelve al formulario.
        setError("El servicio está ocupado. Reinténtalo en unos segundos.");
        setEstado("listo");
        return;
      }
      if (res.status === 400 && code === "VALIDATION") {
        // El SERVIDOR manda: `msg` trae el texto de `evaluarPassword` (misma política que el
        // registro: p.ej. "demasiado fácil de adivinar…"). Fallback alineado a la política (>=10).
        setError(msg || "Elige una contraseña de al menos 10 caracteres, larga y poco predecible.");
        setEstado("listo");
        return;
      }
      // INVALID_TOKEN (o cualquier otro): enlace inválido/caducado/ya usado. Estado terminal (el
      // token, si existía, ya no sirve): se ofrece pedir uno nuevo.
      setMensaje(msg || "El enlace para restablecer la contraseña es inválido o ha caducado.");
      setEstado("error");
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo más tarde.");
      setEstado("listo");
    }
  }

  if (estado === "sin-token") {
    return (
      <>
        <p className="mb-6 text-sm text-text-dim">
          Falta el token en el enlace. Abre el enlace completo del correo de recuperación.
        </p>
        <Boton href="/recuperar" variante="secundario" className="w-full">
          Pedir un enlace nuevo
        </Boton>
      </>
    );
  }

  if (estado === "ok") {
    return (
      <>
        <div
          role="status"
          className="mb-6 rounded-sm border border-line bg-surface/60 p-4 text-sm text-text-dim"
        >
          <p className="mb-1 font-medium text-text">Listo.</p>
          {mensaje}
        </div>
        <Boton
          href="/entrar"
          variante="principal"
          className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
        >
          Iniciar sesión
        </Boton>
      </>
    );
  }

  if (estado === "error") {
    return (
      <>
        <p role="alert" className="mb-2 text-sm text-alarm">
          {mensaje}
        </p>
        {/* El token es de UN SOLO USO: quien ya restableció y recarga cae aquí. No se puede
            distinguir "ya usado" de "inválido" sin un oráculo, así que se cubre con TEXTO. */}
        <p className="mb-6 text-sm text-text-dim">
          Si ya has cambiado tu contraseña, este enlace deja de funcionar: inicia sesión con la
          nueva. Si ha caducado, pide otro.
        </p>
        <div className="flex flex-col gap-3">
          <Boton href="/recuperar" variante="secundario" className="w-full">
            Pedir un enlace nuevo
          </Boton>
          <Link
            href="/entrar"
            className="rounded-xs text-center text-sm text-text-dim transition-colors duration-150 ease-mechanical hover:text-text"
          >
            Iniciar sesión
          </Link>
        </div>
      </>
    );
  }

  // "listo" | "enviando": el formulario de nueva contraseña.
  return (
    <>
      <p className="mb-6 text-sm text-text-dim">Elige una contraseña nueva para tu cuenta.</p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Campo
          id="restablecer-password"
          label="Nueva contraseña"
          type={verVisible ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={10}
          placeholder="Mínimo 10 caracteres"
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

        {/* ÚNICA acción magenta de la pantalla: plano + realce --df-cta-lift. */}
        <Boton
          type="submit"
          variante="principal"
          disabled={ocupado}
          className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
        >
          {ocupado ? "Guardando…" : "Guardar contraseña"}
        </Boton>
      </form>
    </>
  );
}

/** useSearchParams exige un límite de Suspense en el prerender estático. */
export function FormularioRestablecer() {
  return (
    <Suspense fallback={<p className="text-sm text-text-dim">Cargando…</p>}>
      <RestablecerContenido />
    </Suspense>
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
