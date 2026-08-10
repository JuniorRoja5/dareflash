"use client";

import { useEffect, useState } from "react";

import { STATS_INICIO } from "./portada-datos";

const REDUCE =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Count-up de un valor (animacion SUTIL de interfaz). Respeta prefers-reduced-motion: sin animar. */
function useCountUp(target: number): number {
  const [v, setV] = useState(REDUCE ? target : 0);
  useEffect(() => {
    if (REDUCE) return;
    let raf = 0;
    let t0 = 0;
    const paso = (ts: number): void => {
      if (!t0) t0 = ts;
      const k = Math.min(1, (ts - t0) / 900);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Stat({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  return (
    <div>
      <p
        className="text-2xl tabular-nums text-text"
        style={{ fontFamily: "var(--font-display)", fontVariationSettings: '"wght" 780' }}
      >
        {texto}
      </p>
      <p className="mt-0.5 text-2xs tracking-widest text-text-dim uppercase">{etiqueta}</p>
    </div>
  );
}

/**
 * STATS del hero (brief v2) — agregados reales del producto (14 categorias, premios en juego, retos
 * abiertos) con COUNT-UP en el montaje: movimiento SUTIL de interfaz (no del video). Dinero en lima
 * (money), el resto neutro. Respeta prefers-reduced-motion.
 */
export function StatsInicio() {
  const cats = useCountUp(STATS_INICIO.categorias);
  const dolares = useCountUp(STATS_INICIO.premiosActivosCents / 100);
  const retos = useCountUp(STATS_INICIO.retosAbiertos);

  return (
    <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
      <Stat texto={String(Math.round(cats))} etiqueta="categorías" />
      <div>
        <p
          className="text-2xl tabular-nums text-money"
          style={{ fontFamily: "var(--font-display)", fontVariationSettings: '"wght" 780' }}
        >
          ${(dolares / 1000).toFixed(1)}k
        </p>
        <p className="mt-0.5 text-2xs tracking-widest text-text-dim uppercase">en premios ahora</p>
      </div>
      <Stat texto={Math.round(retos).toLocaleString("en-US")} etiqueta="retos abiertos" />
    </div>
  );
}
