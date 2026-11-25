"use client";

import { type FormEvent, useState } from "react";

import { useTextos } from "@/components/textos-provider";
import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { postJson } from "@/lib/cliente-http";

/**
 * FORMULARIO de recuperación de contraseña (isla cliente). POST /api/auth/forgot-password { email }.
 * La validación del formulario es solo UX; el SERVIDOR es el gate. La respuesta del endpoint es
 * UNIFORME (sin enumeración): exista o no la cuenta, contesta lo mismo -> aquí se muestra SIEMPRE el
 * mismo mensaje tras enviar, sin revelar si el correo tiene cuenta. El 429 también es uniforme (los
 * rate-limit se evalúan antes de mirar existencia), así que mostrarlo no filtra nada.
 */
type Estado = "idle" | "enviando" | "hecho";

export function FormularioRecuperar() {
  const t = useTextos("recuperar");
  const tf = useTextos("formAcceso");
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");
  const [aviso, setAviso] = useState("");

  const ocupado = estado === "enviando";

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAviso("");
    setEstado("enviando");
    try {
      const r = await postJson("/api/auth/forgot-password", { email: email.trim() });
      if (r.status === 429) {
        // Mostrarlo NO abre enumeración: los rate-limit se evalúan ANTES del findUnique, así que el
        // 429 es idéntico para una dirección real y una inventada.
        setAviso(t("demasiados"));
        setEstado("idle");
        return;
      }
      if (r.ok) {
        setEstado("hecho"); // respuesta uniforme (sin enumeración)
        return;
      }
      setAviso(t("noSePudo"));
      setEstado("idle");
    } catch {
      setAviso(t("sinConexion"));
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
        <p className="mb-1 font-medium text-text">{t("revisaCorreo")}</p>
        {t("hecho")}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Campo
        id="recuperar-email"
        label={tf("correo")}
        type="email"
        autoComplete="email"
        required
        placeholder={tf("placeholderCorreo")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={ocupado}
      />

      {aviso ? (
        <p role="alert" className="text-sm text-alarm">
          {aviso}
        </p>
      ) : null}

      {/* ÚNICA acción principal de la pantalla: plano (relleno de acción sólido) + realce --df-cta-lift. */}
      <Boton
        type="submit"
        variante="principal"
        disabled={ocupado}
        className="w-full py-3.5 shadow-[var(--df-cta-lift)]"
      >
        {ocupado ? t("enviando") : t("enviar")}
      </Boton>
    </form>
  );
}
