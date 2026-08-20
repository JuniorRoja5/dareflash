"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CATEGORIES } from "@/config/constants";
import { postJsonCsrf } from "@/lib/cliente-http";
import { centimosAImporte } from "@/lib/dinero";
import type { RetoAdminFila } from "@/server/services/retos-admin";

const NOMBRE_CATEGORIA = new Map<string, string>(
  CATEGORIES.map((c) => [c.key, `${c.emoji} ${c.es}`]),
);
const ETIQUETA_ESTADO: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  CLOSED: "Cerrado",
};

function Publicar({ id }: { id: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "enviando" | "error">("idle");

  async function publicar(): Promise<void> {
    setEstado("enviando");
    try {
      const r = await postJsonCsrf(`/api/panel/retos/${id}/publicar`, {});
      if (r.ok) {
        router.refresh();
        return;
      }
      setEstado("error");
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={publicar}
        disabled={estado === "enviando"}
        className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
      >
        {estado === "enviando" ? "Publicando…" : "Publicar"}
      </button>
      {estado === "error" ? (
        <span role="alert" className="text-xs text-alarm">
          No se pudo publicar.
        </span>
      ) : null}
    </div>
  );
}

/**
 * Lista de retos del panel (todos los estados). Cada borrador lleva la acción Publicar (DRAFT ->
 * PUBLISHED). Tras publicar, `router.refresh()` recarga el server component y el estado se actualiza.
 */
export function ListaRetos({ retos }: { retos: RetoAdminFila[] }) {
  if (retos.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface/40 p-6 text-center text-sm text-text-dim">
        Todavía no hay retos. Crea el primero arriba.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line rounded-sm border border-line bg-surface/60">
      {retos.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-text">{r.title}</p>
            <p className="mt-0.5 text-xs text-text-dim">
              {NOMBRE_CATEGORIA.get(r.category) ?? r.category} · cierre{" "}
              {r.deadline.toLocaleDateString("es-ES", { timeZone: "UTC" })}
            </p>
          </div>
          {/* premio en lima (acento de dinero), tabular */}
          <span className="font-semibold tabular-nums text-ok">
            {centimosAImporte(r.prizeAmountCents)} {r.prizeCurrency}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-2xs font-semibold tracking-widest uppercase ${
              r.status === "PUBLISHED"
                ? "bg-ok/15 text-ok"
                : r.status === "DRAFT"
                  ? "bg-raised text-text-dim"
                  : "bg-raised text-text-dim"
            }`}
          >
            {ETIQUETA_ESTADO[r.status] ?? r.status}
          </span>
          {r.status === "DRAFT" ? <Publicar id={r.id} /> : null}
        </li>
      ))}
    </ul>
  );
}
