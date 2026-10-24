"use client";

import { useState } from "react";

import { PildoraFiltro } from "@/components/ui/pildora-filtro";
import { ETIQUETA_RETO_PROXIMAMENTE } from "@/config/constants";
import { getJson } from "@/lib/cliente-http";
import type { RetoPublicoVista } from "@/server/services/retos-publico";

import { CATEGORIAS, CATEGORIA_TODOS, filtrarRetos } from "./retos-datos";
import { TarjetaReto } from "./tarjeta-reto";

/**
 * FEED de retos (cliente) con datos REALES. Pestaña ACTIVOS (con filtro por categoría) | CERRADOS.
 * El filtrado por categoría es presentacional y usa la función PURA `filtrarRetos`. Cada tarjeta lleva
 * su propia cuenta atrás (MarcadorReto difiere el plazo al montaje). Cerrados: vacío hasta que los haya.
 *
 * ┌─ CERRADOS SE PAGINA; ACTIVOS NO ────────────────────────────────────────────────────────────┐
 * │ Son dos listas con naturalezas distintas. ACTIVOS está acotada por su ventana (un reto sale  │
 * │ de ella al cerrar) y el filtro por categoría trabaja sobre lo que ya está en memoria, que es │
 * │ lo que lo hace instantáneo. CERRADOS no se vacía nunca: antes se traían los 100 últimos y el │
 * │ resto del histórico no existía para el público. Ahora va por keyset, con "Ver más" contra    │
 * │ `/api/retos/cerrados` — la primera página la sirve el servidor, igual que el feed.            │
 * │                                                                                               │
 * │ El filtro por categoría NO se ofrece en Cerrados (no lo ofrecía antes): filtrar en cliente    │
 * │ sobre una lista paginada enseñaría "no hay nada de esta categoría" cuando lo que pasa es que │
 * │ todavía no se ha cargado.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function FeedRetos({
  activos,
  proximos = [],
  cerrados,
  cerradosCursor = null,
  categoriaInicial = null,
}: {
  activos: RetoPublicoVista[];
  /** Los que aún no han abierto (`startsAt` futuro). Sección propia, nunca mezclados con Activos. */
  proximos?: RetoPublicoVista[];
  cerrados: RetoPublicoVista[];
  /** Cursor de la segunda página de cerrados, o `null` si no hay más. */
  cerradosCursor?: string | null;
  categoriaInicial?: string | null;
}) {
  const [pestana, setPestana] = useState<"activos" | "proximos" | "cerrados">("activos");
  const [categoria, setCategoria] = useState<string>(categoriaInicial ?? CATEGORIA_TODOS);
  const [masCerrados, setMasCerrados] = useState<RetoPublicoVista[]>([]);
  const [cursor, setCursor] = useState<string | null>(cerradosCursor);
  const [cargando, setCargando] = useState(false);

  const todosCerrados = [...cerrados, ...masCerrados];
  const visibles =
    pestana === "activos"
      ? filtrarRetos(activos, categoria)
      : pestana === "proximos"
        ? proximos
        : todosCerrados;

  async function verMas(): Promise<void> {
    if (!cursor || cargando) return;
    setCargando(true);
    try {
      const r = await getJson<{ items?: RetoPublicoVista[]; nextCursor?: string | null }>(
        `/api/retos/cerrados?cursor=${encodeURIComponent(cursor)}`,
      );
      if (r.ok && r.data.items) {
        setMasCerrados((previos) => [...previos, ...(r.data.items ?? [])]);
        // EL CURSOR SE PISA SIEMPRE, incluso con `undefined`: dejarlo como estaba volvería a pedir
        // la MISMA página al siguiente clic, y la lista se duplicaría sola.
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
      {/* Pestañas Activos | Próximamente | Cerrados. La de en medio SOLO aparece si hay alguno:
          una pestaña vacía permanente enseña un "no hay nada" cada vez que alguien la pulsa, y
          hay semanas enteras sin ningún reto programado. */}
      <div role="tablist" aria-label="Estado de los retos" className="mb-4 flex flex-wrap gap-2">
        <PildoraFiltro activo={pestana === "activos"} onClick={() => setPestana("activos")}>
          Activos
        </PildoraFiltro>
        {proximos.length > 0 ? (
          <PildoraFiltro activo={pestana === "proximos"} onClick={() => setPestana("proximos")}>
            {ETIQUETA_RETO_PROXIMAMENTE.charAt(0) +
              ETIQUETA_RETO_PROXIMAMENTE.slice(1).toLowerCase()}{" "}
            ({proximos.length})
          </PildoraFiltro>
        ) : null}
        <PildoraFiltro activo={pestana === "cerrados"} onClick={() => setPestana("cerrados")}>
          Cerrados
        </PildoraFiltro>
      </div>

      {/* Filtro por categoría — solo en Activos. */}
      {pestana === "activos" ? (
        <div
          role="group"
          aria-label="Filtrar por categoría"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <PildoraFiltro
            activo={categoria === CATEGORIA_TODOS}
            onClick={() => setCategoria(CATEGORIA_TODOS)}
          >
            Todos
          </PildoraFiltro>
          {CATEGORIAS.map((c) => (
            <PildoraFiltro
              key={c.clave}
              activo={categoria === c.clave}
              onClick={() => setCategoria(c.clave)}
            >
              {c.nombre}
            </PildoraFiltro>
          ))}
        </div>
      ) : null}

      {visibles.length === 0 ? (
        <div className="mt-8 rounded-sm border border-line bg-surface/60 p-6 text-center shadow-[var(--df-shadow-md)] backdrop-blur-md">
          <p className="font-medium text-text">
            {pestana === "activos"
              ? "Todavía no hay retos activos en esta categoría."
              : pestana === "proximos"
                ? "No hay ningún reto programado ahora mismo."
                : "Aún no hay retos cerrados."}
          </p>
        </div>
      ) : (
        <ul role="list" className="df-rise mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          {visibles.map((reto) => (
            <li key={reto.publicCode} className="grid">
              <TarjetaReto reto={reto} />
            </li>
          ))}
        </ul>
      )}

      {/* FUERA del `if` de la lista: si la primera página de cerrados viniera vacía pero quedaran
          más, el botón tiene que seguir ahí. Solo en Cerrados, que es la pestaña paginada. */}
      {pestana === "cerrados" && cursor ? (
        <button
          type="button"
          onClick={() => void verMas()}
          disabled={cargando}
          className="mt-4 w-full rounded-sm border border-line py-2 text-sm text-text-dim transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
        >
          {cargando ? "Cargando…" : "Ver más retos cerrados"}
        </button>
      ) : null}
    </>
  );
}
