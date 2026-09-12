"use client";

import { useState } from "react";

import { getJson } from "@/lib/cliente-http";
import type { NotificacionInspector } from "@/server/services/anuncios";

import { ETIQUETA_TIPO } from "./etiquetas";

/** Fecha en UTC (el proyecto trabaja en UTC de punta a punta). */
function fecha(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * INSPECTOR de notificaciones del sistema (todas las cuentas, SOLO LECTURA): las ya emitidas, más
 * nuevas primero, por keyset, con los filtros de la página. Enseña lo que vio cada persona —el mismo
 * texto de su bandeja— y si lo ha leído; nunca la clave del hecho (en un voto llevaría al votante).
 */
export function InspectorNotificaciones({
  inicial,
  cursorInicial,
  consulta,
}: {
  inicial: NotificacionInspector[];
  cursorInicial: string | null;
  /** Query string de los filtros aplicados, para pedir la página siguiente con los mismos. */
  consulta: string;
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
      const r = await getJson<{ items?: NotificacionInspector[]; nextCursor?: string | null }>(
        `/api/panel/notificaciones?${consulta ? `${consulta}&` : ""}cursor=${encodeURIComponent(cursor)}`,
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
        No hay notificaciones con esos filtros.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-sm border border-line bg-surface/60">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs tracking-widest text-text-dim uppercase">
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Usuario</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Texto</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((n) => (
              <tr key={n.id} className="align-top">
                <td className="px-4 py-2.5 whitespace-nowrap text-text-dim tabular-nums">
                  {fecha(n.creadaMs)}
                </td>
                <td className="px-4 py-2.5 text-text">{n.usuario ? `@${n.usuario}` : "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-text-dim">
                  {ETIQUETA_TIPO[n.tipo] ?? n.tipo}
                </td>
                <td className="px-4 py-2.5 text-text">{n.texto ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-text-dim">
                  {n.leida ? "Leída" : "Sin leer"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cursor ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void verMas()}
            disabled={cargando}
            className="min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
          >
            {cargando ? "Cargando…" : "Ver más notificaciones"}
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
