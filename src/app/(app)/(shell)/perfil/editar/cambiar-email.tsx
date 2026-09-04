"use client";

import { type FormEvent, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { delCsrf, mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/**
 * TU CORREO — verlo y cambiarlo. Antes no aparecía en ninguna parte de la ficha: el usuario no podía
 * ni comprobar con qué dirección se había registrado.
 *
 * El cambio NO se aplica al pulsar. Se manda un enlace a la dirección NUEVA y hasta que no se confirma
 * desde ella la cuenta sigue con la vieja. El formulario pide además la CONTRASEÑA, y no es burocracia:
 * el correo es la identidad de acceso, así que sin ella bastaría con robar una sesión para llevarse la
 * cuenta entera. El copy lo explica en vez de limitarse a exigirla.
 */
export function CambiarEmail({
  emailActual,
  pendienteInicial,
}: {
  emailActual: string;
  /** Dirección pedida y aún sin confirmar, si la hay. */
  pendienteInicial: string | null;
}) {
  const [pendiente, setPendiente] = useState(pendienteInicial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "hecho">("idle");
  const [error, setError] = useState("");

  const ocupado = estado === "enviando";

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError("");
    setEstado("enviando");
    try {
      const r = await postJsonCsrf("/api/perfil/email", { email: email.trim(), password });
      if (r.ok) {
        setPendiente(email.trim());
        setPassword("");
        setEmail("");
        setEstado("hecho");
        return;
      }
      setError(mensajeDe(r.data) || "No se pudo pedir el cambio. Inténtalo de nuevo.");
      setEstado("idle");
    } catch {
      setError("No hemos podido conectar. Inténtalo de nuevo.");
      setEstado("idle");
    }
  }

  async function cancelar(): Promise<void> {
    setEstado("enviando");
    try {
      await delCsrf("/api/perfil/email");
      setPendiente(null);
    } finally {
      setEstado("idle");
    }
  }

  return (
    <section className="rounded-sm border border-line bg-surface/60 p-5">
      <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">Tu correo</h2>
      <p className="mt-2 text-sm text-text">{emailActual}</p>

      {pendiente ? (
        <div className="mt-4 rounded-sm border border-line bg-raised/50 p-3">
          <p className="text-sm text-text">
            Pendiente de confirmar: <span className="font-medium">{pendiente}</span>
          </p>
          <p className="mt-1 text-2xs text-text-dim">
            Te hemos enviado un enlace a esa dirección. Hasta que la confirmes, tu cuenta sigue con
            la de arriba.
          </p>
          <button
            type="button"
            onClick={() => void cancelar()}
            disabled={ocupado}
            className="mt-3 min-h-[36px] rounded-sm border border-line px-3 text-sm text-text-dim transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
          >
            Cancelar el cambio
          </button>
        </div>
      ) : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-3">
        <Campo
          id="email-nuevo"
          label="Nueva dirección"
          type="email"
          value={email}
          disabled={ocupado}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Campo
          id="email-password"
          label="Tu contraseña"
          type="password"
          value={password}
          disabled={ocupado}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <p className="text-2xs text-text-dim">
          Pedimos tu contraseña porque con el correo se entra en tu cuenta y se recupera. Te
          enviaremos un enlace a la dirección nueva: el cambio solo se aplica al confirmarlo, y
          entonces se cerrarán tus sesiones.
        </p>
        {error ? (
          <p role="status" className="text-sm text-alarm">
            {error}
          </p>
        ) : null}
        {estado === "hecho" ? (
          <p role="status" className="text-sm text-ok">
            Te hemos enviado un enlace de confirmación. Ábrelo desde tu nueva dirección.
          </p>
        ) : null}
        <Boton type="submit" variante="secundario" disabled={ocupado} className="w-full">
          {ocupado ? "Enviando…" : "Cambiar mi correo"}
        </Boton>
      </form>
    </section>
  );
}
