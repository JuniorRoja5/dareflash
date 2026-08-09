"use client";

import { useState } from "react";

import { FilaPuesto } from "@/components/ui/fila-puesto";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";

import { PodioRanking } from "./podio-ranking";
import {
  listaRanking,
  paginar,
  puntosNivel,
  RANKING_VISTAS,
  type RankingClave,
  USUARIO_ACTUAL,
} from "./ranking-datos";

const TAMANO_PAGINA = 10;

/**
 * TOPRANKING — conmutador (Mensual / Top 20 del reto) + PODIO del top-3 + lista del 4 en adelante +
 * paginacion. La lista reusa `listaRanking` (pura, testeada). Islas de estado minimas: que vista se
 * muestra y en que pagina va la lista. El conmutador activo va en NEUTRO ELEVADO (--df-raised), nunca
 * magenta. Los puntos son neutros; el oro/plata/bronce viven SOLO en el podio.
 */
export function RankingVistas() {
  const [vista, setVista] = useState<RankingClave>("mensual");
  const [pagina, setPagina] = useState(1);

  const lista = listaRanking(vista);
  const top3 = lista.slice(0, 3);
  const resto = lista.slice(3);
  const totalPaginas = Math.max(1, Math.ceil(resto.length / TAMANO_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = paginar(resto, paginaSegura, TAMANO_PAGINA);
  const puestoBase = 3 + (paginaSegura - 1) * TAMANO_PAGINA;

  function cambiarVista(v: RankingClave) {
    setVista(v);
    setPagina(1);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          className="text-2xl leading-none text-text"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 780, "wdth" 118',
          }}
        >
          Clasificación
        </h1>

        <div
          role="group"
          aria-label="Vista del ranking"
          className="inline-flex rounded-sm border border-line bg-surface p-1"
        >
          {RANKING_VISTAS.map((v) => (
            <button
              key={v.clave}
              type="button"
              aria-pressed={vista === v.clave}
              onClick={() => cambiarVista(v.clave)}
              className={`min-h-[44px] rounded-xs px-4 text-sm transition-colors duration-150 ease-mechanical ${
                vista === v.clave
                  ? "bg-raised font-medium text-text"
                  : "text-text-dim hover:text-text"
              }`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Podio del top-3 (color por puesto + geometria) */}
      <PodioRanking top3={top3} />

      {/* Lista del 4 en adelante */}
      <div
        aria-label="Clasificación (del 4º en adelante)"
        className="mt-8 overflow-hidden rounded-sm border border-line bg-surface"
      >
        {visibles.map((fila, i) => (
          <FilaPuesto
            key={fila.username}
            puesto={puestoBase + i + 1}
            username={fila.username}
            puntos={fila.puntos}
            activo={fila.username === USUARIO_ACTUAL}
            insignia={<InsigniaNivel puntos={puntosNivel(fila)} />}
          />
        ))}
      </div>

      {/* Paginacion (maqueta) */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm text-text-dim">
        <span className="inline-flex items-center gap-2">
          Mostrar
          <span className="rounded-sm border border-line bg-surface px-3 py-1.5 tabular-nums text-text">
            {TAMANO_PAGINA}
          </span>
          por página
        </span>
        <div className="inline-flex items-center gap-3">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={paginaSegura <= 1}
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            className="grid h-9 w-9 place-items-center rounded-sm border border-line bg-surface text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40 disabled:hover:bg-surface"
          >
            ‹
          </button>
          <span className="tabular-nums">
            Página {paginaSegura} de {totalPaginas}
          </span>
          <button
            type="button"
            aria-label="Página siguiente"
            disabled={paginaSegura >= totalPaginas}
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            className="grid h-9 w-9 place-items-center rounded-sm border border-line bg-surface text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40 disabled:hover:bg-surface"
          >
            ›
          </button>
        </div>
      </div>
    </>
  );
}
