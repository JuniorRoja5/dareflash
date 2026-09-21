"use client";

import { useState } from "react";

import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

type Fase = "idle" | "pidiendo" | "visto";

/**
 * VER EL EMAIL DE UNA CUENTA. No se pinta con la ficha: hay que pedirlo, y pedirlo deja rastro.
 *
 * POR QUÉ UN BOTÓN Y NO UN CAMPO MÁS. El email es el único dato de esta pantalla que identifica a una
 * persona fuera de la plataforma. Si viniera en la ficha, se vería miles de veces al día sin que
 * nadie lo necesitara, y el registro de accesos no distinguiría mirar de pasar por delante. Con un
 * botón, cada fila de `AuditLog` corresponde a una decisión de alguien.
 *
 * ESTO NO ES LA SEGURIDAD: el email no está en el HTML de la página, así que esconderlo aquí no es un
 * `display:none`. La autoridad es la ruta, que además es la que escribe el rastro.
 */
export function VerEmail({ userId, aviso }: { userId: string; aviso: string }) {
  const [fase, setFase] = useState<Fase>("idle");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pedir() {
    setFase("pidiendo");
    setError(null);
    try {
      const r = await postJsonCsrf<{ email?: string | null }>(
        `/api/panel/cuentas/${userId}/email`,
        {},
      );
      if (r.ok) {
        setEmail(r.data.email ?? null);
        setFase("visto");
        return;
      }
      setError(mensajeDe(r.data) || "No se pudo consultar la dirección.");
      setFase("idle");
    } catch {
      setError("No hemos podido conectar. Inténtalo de nuevo.");
      setFase("idle");
    }
  }

  if (fase === "visto") {
    return (
      <p className="text-sm text-text">
        {/* Una cuenta de OAuth puede no tener dirección; se dice, no se pinta un hueco. */}
        {email ?? <span className="text-text-dim">{aviso}</span>}
      </p>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void pedir()}
        disabled={fase === "pidiendo"}
        className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:opacity-40"
      >
        {fase === "pidiendo" ? "Un momento…" : "Ver email"}
      </button>
      <span className="text-2xs text-text-dim">Queda registrado quién lo consulta.</span>
      {error ? (
        <span role="status" className="text-2xs text-alarm">
          {error}
        </span>
      ) : null}
    </span>
  );
}
