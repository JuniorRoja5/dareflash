"use client";

import { useState } from "react";

import { ModalReproductor } from "@/components/ui/modal-reproductor";

import { BorrarVideo } from "./borrar-video";
import type { EstadoVideo } from "./perfil-logic";
import type { VideoCelda } from "./perfil-vista";

/**
 * Copy HUMANO de cada estado (el usuario nunca ve PENDING/FAILED/TOO_LONG). `tono` elige el color
 * semántico: menta SOLO para la confirmación (Publicado), rojo para lo que no saldrá; "Procesando"
 * es neutro (el ámbar está reservado a tiempo restante, no se toca aquí).
 */
const COPY_ESTADO: Record<EstadoVideo, { texto: string; tono: "neutro" | "ok" | "alarma" }> = {
  procesando: { texto: "Procesando", tono: "neutro" },
  publicado: { texto: "Publicado", tono: "ok" },
  "demasiado-largo": { texto: "No publicado: supera los 90 segundos", tono: "alarma" },
  // Parte C: estuvo publicado pero su objeto en Bunny desapareció. NO es un fallo de proceso.
  "no-disponible": { texto: "Este vídeo ya no está disponible", tono: "alarma" },
  error: { texto: "No se pudo procesar", tono: "alarma" },
};

const TONO_TEXTO: Record<"neutro" | "ok" | "alarma", string> = {
  neutro: "text-text-dim",
  ok: "text-ok",
  alarma: "text-alarm",
};

/**
 * CELDA de la rejilla del perfil. El vídeo PUBLICADO muestra su póster y, al pulsarlo, ABRE el modal
 * de reproducción (toda la celda es UN botón: tap/Enter/Espacio, con `aria-label`). El que aún NO se
 * publica muestra un marcador neutro con icono y NO abre nada (todavía no hay reproducción). La
 * etiqueta de ESTADO se pinta SOLO si el dueño la pasó (`estado`); el perfil público de otro no la
 * incluye, así que no puede aparecer —ni filtrarse— fuera del dueño.
 *
 * Guardarrail real de estado: lo pone el endpoint firmado. Si un vídeo publicado dejara de ser
 * reproducible responde 404 y el modal muestra "no disponible", nunca un player roto.
 */
export function CeldaVideo({ video, esPropio = false }: { video: VideoCelda; esPropio?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const info = video.estado ? COPY_ESTADO[video.estado] : null;
  const publicado = video.poster !== "";
  const etiqueta = video.title?.trim() ? `Reproducir «${video.title}»` : "Reproducir vídeo";

  return (
    <div className="relative flex flex-col">
      {publicado ? (
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
      ) : (
        <div
          title={video.title ?? undefined}
          className="flex aspect-[9/16] items-center justify-center overflow-hidden rounded-sm border border-line bg-raised"
        >
          {video.estado === "procesando" ? <IconoReloj /> : <IconoAviso />}
        </div>
      )}
      {info ? (
        <p className={`mt-1.5 text-2xs leading-tight ${TONO_TEXTO[info.tono]}`}>{info.texto}</p>
      ) : null}
      {/* Borrar: SOLO en el perfil propio. Va como hermano (no dentro del <button> de la celda) y por
          encima, con confirmación; el endpoint reverifica que el vídeo es del usuario de la sesión. */}
      {esPropio ? <BorrarVideo videoId={video.id} titulo={video.title} /> : null}
      {abierto ? (
        <ModalReproductor id={video.id} titulo={video.title} onCerrar={() => setAbierto(false)} />
      ) : null}
    </div>
  );
}

/** Triángulo de "play" sutil sobre el póster de cada celda publicada. */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/85" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/** Reloj: vídeo aún en proceso (sin póster todavía). */
function IconoReloj() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7 text-text-dim"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2" />
    </svg>
  );
}

/** Aviso: vídeo que no llegó a publicarse. */
function IconoAviso() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7 text-alarm"
      aria-hidden
    >
      <path d="M12 4l9 15H3z" />
      <path d="M12 10v4" />
      <path d="M12 17.5v.5" />
    </svg>
  );
}
