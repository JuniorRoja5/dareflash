"use client";

import { useEffect, useState } from "react";

import { ContadorVotos } from "@/components/ui/contador-votos";
import { CuentaAtras, type TamanoCuenta } from "@/components/ui/cuenta-atras";
import { Marcador, type TamanoMarcador } from "@/components/ui/marcador";

/**
 * Wrappers EN VIVO solo para la hoja de estilo (dev-only). Las primitivas reciben un `deadlineMs`
 * ABSOLUTO (como en producto); aqui, para demostrar estados relativos ("dentro de 23 h"), el plazo
 * se calcula en un efecto (Date.now() + offset) y se pasa a la primitiva. Antes de montar es `null`
 * -> la primitiva muestra su placeholder estable, sin Date.now() en render ni mismatch.
 */

export function CuentaAtrasEnVivo({
  offsetMs,
  tamano,
}: {
  offsetMs: number;
  tamano?: TamanoCuenta;
}) {
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  useEffect(() => {
    const fijarPlazo = (): void => setDeadlineMs(Date.now() + offsetMs);
    fijarPlazo();
  }, [offsetMs]);
  return <CuentaAtras deadlineMs={deadlineMs} tamano={tamano} />;
}

export function MarcadorEnVivo({
  cents,
  offsetMs,
  tamano,
}: {
  cents: number;
  offsetMs: number;
  tamano?: TamanoMarcador;
}) {
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  useEffect(() => {
    const fijarPlazo = (): void => setDeadlineMs(Date.now() + offsetMs);
    fijarPlazo();
  }, [offsetMs]);
  return <Marcador cents={cents} deadlineMs={deadlineMs} tamano={tamano} />;
}

/**
 * Demo interactiva del CONTADOR DE VOTOS. El boton dice lo que pasa ("Votar" -> "Votado", la accion
 * conserva su nombre); el voto se confirma con el golpe seco del contador + la marca en --df-ok
 * (confirmacion). Un solo magenta.
 */
export function VotoDemo({ inicial = 1248 }: { inicial?: number }) {
  const [votos, setVotos] = useState(inicial);
  const [votado, setVotado] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        disabled={votado}
        onClick={() => {
          setVotos((v) => v + 1);
          setVotado(true);
        }}
        className="rounded-sm bg-action px-5 py-2.5 text-sm font-semibold text-void transition-[filter] duration-150 ease-mechanical hover:brightness-110 disabled:opacity-60"
      >
        {votado ? "Votado" : "Votar"}
      </button>
      <span className="text-xl font-semibold">
        <ContadorVotos votos={votos} />{" "}
        <span className="text-sm font-normal text-text-dim">votos</span>
      </span>
      {votado && <span className="text-sm text-ok">· voto registrado</span>}
    </div>
  );
}
