"use client";

import Link from "next/link";
import { useState } from "react";

import { CajaVideo } from "@/components/ui/caja-video";
import { ContadorVotos } from "@/components/ui/contador-votos";
import { ModalReproductor } from "@/components/ui/modal-reproductor";
import { getJson } from "@/lib/cliente-http";
import { mostrarHandleSecundario, nombreMostrado } from "@/lib/identidad";

/** Una participación ya lista para pintar: póster firmado en el servidor + datos del autor. */
export interface ParticipacionUI {
  submissionId: string;
  videoId: string;
  title: string | null;
  poster: string;
  username: string;
  displayName: string | null;
  votos: number;
}

/**
 * PARTICIPACIONES del detalle del reto. Cada una se presenta como en el FEED —póster firmado, autor y
 * votos— usando la primitiva `CajaVideo`: 9:16 en móvil, 16:9 en escritorio, con el póster CENTRADO
 * como tira 9:16 y los lados rellenos por una copia DIFUMINADA del mismo póster (blurred-fill). El
 * vídeo nunca se recorta y nunca hay barras negras; es la misma regla de formato que el reproductor,
 * así que la miniatura ya encuadra igual que lo que se abre al pulsar.
 *
 * PAGINACIÓN KEYSET: la primera página llega del Server Component; "Ver más participaciones" pide la
 * siguiente a `/api/retos/{id}/participaciones?cursor=…` y la ANEXA. Botón explícito, no scroll
 * infinito: en una lista ORDENADA POR VOTOS el final importa (es el último puesto), y un scroll sin
 * fin nunca deja llegar a él. `nextCursor === null` = no hay más y el botón desaparece.
 *
 * MODERACIÓN: aquí NO. Retirar una participación vive en `/panel/retos/{id}` (el admin modera desde el
 * panel, no desde la pantalla pública, donde el botón quedaba a un clic del público y fuera de sitio).
 */
