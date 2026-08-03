"use client";

import { useEffect, useRef, useState } from "react";

const prefiereMenosMovimiento = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * CONTADOR DE VOTOS — `tabular-nums`, color NEUTRO (los votos NO son un color semantico: no llevan
 * lima ni magenta). El incremento se anima LENTO (permitido: es de las pocas cosas que se mueven
 * despacio); un voto propio se confirma con un GOLPE SECO (pulso rapido y mecanico), no con una
 * animacion mona. Bajo `prefers-reduced-motion` el numero salta sin tween.
 */
export function ContadorVotos({ votos, className = "" }: { votos: number; className?: string }) {
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
      const inicio = Date.now();
      const dur = 600; // incremento lento
      const id = setInterval(() => {
        const p = Math.min(1, (Date.now() - inicio) / dur);
        setMostrado(Math.round(desde + (votos - desde) * p));
        if (p >= 1) clearInterval(id);
      }, 40);
      return () => {
        clearTimeout(finGolpe);
        clearInterval(id);
      };
    }
    setMostrado(votos); // reduced-motion o bajada: salto directo
  }, [votos]);

  return (
    <span
      className={`inline-block tabular-nums transition-transform duration-150 ease-mechanical ${golpe ? "scale-110" : "scale-100"} ${className}`}
      aria-label={`${votos.toLocaleString("en-US")} votos`}
    >
      {mostrado.toLocaleString("en-US")}
    </span>
  );
}
