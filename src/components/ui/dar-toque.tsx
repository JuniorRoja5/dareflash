"use client";

import { useState } from "react";

import { MSG_TOQUE_ENVIADO } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/**
 * DAR UN TOQUE — el botón, en el perfil de OTRA persona.
 *
 * ┌─ SOLO SE MONTA SI QUIEN MIRA ES VIP, Y ESO ES COMODIDAD, NO SEGURIDAD ──────────────────────┐
 * │ Quien decide de verdad es el servidor, por el chokepoint (`darToque`). Enseñar el botón a    │
 * │ quien no puede usarlo sería prometer lo que la API va a rechazar —el mismo criterio que      │
 * │ `Denunciar` o que el botón de voto—, pero esconderlo no protege nada: el endpoint existe y   │
 * │ un `curl` no mira la UI.                                                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL COPY DE LA RESPUESTA LO MANDA EL SERVIDOR, incluido el de "ya le has dado un toque hoy": dar
 * dos veces el mismo día no es un error y no se pinta como tal. El botón se queda deshabilitado
 * después de un toque aceptado o repetido —en los dos casos la respuesta es la misma para hoy— y
 * eso evita que alguien martillee contra un tope que ya conoce.
 */
export function DarToque({ userId, className = "" }: { userId: string; className?: string }) {
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar(): Promise<void> {
    if (enviando || hecho) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await postJsonCsrf<{ estado?: string; mensaje?: string }>("/api/toques", {
        userId,
      });
      // `enviado`, `repetido` y `limite` son respuestas con copy, no fallos: se pintan igual.
      if (r.ok) {
        setHecho(r.data.mensaje ?? MSG_TOQUE_ENVIADO);
        return;
      }
      setError(mensajeDe(r.data) || "No se pudo dar el toque.");
    } catch {
      setError("No hemos podido conectar. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <p
        data-toque-hecho
        aria-live="polite"
        className={`rounded-sm border border-line bg-raised px-4 py-3 text-center text-sm text-text-dim ${className}`}
      >
        {hecho}
      </p>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        data-dar-toque
        onClick={() => void enviar()}
        disabled={enviando}
        className="w-full rounded-sm bg-action px-4 py-3 text-sm font-semibold text-void transition-[filter] duration-[var(--df-dur-fast)] ease-mechanical hover:brightness-110 disabled:opacity-60"
      >
        {enviando ? "Enviando…" : "Dar un toque"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-center text-2xs text-alarm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
