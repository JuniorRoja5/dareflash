"use client";

import Link from "next/link";
import { useState } from "react";

import { ModalReproductor } from "@/components/ui/modal-reproductor";
import { getJson, postJsonCsrf } from "@/lib/cliente-http";
import { nombreMostrado } from "@/lib/identidad";
import type { EstadoParticipacionAdmin } from "@/server/services/participaciones-lista";

/** Una participación tal y como la recibe el panel (el póster ya viene firmado del servidor). */
export interface ParticipacionPanelUI {
  submissionId: string;
  videoId: string;
  title: string | null;
  /** Firmado si el vídeo es reproducible; "" si no (no se pinta una imagen que daría rota). */
  poster: string;
  username: string;
  displayName: string | null;
  votos: number;
  estado: EstadoParticipacionAdmin;
  creadaEnMs: number;
  reproducible: boolean;
}

/**
 * COPY de cada estado. Humano, nunca el código técnico: el admin lee "Retirada", no "REMOVED". El tono
 * elige el color semántico — menta solo para lo que SÍ está publicado, rojo para lo retirado, neutro
 * para lo que aún está en curso (el ámbar está reservado al tiempo).
 */
const COPY_ESTADO: Record<
  EstadoParticipacionAdmin,
  { texto: string; clase: string; ayuda: string }
> = {
  visible: {
    texto: "Visible",
    clase: "bg-ok/15 text-ok",
    ayuda: "La está viendo el público en el reto, el feed y el perfil.",
  },
  procesando: {
    texto: "Procesando",
    clase: "bg-raised text-text-dim",
    ayuda: "El vídeo se está subiendo o convirtiendo; aún no se ve.",
  },
  "no-publicada": {
    texto: "No publicada",
    clase: "bg-raised text-text-dim",
    ayuda: "El vídeo no llegó a publicarse (falló o se rechazó).",
  },
  retirada: {
    texto: "Retirada",
    clase: "bg-alarm/15 text-alarm",
    ayuda: "Retirada por moderación: no se ve en ningún sitio. El vídeo se conserva en Bunny.",
  },
};

/**
 * LISTA DE MODERACIÓN de un reto. Aquí SÍ vive "Retirar" (en la vista pública estaba fuera de sitio):
 * el admin ve TODAS las participaciones —incluidas las que el público no ve— con su autor, su estado en
 * copy humano, sus votos y el vídeo.
 *
 * NO hay endpoint nuevo para retirar: usa el que ya existía, `POST /api/panel/participaciones/{id}/
 * retirar`, que se reprotege solo (requireRole ADMIN + CSRF) y marca Submission y Video REMOVED
 * preservando el objeto en Bunny. Esta pantalla es SOLO la interfaz.
 *
 * Paginación por CURSOR contra `/api/panel/retos/{id}/participaciones` (mismo keyset que la lista
 * pública). Tras retirar se actualiza la fila EN SITIO, sin recargar: recargar la página perdería el
 * scroll y las páginas ya cargadas, justo cuando el admin está revisando una lista larga.
 */
