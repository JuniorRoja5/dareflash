"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";

import { nombreCategoria } from "../retos/retos-datos";
import { RETO_HERO } from "./portada-datos";

/**
 * RETO DESTACADO del hero — la FIRMA a tamaño heroe (marcador grande: premio en lima + cuenta atras).
 * Ocupa el lugar de la ilustracion de la plantilla: aqui manda la CIFRA, no una foto. Isla cliente
 * minima: solo convierte el offset (`restanteMs`) en plazo absoluto en el montaje, para ver la cuenta
 * atras en vivo sin Date.now() en el render (sin mismatch de hidratacion; antes del montaje el
 * marcador muestra su placeholder). No es una tarjeta de feed: es una pieza de portada compuesta con
 * las primitivas (Marcador, PildoraCategoria), SIN primitivo nuevo.
 */
export function HeroDestacado() {
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  useEffect(() => {
    const fijarPlazo = (): void => setDeadlineMs(Date.now() + RETO_HERO.restanteMs);
    fijarPlazo();
  }, []);

  return (
    <article className="rounded-sm border border-line bg-surface p-6 lg:p-8">
      <p className="text-2xs uppercase tracking-widest text-text-dim">Reto destacado</p>
      <div className="mt-3">
        <PildoraCategoria>{nombreCategoria(RETO_HERO.categoria)}</PildoraCategoria>
      </div>
      <h2 className="mt-3 text-xl font-semibold leading-snug text-text">{RETO_HERO.titulo}</h2>

      {/* Marcador GRANDE = la firma. Dos tamaños por ancho: en movil "tarjeta" (el heroe a 64px, con
          nowrap, desborda pantallas estrechas); desde sm, "heroe". Mismo plazo para ambos. */}
      <div className="mt-5">
        <div className="sm:hidden">
          <Marcador cents={RETO_HERO.premioCents} deadlineMs={deadlineMs} tamano="tarjeta" />
        </div>
        <div className="hidden sm:block">
          <Marcador cents={RETO_HERO.premioCents} deadlineMs={deadlineMs} tamano="heroe" />
        </div>
      </div>

      <Link
        href={`/retos/${RETO_HERO.id}`}
        className="mt-6 inline-flex min-h-[44px] items-center rounded-sm border border-line px-5 text-sm font-semibold text-text transition-colors duration-150 ease-mechanical hover:bg-raised"
      >
        Ver reto
      </Link>
    </article>
  );
}
