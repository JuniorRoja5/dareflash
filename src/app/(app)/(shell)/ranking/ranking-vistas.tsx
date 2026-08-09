"use client";

import { useState } from "react";

import { FilaPuesto } from "@/components/ui/fila-puesto";

import { listaRanking, RANKING_VISTAS, type RankingClave, USUARIO_ACTUAL } from "./ranking-datos";

/**
 * Conmutador de las dos vistas del TopRanking (isla CLIENTE minima: solo el estado de que lista se
 * muestra). Segmented control con la pestaña activa en NEUTRO ELEVADO (--df-raised, como el destino
 * activo de la nav), NUNCA magenta. La lista reutiliza la primitiva `FilaPuesto` tal cual (oro solo
 * en 1/2/3, puntos neutros); la fila del usuario actual va resaltada con `activo`.
 */
export function RankingVistas() {
  const [vista, setVista] = useState<RankingClave>("mensual");
  const lista = listaRanking(vista);

  return (
    <>
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
            onClick={() => setVista(v.clave)}
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

      <div
        aria-label="Clasificación"
        className="mt-5 overflow-hidden rounded-sm border border-line bg-surface"
      >
        {lista.map((fila, i) => (
          <FilaPuesto
            key={fila.username}
            puesto={i + 1}
            username={fila.username}
            puntos={fila.puntos}
            activo={fila.username === USUARIO_ACTUAL}
          />
        ))}
      </div>
    </>
  );
}
