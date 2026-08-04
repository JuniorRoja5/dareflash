"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { ContadorVotos } from "@/components/ui/contador-votos";
import { Marcador } from "@/components/ui/marcador";

/**
 * Islas CLIENTE del detalle (lo unico "vivo"). El contenido estatico vive en el server; aqui solo
 * lo que necesita el navegador. No se toca ningun primitivo.
 */

/** Marcador de la cabecera: el plazo absoluto se calcula en el montaje (offset del mock + now), sin
 *  Date.now() en el render ni mismatch de hidratacion (el marcador muestra placeholder hasta el
 *  efecto). */
export function MarcadorVivo({ cents, restanteMs }: { cents: number; restanteMs: number }) {
  const [deadlineMs, setDeadlineMs] = useState<number | null>(null);
  useEffect(() => {
    const fijarPlazo = (): void => setDeadlineMs(Date.now() + restanteMs);
    fijarPlazo();
  }, [restanteMs]);
  return <Marcador cents={cents} deadlineMs={deadlineMs} tamano="tarjeta" />;
}

/**
 * Bloque de votar (patron de VotoDemo, ya como componente real): participante + recuento
 * (`ContadorVotos`, neutro) + boton PRINCIPAL a lo ancho. Al votar: el contador hace su golpe seco +
 * incremento lento, el boton cambia de voz "Votar este vídeo" -> "Votado" y se deshabilita (un voto
 * por sesion en la maqueta), y aparece la confirmacion en --df-ok. Texto NEGRO sobre el magenta.
 */
export function BloqueVoto({
  autorUsername,
  votosIniciales,
}: {
  autorUsername: string;
  votosIniciales: number;
}) {
  const [votos, setVotos] = useState(votosIniciales);
  const [votado, setVotado] = useState(false);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar nombre={autorUsername} tamano="md" />
          <span className="truncate font-medium text-text">@{autorUsername}</span>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-semibold leading-none text-text">
            <ContadorVotos votos={votos} />
          </p>
          <p className="mt-1 text-2xs uppercase tracking-widest text-text-dim">votos</p>
        </div>
      </div>

      <Boton
        variante="principal"
        disabled={votado}
        onClick={() => {
          setVotos((v) => v + 1);
          setVotado(true);
        }}
        className="mt-4 w-full py-4 text-base"
      >
        {votado ? "Votado" : "Votar este vídeo"}
      </Boton>

      {votado ? (
        <p className="mt-2 text-center text-sm text-ok" role="status">
          Voto registrado
        </p>
      ) : null}
    </div>
  );
}
