"use client";

import { useState } from "react";

import { getJson } from "@/lib/cliente-http";

import { CeldaVideo } from "./celda-video";
import type { VideoCelda } from "./perfil-vista";

/**
 * LA REJILLA DE VÍDEOS DEL PERFIL, paginada por keyset.
 *
 * ┌─ POR QUÉ ESTO EXISTE ───────────────────────────────────────────────────────────────────────┐
 * │ El perfil se traía TODOS los vídeos de la cuenta, sin tope: para quien sube a diario eso es  │
 * │ una consulta que crece sin techo y un payload que viaja entero al navegador en cada visita.  │
 * │ Nada falla, solo se degrada — y cuando duele, ya duele en producción.                        │
 * │                                                                                               │
 * │ La PRIMERA página la pinta el servidor (así el perfil sigue siendo útil sin JavaScript y el  │
 * │ póster llega firmado desde el principio); de la segunda en adelante las pide este botón.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL PÓSTER LO FIRMA EL SERVIDOR, también en las páginas siguientes: el endpoint devuelve la celda
 * ya montada. Aquí no hay ni una credencial de Bunny, igual que en la primera página.
 */
export function RejillaVideos({
  inicial,
  cursorInicial,
  url,
  esPropio,
}: {
  inicial: VideoCelda[];
  /** Cursor de la segunda página, o `null` si no hay más. */
  cursorInicial: string | null;
  /** Endpoint que sirve las páginas siguientes. Lo elige QUIEN MONTA la rejilla: el perfil propio y
   *  el público son dos rutas distintas, y la de uno nunca puede servir los vídeos del otro. */
  url: string;
  esPropio: boolean;
}) {
  const [items, setItems] = useState<VideoCelda[]>(inicial);
  const [cursor, setCursor] = useState<string | null>(cursorInicial);
  const [cargando, setCargando] = useState(false);

  async function verMas(): Promise<void> {
    if (!cursor || cargando) return;
    setCargando(true);
    try {
      const r = await getJson<{ items?: VideoCelda[]; nextCursor?: string | null }>(
        `${url}?cursor=${encodeURIComponent(cursor)}`,
      );
      if (r.ok && r.data.items) {
        setItems((previos) => [...previos, ...(r.data.items ?? [])]);
        // SE PISA SIEMPRE, incluso con `undefined`: dejar el cursor viejo volvería a pedir la MISMA
        // página al siguiente clic y la rejilla se duplicaría sola.
        setCursor(r.data.nextCursor ?? null);
      }
    } catch {
      // Sin ruido: el botón sigue ahí y se puede reintentar.
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      {items.length === 0 ? (
        <p className="rounded-sm border border-line bg-surface/40 p-8 text-center text-sm text-text-dim">
          {esPropio
            ? "Todavía no has publicado ningún vídeo. Cuando publiques uno, aparecerá aquí."
            : "Este perfil aún no tiene vídeos publicados."}
        </p>
      ) : (
        <div className="grid grid-cols-3 items-start gap-x-1.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((v) => (
            // Publicado -> tap abre el modal; en proceso/fallido -> icono + estado. En el perfil
            // PROPIO cada celda lleva su acción de borrar (con confirmación).
            <CeldaVideo key={v.id} video={v} esPropio={esPropio} />
          ))}
        </div>
      )}

      {/* FUERA del `if` de la rejilla: si la primera página viniera vacía pero quedaran más (un
          vídeo retirado justo en el corte), el botón tiene que seguir ahí. */}
      {cursor ? (
        <button
          type="button"
          onClick={() => void verMas()}
          disabled={cargando}
          className="mt-4 w-full rounded-sm border border-line py-2 text-sm text-text-dim transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
        >
          {cargando ? "Cargando…" : "Ver más vídeos"}
        </button>
      ) : null}
    </>
  );
}
