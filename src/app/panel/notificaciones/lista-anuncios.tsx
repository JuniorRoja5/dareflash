"use client";

import { useState } from "react";

import { useSondeoVisible } from "@/components/usar-sondeo";
import { ANUNCIOS_SONDEO_MIN_ENTRE_MS, ANUNCIOS_SONDEO_MS } from "@/config/constants";
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
 * Ancho de la barra en %. Redondeado HACIA ABAJO: la barra nunca dice más de lo que dice el COUNT
 * (12.499 de 12.500 no es un 100 % lleno, que se leería como "entregado").
 */
function anchoBarra(a: AnuncioRevision): number {
  if (a.targetCount <= 0) return 100;
  return Math.min(100, Math.floor((a.entregadas / a.targetCount) * 100));
}

/**
 * ANUNCIOS ENVIADOS: texto, fecha, autor y PROGRESO del reparto, más nuevos primero, por keyset ("Ver
 * más" pide la página siguiente). El progreso es el COUNT de sus avisos sobre el objetivo que se
 * fotografió al enviar: exacto, sin contador que se descuadre. Neutro: son recuentos, no dinero.
 *
 * EN VIVO. La primera pintura viene del servidor; los que están REPARTIENDO se refrescan en cliente
 * con el sondeo compartido del número de avisos (`useSondeoVisible`): cada `ANUNCIOS_SONDEO_MS` con
 * la pestaña visible y en el acto al volver a ella, pidiendo SOLO esos (`?ids=`). En cuanto ninguno
 * está repartiendo —todos entregados, fallidos o terminados— el sondeo se apaga y no pide nada más.
 * Antes el progreso era la foto de cuando se cargó la página, y "Repartiendo…" se quedaba congelado
 * aunque el reparto avanzara.
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

  const repartiendo = items.filter((a) => a.estado === "repartiendo").map((a) => a.id);

  useSondeoVisible({
    activo: repartiendo.length > 0,
    intervaloMs: ANUNCIOS_SONDEO_MS,
    minEntreMs: ANUNCIOS_SONDEO_MIN_ENTRE_MS,
    tarea: async () => {
      const r = await getJson<{ items?: AnuncioRevision[] }>(
        `/api/panel/anuncios?ids=${repartiendo.map(encodeURIComponent).join(",")}`,
      );
      // Sin sesión o sin permiso: seguir preguntando no va a cambiar la respuesta.
      if (r.status === 401 || r.status === 403) return false;
      if (!r.ok || !r.data.items) return; // un fallo suelto no borra lo pintado
      const frescos = new Map(r.data.items.map((a) => [a.id, a]));
      setItems((previos) => previos.map((a) => frescos.get(a.id) ?? a));
    },
  });

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
        {items.map((a) => (
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
              <span className={a.estado === "entregado" ? "text-text" : ""}>{textoEstado(a)}</span>
            </div>
            <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                data-barra
                className="h-full rounded-full bg-text-dim/60"
                style={{ width: `${anchoBarra(a)}%` }}
              />
            </div>
          </li>
        ))}
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
