"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Imagen3d } from "@/components/ui/imagen-3d";
import { type CifraVisible, premioCorto } from "@/lib/portada";
import type { Tema } from "@/lib/tema";
import { formatearMarcador } from "@/lib/formato";
import { useFormato } from "@/components/formato-provider";

const REDUCE =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Count-up de un valor (animación SUTIL de interfaz). Respeta prefers-reduced-motion: sin animar. */
function useCountUp(target: number, quieto: boolean): number {
  const [v, setV] = useState(REDUCE || quieto ? target : 0);
  useEffect(() => {
    if (REDUCE || quieto) return;
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
  }, [target, quieto]);
  return v;
}

function Cifra({ c, tema, quieto }: { c: CifraVisible; tema: Tema; quieto: boolean }) {
  const { idioma } = useFormato();
  const v = useCountUp(c.valor, quieto);
  const esDinero = c.clave === "premios";
  return (
    <div className="flex items-center gap-2.5">
      {/* La MONEDA, solo junto al dinero (MARCA: --df-money es dinero y solo dinero), quieta y con el
          glow del dinero. */}
      {esDinero ? (
        <Imagen3d
          pieza="moneda"
          tema={tema}
          tamano={40}
          primeraPantalla
          className="df-glow-moneda w-9 lg:w-10"
        />
      ) : null}
      <div>
        <p
          className={`text-2xl tabular-nums ${esDinero ? "text-money" : "text-text"}`}
          style={{ fontFamily: "var(--font-display)", fontVariationSettings: '"wght" 780' }}
        >
          {esDinero ? premioCorto(v) : formatearMarcador(Math.round(v), idioma)}
        </p>
        <p className="mt-0.5 text-2xs tracking-widest text-text-dim uppercase">{c.etiqueta}</p>
      </div>
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
export function StatsInicio({
  cifras,
  tema,
  quieto = false,
}: {
  cifras: CifraVisible[];
  tema: Tema;
  /** Save-Data: las cifras salen ya puestas, sin recuento (reduced-motion ya lo hacía). */
  quieto?: boolean;
}) {
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
        <Cifra key={c.clave} c={c} tema={tema} quieto={quieto} />
      ))}
    </div>
  );
}
