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
export function FeedRetos({ categoriaInicial = null }: { categoriaInicial?: string | null }) {
  const [categoria, setCategoria] = useState<string>(categoriaInicial ?? CATEGORIA_TODOS);
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

      {visibles.length === 0 ? (
        <div className="mt-8 rounded-sm border border-line bg-surface/60 p-6 text-center shadow-[var(--df-shadow-md)] backdrop-blur-md">
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
        // 2 columnas: tiles VERTICALES 9:16 en movil, tarjetas APAISADAS en lg (la propia tarjeta
        // reflowa col→row). El marcador va superpuesto a la miniatura, asi que se ve en el viewport
        // en ambos (no cae bajo el fold como en un tile 9:16 a pantalla completa).
        <ul role="list" className="df-rise mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          {visibles.map((reto) => (
            // `grid` en el <li> hace que la <article> se estire a la altura de la fila: tarjetas de
            // igual alto por fila (coherente con la rejilla de destacados de la portada).
            <li key={reto.id} className="grid">
              <TarjetaReto reto={reto} deadlineMs={deadlines?.[reto.id] ?? null} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