export function ParticipacionesReto({
  challengeId,
  participaciones,
  cursorInicial,
  miSubmissionId = null,
  haySesion = false,
}: {
  challengeId: string;
  participaciones: ParticipacionUI[];
  cursorInicial: string | null;
  /** ¿Hay sesión? Solo decide si el reproductor marca "visto" (un invitado no marca). La vista es
   *  pública: esto NO oculta ni protege nada, y el endpoint lo comprueba igualmente. */
  haySesion?: boolean;
  /** Id de MI participación (si participo): marca la mía con "Tú" sin consultar la sesión aquí. */
  miSubmissionId?: string | null;
}) {
  const [items, setItems] = useState<ParticipacionUI[]>(participaciones);
  const [cursor, setCursor] = useState<string | null>(cursorInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  async function cargarMas(): Promise<void> {
    if (cursor === null || cargando) return;
    setCargando(true);
    setError(false);
    try {
      const r = await getJson<{ items: ParticipacionUI[]; nextCursor: string | null }>(
        `/api/retos/${encodeURIComponent(challengeId)}/participaciones?cursor=${encodeURIComponent(cursor)}`,
      );
      if (!r.ok) {
        setError(true);
        return;
      }
      // El cursor garantiza que la página nueva NO repite filas: se anexa tal cual.
      setItems((previos) => [...previos, ...r.data.items]);
      setCursor(r.data.nextCursor);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface/40 p-8 text-center text-sm text-text-dim">
        Aún no hay participaciones en este reto. Sé el primero.
      </p>
    );
  }

  return (
    <>
      <ul role="list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p, i) => (
          <li key={p.submissionId}>
            <Celda
              participacion={p}
              puesto={i + 1}
              esMio={p.submissionId === miSubmissionId}
              haySesion={haySesion}
            />
          </li>
        ))}
      </ul>

      {cursor !== null ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void cargarMas()}
            disabled={cargando}
            className="rounded-sm border border-line bg-surface/60 px-5 py-2 text-sm font-medium text-text backdrop-blur-md transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:opacity-50"
          >
            {cargando ? "Cargando…" : "Ver más participaciones"}
          </button>
          {error ? (
            <p role="status" className="text-2xs text-alarm">
              No se pudieron cargar más. Inténtalo de nuevo.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * Una participación. Toda la caja es UN botón que abre el reproductor (tap/Enter/Espacio, con
 * `aria-label`); el autor va DEBAJO como enlace hermano —nunca anidado dentro del botón— para que
 * "ver el perfil" y "reproducir" sigan siendo dos acciones distintas.
 */
function Celda({
  participacion: p,
  puesto,
  esMio,
  haySesion,
}: {
  participacion: ParticipacionUI;
  puesto: number;
  esMio: boolean;
  /** ¿Marcar la reproducción como "vista"? Solo con sesión. */
  haySesion: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const autor = nombreMostrado(p.displayName, p.username);
  const etiqueta = p.title?.trim() ? `Reproducir «${p.title}»` : `Reproducir el vídeo de ${autor}`;
  const fondo = `url("${p.poster}")`;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={etiqueta}
        title={p.title ?? undefined}
        className="group block w-full overflow-hidden rounded-sm border border-line transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-shadow-md)] focus-visible:-translate-y-0.5 focus-visible:shadow-[var(--df-shadow-md)] focus-visible:outline-none"
      >
        <CajaVideo
          // Blurred-fill: el MISMO póster, escalado y difuminado, rellena los lados en escritorio.
          relleno={
            <div
              aria-hidden
              className="absolute inset-0 scale-125 bg-cover bg-center blur-xl"
              style={{ backgroundImage: fondo }}
            />
          }
          overlays={
            <>
              {/* Velo + play: el póster es una miniatura, no una foto suelta; se lee que es vídeo. */}
              <span
                className="pointer-events-none absolute inset-0 grid place-items-center bg-void/20"
                aria-hidden
              >
                <IconoPlay />
              </span>
              {/* Puesto: SOLO el número, en neutro. El oro/plata/bronce es del PODIO del ranking
                  (--df-rank), no de una rejilla; aquí sería un color semántico mal usado. */}
              <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-void/70 px-2 py-0.5 text-2xs font-semibold tabular-nums text-text-dim backdrop-blur-sm">
                #{puesto}
              </span>
              {esMio ? (
                <span className="pointer-events-none absolute top-2 right-2 rounded-full border border-line bg-void/70 px-2 py-0.5 text-2xs font-semibold tracking-wide text-text backdrop-blur-sm">
                  Tú
                </span>
              ) : null}
              {/* Votos: NEUTROS (la primitiva manda). No llevan lima: la lima es DINERO, y un voto
                  no es dinero; el premio del reto ya ocupa ese color en la cabecera. */}
              <span className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-void/70 px-2 py-0.5 text-2xs font-semibold text-text backdrop-blur-sm">
                <ContadorVotos votos={p.votos} />
                <span>{p.votos === 1 ? "voto" : "votos"}</span>
              </span>
            </>
          }
        >
          {/* Póster NÍTIDO centrado (la tira 9:16 real del vídeo). */}
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: fondo }}
          />
        </CajaVideo>
      </button>

      <div className="mt-2 flex min-w-0 items-baseline gap-1.5">
        <Link
          href={`/u/${p.username}`}
          className="truncate text-sm font-medium text-text hover:underline"
        >
          {autor}
        </Link>
        {mostrarHandleSecundario(p.displayName) ? (
          <span className="truncate text-2xs text-text-dim">@{p.username}</span>
        ) : null}
      </div>
      {p.title?.trim() ? <p className="truncate text-2xs text-text-dim">{p.title}</p> : null}

      {abierto ? (
        <ModalReproductor
          id={p.videoId}
          titulo={p.title}
          onCerrar={() => setAbierto(false)}
          /* El id de la PARTICIPACIÓN, no el del vídeo: es de lo que hablan las rutas del gate y
             del voto, y pasarles un id de Video daría 404. La sesión viaja aparte: es del usuario,
             no del vídeo, y así la guarda `sin-sesion` recibe el dato real. */
          participacionVista={p.submissionId}
          haySesion={haySesion}
        />
      ) : null}
    </div>
  );
}

/** Triángulo de "play" sobre el póster. SVG inline, como el resto del sistema (sin librerías). */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9 text-white/85" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}
