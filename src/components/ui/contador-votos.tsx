"use client";

import { useEffect, useRef, useState } from "react";

import { useFormato } from "@/components/formato-provider";
import { formatearMarcador } from "@/lib/formato";

const prefiereMenosMovimiento = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * CONTADOR DE VOTOS — `tabular-nums`, color NEUTRO (los votos NO son un color semantico: no llevan
 * ni --df-money ni --df-action). El incremento se anima LENTO (permitido: es de las pocas cosas que se mueven
 * despacio); un voto propio se confirma con un GOLPE SECO (pulso rapido y mecanico), no con una
 * animacion mona. Bajo `prefers-reduced-motion` el numero salta sin tween.
 */
export function ContadorVotos({ votos, className = "" }: { votos: number; className?: string }) {
  // El idioma de quien mira, del proveedor del layout (Fase 11): el número sale de `lib/formato`.
  const { idioma } = useFormato();
  const [mostrado, setMostrado] = useState(votos);
  const [golpe, setGolpe] = useState(false);
  const prev = useRef(votos);

  useEffect(() => {
    const desde = prev.current;
    prev.current = votos;
    if (votos === desde) return;

    if (votos > desde && !prefiereMenosMovimiento()) {
      setGolpe(true);
      const finGolpe = setTimeout(() => setGolpe(false), 180); // golpe seco
      const dur = 600; // incremento lento
      let raf = 0;
      let inicioTs = 0;
      const paso = (t: number): void => {
        if (inicioTs === 0) inicioTs = t; // primer frame: fija el origen (timestamp del rAF)
        const p = Math.min(1, (t - inicioTs) / dur);
        setMostrado(Math.round(desde + (votos - desde) * p));
        if (p < 1) raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
      return () => {
        clearTimeout(finGolpe);
        cancelAnimationFrame(raf);
      };
    }
    setMostrado(votos); // reduced-motion o bajada: salto directo
  }, [votos]);

  return (
    <span
      className={`inline-block tabular-nums transition-transform duration-150 ease-mechanical ${golpe ? "scale-110" : "scale-100"} ${className}`}
      aria-label={`${formatearMarcador(votos, idioma)} votos`}
    >
      {formatearMarcador(mostrado, idioma)}
    </span>
  );
}
