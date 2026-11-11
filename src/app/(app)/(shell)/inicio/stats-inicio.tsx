"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { type CifraVisible, premioCorto } from "@/lib/portada";

const REDUCE =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Count-up de un valor (animación SUTIL de interfaz). Respeta prefers-reduced-motion: sin animar. */
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

function Cifra({ c }: { c: CifraVisible }) {
  const v = useCountUp(c.valor);
  const esDinero = c.clave === "premios";
  return (
    <div>
      <p
        className={`text-2xl tabular-nums ${esDinero ? "text-money" : "text-text"}`}
        style={{ fontFamily: "var(--font-display)", fontVariationSettings: '"wght" 780' }}
      >
        {esDinero ? premioCorto(v) : Math.round(v).toLocaleString("en-US")}
      </p>
      <p className="mt-0.5 text-2xs tracking-widest text-text-dim uppercase">{c.etiqueta}</p>
    </div>
  );
}

/**
 * LAS CIFRAS DEL HERO (brief v2) — REALES: la suma de los premios de los retos abiertos, cuántos hay y en
 * cuántas categorías (`cifrasPortada`), con el count-up sutil de siempre. Hasta P14 eran «$8.4k» y
 * «2.310», escritos a mano en `portada-datos`.
 *
 * Qué cifras salen lo decide `cifrasVisibles` (ninguna se enseña para decir poco). SIN RETOS ABIERTOS no
 * sale ninguna: en su sitio, una línea que dice lo que pasa y lleva a la lista.
 */
export function StatsInicio({ cifras }: { cifras: CifraVisible[] }) {
  if (cifras.length === 0) {
    return (
      <p className="mt-8 max-w-prose text-sm text-text-dim">
        Ahora mismo no hay retos abiertos.{" "}
        <Link href="/retos" className="text-text underline underline-offset-2">
          Mira los que vienen
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
      {cifras.map((c) => (
        <Cifra key={c.clave} c={c} />
      ))}
    </div>
  );
}
