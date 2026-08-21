"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ModalReproductor } from "@/components/ui/modal-reproductor";
import { postJsonCsrf } from "@/lib/cliente-http";
import { nombreMostrado } from "@/lib/identidad";

/** Una participación ya lista para pintar: póster firmado + datos del autor. */
export interface ParticipacionUI {
  submissionId: string;
  videoId: string;
  title: string | null;
  poster: string;
  username: string;
  displayName: string | null;
  votos: number;
  esMio: boolean;
}

/**
 * REJILLA de participaciones del detalle del reto (2d). Cada celda muestra el póster (firmado en el
 * servidor) y, al pulsarla, abre `ModalReproductor` (endpoint firmado que reexige PUBLISHED; nada de
 * iframe). Solo llegan aquí participaciones VISIBLES (Submission+Video PUBLISHED). La propia se marca
 * "Tú". Votos en lima (dinero-adyacente: es la moneda del reto), tabular.
 */
export function ParticipacionesReto({
  participaciones,
  esAdmin = false,
}: {
  participaciones: ParticipacionUI[];
  /** El admin ve un botón "Retirar" por participación (moderación reactiva). */
  esAdmin?: boolean;
}) {
  if (participaciones.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface/40 p-8 text-center text-sm text-text-dim">
        Aún no hay participaciones en este reto.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {participaciones.map((p) => (
        <li key={p.submissionId}>
          <Celda participacion={p} esAdmin={esAdmin} />
        </li>
      ))}
    </ul>
  );
}

function Celda({
  participacion: p,
  esAdmin,
}: {
  participacion: ParticipacionUI;
  esAdmin: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const autor = nombreMostrado(p.displayName, p.username);
  const etiqueta = p.title?.trim() ? `Reproducir «${p.title}»` : `Reproducir el vídeo de ${autor}`;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={etiqueta}
        title={p.title ?? undefined}
        className="group relative flex aspect-[9/16] items-center justify-center overflow-hidden rounded-sm border border-line bg-raised bg-cover bg-center transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-shadow-md)] focus-visible:-translate-y-0.5 focus-visible:shadow-[var(--df-shadow-md)] focus-visible:outline-none"
        style={{ backgroundImage: `url("${p.poster}")` }}
      >
        <span className="absolute inset-0 bg-void/25" aria-hidden />
        <span className="relative">
          <IconoPlay />
        </span>
        {p.esMio ? (
          <span className="absolute top-1.5 left-1.5 rounded-full bg-action px-2 py-0.5 text-2xs font-semibold tracking-wide text-white">
            Tú
          </span>
        ) : null}
        <span className="absolute right-1.5 bottom-1.5 rounded-full bg-void/70 px-2 py-0.5 text-2xs font-semibold tabular-nums text-money backdrop-blur-sm">
          {p.votos}
        </span>
      </button>
      <p className="mt-1.5 truncate text-xs text-text-dim">{autor}</p>
      {esAdmin ? <BotonRetirar submissionId={p.submissionId} /> : null}
      {abierto ? (
        <ModalReproductor id={p.videoId} titulo={p.title} onCerrar={() => setAbierto(false)} />
      ) : null}
    </div>
  );
}

/** Retirar (solo admin): oculta la participación de reto/feed/perfil (preserva el objeto en Bunny). */
function BotonRetirar({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [fase, setFase] = useState<"idle" | "confirmar" | "enviando" | "error">("idle");

  async function retirar(): Promise<void> {
    setFase("enviando");
    try {
      const r = await postJsonCsrf(`/api/panel/participaciones/${submissionId}/retirar`, {});
      if (r.ok) {
        router.refresh();
        return;
      }
      setFase("error");
    } catch {
      setFase("error");
    }
  }

  if (fase === "confirmar") {
    return (
      <div className="mt-1 flex items-center gap-2 text-2xs">
        <span className="text-text-dim">¿Retirar?</span>
        <button
          type="button"
          onClick={retirar}
          className="rounded-sm border border-line px-2 py-0.5 font-medium text-alarm hover:bg-raised"
        >
          Sí
        </button>
        <button
          type="button"
          onClick={() => setFase("idle")}
          className="rounded-sm border border-line px-2 py-0.5 text-text-dim hover:bg-raised"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setFase("confirmar")}
      disabled={fase === "enviando"}
      className="mt-1 text-2xs font-medium text-text-dim underline-offset-2 hover:text-alarm hover:underline disabled:opacity-40"
    >
      {fase === "enviando" ? "Retirando…" : fase === "error" ? "Reintentar retirar" : "Retirar"}
    </button>
  );
}

function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/85" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}