export function ParticipacionesPanel({
  challengeId,
  participaciones,
  cursorInicial,
}: {
  challengeId: string;
  participaciones: ParticipacionPanelUI[];
  cursorInicial: string | null;
}) {
  const [items, setItems] = useState<ParticipacionPanelUI[]>(participaciones);
  const [cursor, setCursor] = useState<string | null>(cursorInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  async function cargarMas(): Promise<void> {
    if (cursor === null || cargando) return;
    setCargando(true);
    setError(false);
    try {
      const r = await getJson<{ items: ParticipacionPanelUI[]; nextCursor: string | null }>(
        `/api/panel/retos/${encodeURIComponent(challengeId)}/participaciones?cursor=${encodeURIComponent(cursor)}`,
      );
      if (!r.ok) {
        setError(true);
        return;
      }
      setItems((previos) => [...previos, ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  /** Marca una fila como retirada en el estado local (el servidor ya lo hizo). */
  function marcarRetirada(submissionId: string): void {
    setItems((previos) =>
      previos.map((p) =>
        p.submissionId === submissionId ? { ...p, estado: "retirada", reproducible: false } : p,
      ),
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface/40 p-6 text-center text-sm text-text-dim">
        Todavía no ha participado nadie en este reto.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-sm border border-line bg-surface/60">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-2xs tracking-widest text-text-dim uppercase">
              <th className="px-4 py-3 font-semibold">Participación</th>
              <th className="px-4 py-3 font-semibold">Autor</th>
              <th className="px-4 py-3 text-right font-semibold">Votos</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((p) => (
              <Fila key={p.submissionId} p={p} onRetirada={() => marcarRetirada(p.submissionId)} />
            ))}
          </tbody>
        </table>
      </div>

      {cursor !== null ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void cargarMas()}
            disabled={cargando}
            className="min-h-[36px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
          >
            {cargando ? "Cargando…" : "Ver más participaciones"}
          </button>
          {error ? (
            <span role="alert" className="text-xs text-alarm">
              No se pudieron cargar más. Inténtalo de nuevo.
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Fila({ p, onRetirada }: { p: ParticipacionPanelUI; onRetirada: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const autor = nombreMostrado(p.displayName, p.username);
  const estado = COPY_ESTADO[p.estado];

  return (
    <tr className="align-middle transition-colors hover:bg-raised/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {p.reproducible ? (
            <button
              type="button"
              onClick={() => setAbierto(true)}
              aria-label={
                p.title?.trim() ? `Reproducir «${p.title}»` : `Reproducir el vídeo de ${autor}`
              }
              className="relative grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded-sm border border-line bg-raised bg-cover bg-center transition-colors hover:border-text-dim focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-text-dim"
              style={p.poster ? { backgroundImage: `url("${p.poster}")` } : undefined}
            >
              <span className="absolute inset-0 bg-void/25" aria-hidden />
              <IconoPlay />
            </button>
          ) : (
            // Sin reproducción: un vídeo no publicado (o retirado) NO es reproducible — el endpoint
            // firmado lo reexige y respondería 404. Se dice, en vez de ofrecer un play que fallaría.
            <span
              className="grid h-12 w-9 shrink-0 place-items-center rounded-sm border border-dashed border-line text-2xs text-text-dim"
              title="Este vídeo no se puede reproducir en su estado actual."
              aria-hidden
            >
              —
            </span>
          )}
          <span className="min-w-0">
            <span className="block max-w-[24ch] truncate text-text">
              {p.title?.trim() ? p.title : "Sin título"}
            </span>
          </span>
        </div>
        {/* El modal se monta por portal a <body>, así que da igual desde qué celda se renderice; va
            aquí, junto al botón que lo abre, y no en una celda fantasma que descuadraría la tabla. */}
        {abierto ? (
          <ModalReproductor id={p.videoId} titulo={p.title} onCerrar={() => setAbierto(false)} />
        ) : null}
      </td>
      <td className="px-4 py-3">
        <Link href={`/u/${p.username}`} className="text-text-dim hover:text-text hover:underline">
          {autor}
        </Link>
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums text-text">{p.votos}</td>
      <td className="px-4 py-3">
        <span
          title={estado.ayuda}
          className={`inline-block rounded-full px-2.5 py-0.5 text-2xs font-semibold tracking-widest uppercase ${estado.clase}`}
        >
          {estado.texto}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-text-dim tabular-nums">
        {new Date(p.creadaEnMs).toLocaleDateString("es-ES", { timeZone: "UTC" })}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {p.estado === "retirada" ? (
            <span className="text-2xs text-text-dim">Ya retirada</span>
          ) : (
            <Retirar submissionId={p.submissionId} autor={autor} onRetirada={onRetirada} />
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * RETIRAR (solo admin). Reutiliza el endpoint existente; aquí no hay lógica de negocio, solo la
 * confirmación de dos pasos: retirar es una acción con consecuencias para un usuario real y no puede
 * dispararse con un clic accidental en una tabla larga.
 */
function Retirar({
  submissionId,
  autor,
  onRetirada,
}: {
  submissionId: string;
  autor: string;
  onRetirada: () => void;
}) {
  const [fase, setFase] = useState<"idle" | "confirmar" | "enviando" | "error">("idle");

  async function retirar(): Promise<void> {
    setFase("enviando");
    try {
      const r = await postJsonCsrf(`/api/panel/participaciones/${submissionId}/retirar`, {});
      if (r.ok) {
        onRetirada();
        return;
      }
      setFase("error");
    } catch {
      setFase("error");
    }
  }

  if (fase === "confirmar") {
    return (
      <span className="flex items-center gap-2 text-2xs">
        <span className="text-text-dim">¿Retirar la de {autor}?</span>
        <button
          type="button"
          onClick={() => void retirar()}
          className="min-h-[32px] rounded-sm border border-line px-2 font-medium text-alarm transition-colors hover:bg-raised"
        >
          Sí, retirar
        </button>
        <button
          type="button"
          onClick={() => setFase("idle")}
          className="min-h-[32px] rounded-sm border border-line px-2 text-text-dim transition-colors hover:bg-raised"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setFase("confirmar")}
        disabled={fase === "enviando"}
        className="min-h-[36px] rounded-sm border border-line px-3 text-sm font-medium text-text transition-colors duration-150 ease-mechanical hover:bg-raised disabled:opacity-40"
      >
        {fase === "enviando" ? "Retirando…" : "Retirar"}
      </button>
      {fase === "error" ? (
        <span role="alert" className="text-xs text-alarm">
          No se pudo retirar.
        </span>
      ) : null}
    </span>
  );
}

function IconoPlay() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="relative h-4 w-4 text-white/85"
      fill="currentColor"
      aria-hidden
    >
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}
