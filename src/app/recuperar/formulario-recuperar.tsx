"use client";

import { type FormEvent, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";

/**
 * FORMULARIO de recuperación de contraseña (isla cliente). POST /api/auth/forgot-password { email }.
 * La validación del formulario es solo UX; el SERVIDOR es el gate. La respuesta del endpoint es
 * UNIFORME (sin enumeración): exista o no la cuenta, contesta lo mismo -> aquí se muestra SIEMPRE el
 * mismo mensaje tras enviar, sin revelar si el correo tiene cuenta. El 429 también es uniforme (los
 * rate-limit se evalúan antes de mirar existencia), así que mostrarlo no filtra nada.
 */
type Estado = "idle" | "enviando" | "hecho";

const MENSAJE_UNIFORME =
  "Si esa cuenta existe, te hemos enviado un enlace para restablecer la contraseña. Revisa tu correo.";

export function FormularioRecuperar() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");
  const [aviso, setAviso] = useState("");

  const ocupado = estado === "enviando";

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAviso("");
    setEstado("enviando");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.status === 429) {
        // Mostrarlo NO abre enumeración: los rate-limit se evalúan ANTES del findUnique, así que el
        // 429 es idéntico para una dirección real y una inventada.
        setAviso("Demasiados intentos. Espera un momento antes de volver a probar.");
        setEstado("idle");
        return;
      }
      if (res.ok) {
        setEstado("hecho"); // respuesta uniforme (sin enumeración)
        return;
      }
      setAviso("No se pudo enviar el enlace. Revisa el correo y reinténtalo.");
      setEstado("idle");
    } catch {
      setAviso("No se pudo conectar. Inténtalo de nuevo más tarde.");
      setEstado("idle");
    }
  }

  // ÉXITO: mensaje uniforme (no revela si el correo tenía cuenta).
  if (estado === "hecho") {
    return (
      <div
        role="status"
        className="rounded-sm border border-line bg-surface/60 p-4 text-sm text-text-dim"
      >
        <p className="mb-1 font-medium text-text">Revisa tu correo.</p>
        {MENSAJE_UNIFORME} El enlace caduca en 30 minutos.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Campo
        id="recuperar-email"
        label="Correo"
        type="email"
        autoComplete="email"
        required
        placeholder="tu@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={ocupado}
      />

      {aviso ? (
        <p role="alert" className="text-sm text-alarm">
          {aviso}
        </p>
      ) : null}

      {/* ÚNICA acción magenta de la pantalla: plano (magenta sólido) + realce --df-cta-lift. */}
      <Boton
        type="submit"
        variante="principal"
        disabled={ocupado}
        className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
      >
        {ocupado ? "Enviando…" : "Enviar enlace"}
      </Boton>
    </form>
  );
}
