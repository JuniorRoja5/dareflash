"use client";

import { useState } from "react";

import { ModalReproductor } from "@/components/ui/modal-reproductor";

import type { VideoCelda } from "./perfil-vista";

/**
 * CELDA de la rejilla del perfil: el póster firmado de un vídeo PUBLISHED que, al pulsarlo, ABRE el
 * modal de reproducción. Toda la celda es UN botón (tap/Enter/Espacio) con `aria-label` para lectores.
 *
 * La rejilla del perfil SOLO contiene vídeos PUBLISHED (contrato de `VideoCelda`), así que pulsar una
 * celda siempre intenta reproducir; el guardarrail real de estado lo pone el endpoint firmado (si el
 * vídeo dejara de ser reproducible responde 404 y el modal muestra "no disponible", no un player roto).
 */
export function CeldaVideo({ video }: { video: VideoCelda }) {
  const [abierto, setAbierto] = useState(false);
  const etiqueta = video.title?.trim() ? `Reproducir «${video.title}»` : "Reproducir vídeo";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={etiqueta}
        title={video.title ?? undefined}
        className="group relative flex aspect-[9/16] items-center justify-center overflow-hidden rounded-sm border border-line bg-raised bg-cover bg-center transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-shadow-md)] focus-visible:-translate-y-0.5 focus-visible:shadow-[var(--df-shadow-md)] focus-visible:outline-none"
        style={{ backgroundImage: `url("${video.poster}")` }}
      >
        <span className="absolute inset-0 bg-void/25" aria-hidden />
        <span className="relative">
          <IconoPlay />
        </span>
      </button>
      {abierto ? (
        <ModalReproductor id={video.id} titulo={video.title} onCerrar={() => setAbierto(false)} />
      ) : null}
    </>
  );
}

/** Triángulo de "play" sutil sobre el póster de cada celda. */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/85" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}
