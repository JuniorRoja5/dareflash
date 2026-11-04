"use client";

import { useState } from "react";

import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { nombrePais } from "@/lib/paises";

type Fase = "idle" | "pidiendo" | "visto";

/**
 * VER LA IDENTIFICACIÓN FISCAL DE UNA EMPRESA. No se pinta con la ficha: hay que pedirla, y pedirla
 * deja rastro. Es el mismo trato —y el mismo componente, en espíritu— que `VerEmail` en
 * `/panel/usuarios`.
 *
 * POR QUÉ UN BOTÓN Y NO UN CAMPO MÁS. En una marca personal este dato es el documento de una
 * PERSONA. Si viniera en la ficha, se vería cada vez que alguien abre una empresa sin que nadie lo
 * necesitara, y el registro de accesos no distinguiría mirar de pasar por delante. Con un botón,
 * cada fila de `AuditLog` corresponde a una decisión de alguien.
 *
 * ESTO NO ES LA SEGURIDAD: el valor no está en el HTML de la página, así que esconderlo aquí no es
 * un `display:none`. La autoridad es la ruta, y quien escribe el rastro es el servicio.
 */
export function VerFiscal({ empresaId }: { empresaId: string }) {
  const [fase, setFase] = useState<Fase>("idle");
  const [valor, setValor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pedir() {
    setFase("pidiendo");
    setError(null);
    try {
      const r = await postJsonCsrf<{ fiscalId?: string | null; fiscalPaisIso?: string | null }>(
        `/api/panel/empresas/${empresaId}/fiscal`,
        {},
      );
      if (r.ok) {
        const id = r.data.fiscalId ?? null;
        setValor(
          id
            ? `${id}${r.data.fiscalPaisIso ? ` (${nombrePais(r.data.fiscalPaisIso)})` : ""}`
            : null,
        );
        setFase("visto");
        return;
      }
      setError(mensajeDe(r.data) || "No se pudo consultar la identificación.");
      setFase("idle");
    } catch {
      setError("No hemos podido conectar. Inténtalo de nuevo.");
      setFase("idle");
    }
  }

  if (fase === "visto") {
    return (
      <p className="text-sm text-text">
        {/* Es opcional: puede no haberla, y eso se dice en vez de pintar un hueco. */}
        {valor ?? <span className="text-text-dim">Esta empresa no la ha dado.</span>}
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
        {fase === "pidiendo" ? "Un momento…" : "Ver identificación fiscal"}
      </button>
      <span className="text-2xs text-text-dim">Queda registrado quién la consulta.</span>
      {error ? (
        <span role="status" className="text-2xs text-alarm">
          {error}
        </span>
      ) : null}
    </span>
  );
}
