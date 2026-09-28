"use client";

import { useState } from "react";

import { getJson } from "@/lib/cliente-http";
// El copy de los motivos se fue a `lib/razones-puntos` cuando el usuario estrenó su propio historial
// en /puntos: con una copia en cada pantalla, añadir una razón dejaba a la otra enseñando el código
// crudo sin que nada fallase. Aquí se usa el juego en TERCERA persona: el panel mira la cuenta de otro.
import { razonHumana } from "@/lib/razones-puntos";
import type { MovimientoPuntos } from "@/server/services/dareup-admin";

/** Fecha en UTC (el proyecto trabaja en UTC de punta a punta). */
function fecha(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// A QUÉ APUNTA ya no se compone aquí: llega hecho del servicio (`MovimientoPuntos.referencia`), que
// lo resuelve en lote. Esta función escribía `${refType} · ${refId}` y eso era el cuid de la base de
// datos en pantalla («challenge · cmtww…»). Ahora la vista ni siquiera recibe el id, así que no puede
// volver a pintarlo por descuido.

/**
 * HISTORIAL DE PUNTOS del inspector: los movimientos reales del ledger, del más nuevo al más viejo,
 * por KEYSET ("Ver más" pide la página siguiente con su cursor opaco). Solo lectura: las filas del
 * ledger no se editan ni se borran, y aquí no hay botón que lo intente.
 */
export function HistorialPuntos({
  userId,
  inicial,
  cursorInicial,
}: {
  userId: string;
  inicial: MovimientoPuntos[];
  cursorInicial: string | null;
}) {
  const [items, setItems] = useState(inicial);
  const [cursor, setCursor] = useState(cursorInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  async function cargarMas(): Promise<void> {
    if (!cursor || cargando) return;
    setCargando(true);
    setError(false);
    try {
      const r = await getJson<{ items?: MovimientoPuntos[]; nextCursor?: string | null }>(
        `/api/panel/dareup/historial?userId=${encodeURIComponent(userId)}&cursor=${encodeURIComponent(cursor)}`,
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
        Sin movimientos de puntos todavía.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-sm border border-line bg-surface/60">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs tracking-widest text-text-dim uppercase">
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Motivo</th>
              <th className="px-4 py-3 text-right font-semibold">Puntos</th>
              <th className="px-4 py-3 font-semibold">Referencia</th>
              <th className="px-4 py-3 font-semibold">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="px-4 py-2.5 whitespace-nowrap text-text-dim tabular-nums">
                  {fecha(m.creadoEnMs)}
                </td>
                <td className="px-4 py-2.5 text-text">{razonHumana(m.razon)}</td>
                <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap text-text tabular-nums">
                  {m.delta > 0 ? "+" : "−"}
                  {Math.abs(m.delta).toLocaleString("es-ES")}
                </td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 text-text-dim">{m.referencia}</td>
                <td className="px-4 py-2.5 text-text-dim">{m.nota ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cursor ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void cargarMas()}
            disabled={cargando}
            className="min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
          >
            {cargando ? "Cargando…" : "Ver más movimientos"}
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
