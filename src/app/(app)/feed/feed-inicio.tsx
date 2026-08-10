"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { PildoraCategoria } from "@/components/ui/pildora";

import { COMENTARIOS_FEED, formatearContador, POSTS_INICIO, type PostVista } from "./inicio-datos";

/** Iconos de accion: trazo 1.8 px, currentColor (blanco sobre video; negro dentro del circulo de VOTA). */
function IconoAccion({ children, bold = false }: { children: ReactNode; bold?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={bold ? 2.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={bold ? "h-6 w-6" : "h-7 w-7"}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const IconoCorazon = () => (
  <IconoAccion>
    <path d="M12 21C7 17.5 4 14.6 4 10.8 4 8.4 5.9 6.5 8.3 6.5c1.6 0 2.8.8 3.7 2 .9-1.2 2.1-2 3.7-2 2.4 0 4.3 1.9 4.3 4.3 0 3.8-3 6.7-8 10.2z" />
  </IconoAccion>
);
const IconoComentario = () => (
  <IconoAccion>
    <path d="M5 5h14v10H9l-4 4z" />
  </IconoAccion>
);
// VOTAR = check/tick propio (nuestra gramatica). Bold, negro (hereda text-void del circulo magenta).
const IconoVoto = () => (
  <IconoAccion bold>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </IconoAccion>
);
const IconoCompartir = () => (
  <IconoAccion>
    <path d="M12 15V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M5 13v6h14v-6" />
  </IconoAccion>
);

function IconoPlayGrande() {
  return (
    <svg viewBox="0 0 24 24" className="h-16 w-16 text-white/25" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/**
 * Boton de accion. Neutro (icono blanco) salvo VOTA (`destacado`): circulo magenta con icono NEGRO =
 * la UNICA accion magenta de contenido (movil sobre el video; desktop en la columna de acciones fuera
 * del video). Zona tactil 44 px. Maqueta (presentacional).
 */
function Accion({
  label,
  valor,
  icono,
  destacado = false,
}: {
  label: string;
  valor: number;
  icono: ReactNode;
  destacado?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={`${label} (${formatearContador(valor)})`}
      className="flex flex-col items-center gap-1"
    >
      <span
        className={
          destacado
            ? "flex h-14 w-14 items-center justify-center rounded-full bg-action text-void"
            : "flex h-11 w-11 items-center justify-center text-white lg:text-text lg:hover:text-white"
        }
      >
        {icono}
      </span>
      <span className="text-2xs font-semibold tabular-nums text-white lg:text-text-dim">
        {formatearContador(valor)}
      </span>
    </button>
  );
}

/**
 * Un post. DOM en orden MOVIL (video con info/acciones ENCIMA); el grid de FeedInicio recompone en lg.
 * Movil (<lg): video a sangre completa, scrim, info abajo-izquierda y acciones flotantes a la derecha
 * (VOTA magenta) — EXACTAMENTE como hoy. Desktop (lg): el video queda LIMPIO (scrim/info `lg:hidden`),
 * las acciones salen del video (`lg:static`) a su columna, y la info del post se muestra en el panel.
 */
function PostInicio({ post, alRef }: { post: PostVista; alRef: (el: HTMLElement | null) => void }) {
  return (
    <section
      ref={alRef}
      className="relative flex h-[100svh] snap-start items-center justify-center lg:gap-5"
    >
      {/* VIDEO (Bunny monta el player; no se tocan sus tripas) */}
      <div className="relative h-full w-full overflow-hidden bg-raised lg:h-[86svh] lg:w-auto lg:rounded-sm lg:border lg:border-line lg:aspect-[9/16]">
        <div className="absolute inset-0 flex items-center justify-center">
          <IconoPlayGrande />
        </div>
        {/* Scrim (velo) — solo movil (en desktop el video queda limpio) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent lg:hidden" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 to-transparent lg:hidden" />
        {/* Info sobre el video — solo movil (en desktop va al panel) */}
        <div className="absolute bottom-0 left-0 w-3/4 p-4 pb-24 lg:hidden">
          <p className="text-base font-semibold text-white">@{post.username}</p>
          <p className="mt-1 line-clamp-2 text-sm text-white/90">Reto: {post.retoTitulo}</p>
          <div className="mt-2">
            <PildoraCategoria>{post.categoria}</PildoraCategoria>
          </div>
        </div>
      </div>

      {/* ACCIONES: sobre el video en movil (absolute), FUERA del video en desktop (static) */}
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-5 lg:static lg:right-auto lg:bottom-auto">
        <Accion label="Me gusta" valor={post.meGusta} icono={<IconoCorazon />} />
        <Accion label="Comentar" valor={post.comentarios} icono={<IconoComentario />} />
        <Accion label="Votar" valor={post.votos} icono={<IconoVoto />} destacado />
        <Accion label="Compartir" valor={post.compartidos} icono={<IconoCompartir />} />
      </div>
    </section>
  );
}

/** Panel de comentarios de escritorio (superficie v2). Muestra los del video ACTIVO. Los comentarios
 *  son placeholder con SCROLL propio; los reales llegan con el modelo `Comment` (Fase 1). */
function PanelComentarios({ post }: { post: PostVista }) {
  return (
    <aside className="hidden border-l border-line bg-surface shadow-[var(--df-shadow-lg)] lg:flex lg:h-[100svh] lg:flex-col lg:overflow-hidden">
      <div className="border-b border-line p-4">
        <p className="font-semibold text-text">@{post.username}</p>
        <p className="mt-1 line-clamp-2 text-sm text-text-dim">Reto: {post.retoTitulo}</p>
        <div className="mt-2 flex items-center gap-2">
          <PildoraCategoria>{post.categoria}</PildoraCategoria>
          <span className="text-2xs tabular-nums text-text-dim">
            {formatearContador(post.comentarios)} comentarios
          </span>
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {COMENTARIOS_FEED.map((c) => (
          <li key={c.usuario} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised text-xs font-semibold text-text-dim">
              {c.usuario.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">@{c.usuario}</p>
              <p className="text-sm text-text-dim">{c.texto}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="shrink-0 border-t border-line p-3 text-2xs text-text-dim">
        Los comentarios llegan en una fase posterior.
      </p>
    </aside>
  );
}

function Flecha({
  dir,
  onClick,
  disabled,
}: {
  dir: "up" | "down";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "up" ? "Vídeo anterior" : "Vídeo siguiente"}
      className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-text shadow-[var(--df-shadow-sm)] transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised disabled:opacity-30 disabled:hover:bg-surface"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {dir === "up" ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
    </button>
  );
}

/**
 * FEED de Inicio (boceto 1) — vertical, scroll-snap, un video por pantalla. MOVIL: inmersivo a sangre
 * completa, IDENTICO a hoy (el scroll-snap es CSS). DESKTOP (lg): grid tipo TikTok-web -> columna de
 * feed (se MANTIENE el scroll vertical entre videos) + panel de comentarios FIJO del video ACTIVO;
 * flechas ↑/↓ cambian de video. Isla cliente minima: solo detecta el video activo (IntersectionObserver)
 * y navega; el player real lo monta Bunny.
 */
export function FeedInicio() {
  const [activo, setActivo] = useState(0);
  const columna = useRef<HTMLDivElement | null>(null);
  const secciones = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const i = secciones.current.indexOf(e.target as HTMLElement);
            if (i >= 0) setActivo(i);
          }
        }
      },
      { root: columna.current, threshold: 0.6 },
    );
    for (const s of secciones.current) io.observe(s);
    return () => io.disconnect();
  }, []);

  const irA = (i: number): void => {
    const dest = Math.max(0, Math.min(POSTS_INICIO.length - 1, i));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    secciones.current[dest]?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <div className="relative lg:grid lg:h-[100svh] lg:grid-cols-[1fr_360px]">
      <div
        ref={columna}
        className="h-[100svh] snap-y snap-mandatory overflow-y-auto overscroll-y-contain"
      >
        {POSTS_INICIO.map((post, i) => (
          <PostInicio
            key={post.id}
            post={post}
            alRef={(el) => {
              if (el) secciones.current[i] = el;
            }}
          />
        ))}
      </div>

      <PanelComentarios post={POSTS_INICIO[activo]!} />

      {/* Flechas de navegacion — solo desktop, fijas junto al panel */}
      <div className="pointer-events-none absolute top-1/2 right-[376px] hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        <Flecha dir="up" onClick={() => irA(activo - 1)} disabled={activo === 0} />
        <Flecha
          dir="down"
          onClick={() => irA(activo + 1)}
          disabled={activo === POSTS_INICIO.length - 1}
        />
      </div>
    </div>
  );
}
