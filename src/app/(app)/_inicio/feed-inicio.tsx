import type { ReactNode } from "react";

import { PildoraCategoria } from "@/components/ui/pildora";

import { formatearContador, POSTS_INICIO, type PostVista } from "./inicio-datos";

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
const IconoVoto = () => (
  <IconoAccion bold>
    <path d="M6 14l6-6 6 6" />
  </IconoAccion>
);
const IconoCompartir = () => (
  <IconoAccion>
    <path d="M12 15V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M5 13v6h14v-6" />
  </IconoAccion>
);

/** Triangulo de "play" grande y sutil sobre el placeholder de video. */
function IconoPlayGrande() {
  return (
    <svg viewBox="0 0 24 24" className="h-16 w-16 text-white/25" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/**
 * Boton de accion flotante. Neutro (icono blanco) salvo VOTA (`destacado`): circulo magenta
 * (--df-action) con icono NEGRO (--df-void) = la UNICA accion magenta de contenido. Zona tactil
 * 44 px. Es maqueta: presentacional, sin backend.
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
            : "flex h-11 w-11 items-center justify-center text-white"
        }
      >
        {icono}
      </span>
      <span className="text-2xs font-semibold tabular-nums text-white">
        {formatearContador(valor)}
      </span>
    </button>
  );
}

/**
 * Un post a pantalla completa. Movil: el video llena edge-to-edge. Escritorio (lg): 9:16 centrado,
 * alto acotado por viewport (no estirado), con filete. Scrim oscuro arriba/abajo para que el texto
 * blanco se lea sobre cualquier fotograma (hoy placeholder). Info abajo-izquierda; acciones a la
 * derecha (por encima de la nav inferior superpuesta en movil).
 */
function PostInicio({ post }: { post: PostVista }) {
  return (
    <section className="flex h-[100svh] snap-start items-center justify-center">
      <div className="relative h-full w-full overflow-hidden bg-raised lg:aspect-[9/16] lg:h-[86svh] lg:w-auto lg:rounded-sm lg:border lg:border-line">
        <div className="absolute inset-0 flex items-center justify-center">
          <IconoPlayGrande />
        </div>

        {/* Scrim (velo) para legibilidad del texto blanco sobre el video */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 to-transparent" />

        {/* Info del post: abajo-izquierda, sobre el video */}
        <div className="absolute bottom-0 left-0 w-3/4 p-4 pb-24 lg:pb-6">
          <p className="text-base font-semibold text-white">@{post.username}</p>
          <p className="mt-1 line-clamp-2 text-sm text-white/90">Reto: {post.retoTitulo}</p>
          <div className="mt-2">
            <PildoraCategoria>{post.categoria}</PildoraCategoria>
          </div>
        </div>

        {/* Acciones flotantes: derecha, por encima de la nav inferior en movil */}
        <div className="absolute right-2 bottom-24 flex flex-col items-center gap-5 lg:bottom-10">
          <Accion label="Me gusta" valor={post.meGusta} icono={<IconoCorazon />} />
          <Accion label="Comentar" valor={post.comentarios} icono={<IconoComentario />} />
          <Accion label="Votar" valor={post.votos} icono={<IconoVoto />} destacado />
          <Accion label="Compartir" valor={post.compartidos} icono={<IconoCompartir />} />
        </div>
      </div>
    </section>
  );
}

/**
 * FEED de Inicio (boceto 1) — vertical, scroll-snap, un video por pantalla. Presentacional (maqueta,
 * sin backend). El scroll-snap es CSS puro; no necesita cliente.
 */
export function FeedInicio() {
  return (
    <div className="h-[100svh] snap-y snap-mandatory overflow-y-auto overscroll-y-contain">
      {POSTS_INICIO.map((post) => (
        <PostInicio key={post.id} post={post} />
      ))}
    </div>
  );
}
