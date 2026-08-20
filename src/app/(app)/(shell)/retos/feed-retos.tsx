"use client";

import { useState } from "react";

import { PildoraFiltro } from "@/components/ui/pildora-filtro";
import type { RetoPublicoVista } from "@/server/services/retos-publico";

import { CATEGORIAS, CATEGORIA_TODOS, filtrarRetos } from "./retos-datos";
import { TarjetaReto } from "./tarjeta-reto";

/**
 * FEED de retos (cliente) con datos REALES. Pestaña ACTIVOS (con filtro por categoría) | CERRADOS.
 * El filtrado por categoría es presentacional y usa la función PURA `filtrarRetos`. Cada tarjeta lleva
 * su propia cuenta atrás (MarcadorReto difiere el plazo al montaje). Cerrados: vacío hasta que los haya.
 */
export function FeedRetos({
  activos,
  cerrados,
  categoriaInicial = null,
}: {
  activos: RetoPublicoVista[];
  cerrados: RetoPublicoVista[];
  categoriaInicial?: string | null;
}) {
  const [pestana, setPestana] = useState<"activos" | "cerrados">("activos");
  const [categoria, setCategoria] = useState<string>(categoriaInicial ?? CATEGORIA_TODOS);

  const visibles = pestana === "activos" ? filtrarRetos(activos, categoria) : cerrados;

  return (
    <>
      {/* Pestañas Activos | Cerrados. */}
      <div role="tablist" aria-label="Estado de los retos" className="mb-4 flex gap-2">
        <PildoraFiltro activo={pestana === "activos"} onClick={() => setPestana("activos")}>
          Activos
        </PildoraFiltro>
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
    </>
  );
}
