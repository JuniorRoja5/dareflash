"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PildoraFiltro } from "@/components/ui/pildora-filtro";

import { CATEGORIAS, CATEGORIA_TODOS, filtrarRetos, RETOS_SEED } from "./retos-datos";
import { TarjetaReto } from "./tarjeta-reto";

/**
 * FEED de retos (cliente): fila de filtros + lista de tarjetas. El filtrado es presentacional y
 * usa la funcion PURA `filtrarRetos` (testeada). Los plazos absolutos se calculan en el montaje
 * (offset del mock + Date.now()) y se pasan a cada marcador; antes del montaje van como null y el
 * marcador muestra su placeholder (sin Date.now() en render ni mismatch de hidratacion).
 */
export function FeedRetos() {
  const [categoria, setCategoria] = useState<string>(CATEGORIA_TODOS);
  const [deadlines, setDeadlines] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const fijarPlazos = (): void => {
      const ahora = Date.now();
      const mapa: Record<string, number> = {};
      for (const s of RETOS_SEED) mapa[s.id] = ahora + s.restanteMs;
      setDeadlines(mapa);
    };
    fijarPlazos();
  }, []);

  const visibles = filtrarRetos(RETOS_SEED, categoria);

  return (
    <>
      {/* Fila de filtros — scroll horizontal si no caben. Activo por defecto: Todos. */}
      <div
        role="group"
        aria-label="Filtrar por categoría"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

      {visibles.length === 0 ? (
        <div className="mt-8 rounded-sm border border-line bg-surface p-6 text-center">
          <p className="font-medium text-text">Todavía no hay retos en esta categoría.</p>
          <p className="mt-1 text-sm text-text-dim">
            Sé el primero:{" "}
            <Link href="/crear" className="rounded-xs text-text underline underline-offset-2">
              crea un reto
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul role="list" className="mt-4 space-y-3">
          {visibles.map((reto) => (
            <li key={reto.id}>
              <TarjetaReto reto={reto} deadlineMs={deadlines?.[reto.id] ?? null} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
