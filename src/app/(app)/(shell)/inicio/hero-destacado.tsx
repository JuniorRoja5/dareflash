"use client";

import { useEffect, useState } from "react";

import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";

import { nombreCategoria } from "../retos/retos-datos";
import { RETO_HERO } from "./portada-datos";

/** Participantes del reto destacado — MAQUETA. En produccion = COUNT(Submission) del Challenge. */
const PARTICIPANTES = 247;

function IconoPlay() {
  return (
    <span className="grid h-14 w-14 place-items-center rounded-full border border-line bg-void/40">
      <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6 text-text" fill="currentColor" aria-hidden>
        <path d="M9 6.5v11l9-5.5z" />
      </svg>
    </span>
  );
}

/**
 * RETO DESTACADO del hero (brief v2) — un CHALLENGE (no una persona): el de MAYOR PREMIO activo. Vídeo
 * 9:16 con placeholder SOBRIO (Bunny monta el player; nada de monigotes/degradados), categoria + "Reto
 * destacado", agregados del reto (participantes · votos, NO un @autor) y el MARCADOR (firma) corriendo
 * con halo lima. v2: glow magenta detras, tarjeta glass + sombra, flotar sutil. Isla cliente solo para
 * la cuenta atras en vivo (offset -> plazo absoluto en el montaje, sin mismatch de hidratacion).
 */
export function HeroDestacado() {
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  useEffect(() => {
    const fijarPlazo = (): void => setDeadlineMs(Date.now() + RETO_HERO.restanteMs);
    fijarPlazo();
  }, []);

  return (
    <div className="relative">
      {/* glow magenta del v2 (impacto, nuestro color; NO foto de stock) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <div className="df-float mx-auto w-full max-w-[320px]">
        <div className="df-sheen relative aspect-[9/16] overflow-hidden rounded-sm border border-line bg-raised shadow-[var(--df-shadow-lg)]">
          <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between gap-2">
            <PildoraCategoria>{nombreCategoria(RETO_HERO.categoria)}</PildoraCategoria>
            <span className="rounded-full border border-line bg-void/60 px-2.5 py-1 text-2xs font-semibold tracking-wide text-text uppercase">
              Reto destacado
            </span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <IconoPlay />
          </div>
          <div className="absolute inset-x-0 bottom-0 z-10 border-t border-line bg-void/65 px-3 py-3">
            <h2 className="text-base leading-snug font-semibold text-text">{RETO_HERO.titulo}</h2>
            <p className="mt-0.5 text-2xs tabular-nums text-text-dim">
              {PARTICIPANTES} participantes · {RETO_HERO.votos.toLocaleString("en-US")} votos
            </p>
            <div className="mt-2" style={{ filter: "var(--df-glow-lima)" }}>
              <Marcador cents={RETO_HERO.premioCents} deadlineMs={deadlineMs} tamano="tarjeta" />
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-text-dim">
          El <span className="font-medium text-text">mayor premio</span> en juego ahora mismo
        </p>
      </div>
    </div>
  );
}
