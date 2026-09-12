"use client";

import { useState } from "react";

import { getJson } from "@/lib/cliente-http";
import type { AnuncioRevision, EstadoAnuncio } from "@/server/services/anuncios";

/** Fecha en UTC (el proyecto trabaja en UTC de punta a punta). */
function fecha(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Qué le pasa al reparto, en copy humano. Ninguno promete lo que no se sabe. */
function textoEstado(a: AnuncioRevision): string {
  const faltan = (a.targetCount - a.entregadas).toLocaleString("es-ES");
  const COPY: Record<EstadoAnuncio, string> = {
    entregado: "Entregado",
    repartiendo: "Repartiendo…",
    fallido: "El reparto se detuvo por errores. Lo ya entregado sigue entregado.",
    terminado: `Terminado: ${faltan} cuentas se borraron o fueron baneadas antes de recibirlo.`,
  };
  return COPY[a.estado];
}

/**
 * ANUNCIOS ENVIADOS: texto, fecha, autor y PROGRESO del reparto, más nuevos primero, por keyset ("Ver
 * más" pide la página siguiente). El progreso es el COUNT de sus avisos sobre el objetivo que se fotografió
 * al enviar: exacto, sin contador que se descuadre. Neutro: son recuentos, no dinero.
 */
export function ListaAnuncios({
  inicial,
  cursorInicial,
}: {
  inicial: AnuncioRevision[];
  cursorInicial: string | null;
}) {
  const [items, setItems] = useState(inicial);
  const [cursor, setCursor] = useState(cursorInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  async function verMas(): Promise<void> {
    if (!cursor || cargando) return;
    setCargando(true);
    setError(false);
    try {
      const r = await getJson<{ items?: AnuncioRevision[]; nextCursor?: string | null }>(
        `/api/panel/anuncios?cursor=${encodeURIComponent(cursor)}`,
      );
      if (!r.ok || !r.data.items) {
        setError(true);
        return;
      }
      setItems((previos) => [...previos, ...(r.data.items ?? [])]);
      setCursor(r.data.nextCursor ?? null);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface/40 p-6 text-center text-sm text-text-dim">
        Aún no has enviado ningún anuncio.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {items.map((a) => {
          const pct = a.targetCount > 0 ? Math.min(100, (a.entregadas / a.targetCount) * 100) : 100;
          return (
            <li
              key={a.id}
              data-anuncio={a.id}
              className="rounded-sm border border-line bg-surface/60 p-4"
            >
              <p className="text-sm whitespace-pre-line text-text">{a.texto}</p>
              <p className="mt-2 text-2xs text-text-dim">
                {fecha(a.creadoEnMs)}
                {a.autor ? ` · por @${a.autor}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-2xs text-text-dim">
                <span className="tabular-nums">
                  {a.entregadas.toLocaleString("es-ES")} / {a.targetCount.toLocaleString("es-ES")}{" "}
                  entregados
                </span>
                <span className={a.estado === "entregado" ? "text-text" : ""}>
                  {textoEstado(a)}
                </span>
              </div>
              <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-text-dim/60"
                  style={{ width: `${Math.round(pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {cursor ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void verMas()}
            disabled={cargando}
            className="min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
          >
            {cargando ? "Cargando…" : "Ver más anuncios"}
          </button>
          {error ? (
            <span role="alert" className="text-xs text-alarm">
              No se pudieron cargar más. Inténtalo de nuevo.
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
