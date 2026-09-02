"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { PildoraCategoria } from "@/components/ui/pildora";
import { ReproductorHls } from "@/components/ui/reproductor-hls";
import { mostrarHandleSecundario, nombreMostrado } from "@/lib/identidad";
import type { PostFeed } from "@/server/services/feed";

import { COMENTARIOS_FEED, formatearContador } from "./inicio-datos";

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
// VOTAR = RAYO (decision de marca, Sergio). Dibujado con el MISMO sistema que el resto de acciones:
// icono de LINEA (IconoAccion pone fill=none + stroke=currentColor, uniones redondeadas), no una
// silueta rellena. Mantiene el `bold` que ya tenia y hereda su color y tamano del contenedor
// (negro sobre el circulo magenta) — aqui solo cambia la FORMA.
// FUENTE UNICA: el rayo se define aqui y en ningun sitio mas. Cuando el boton de voto real lo
// necesite, se reutiliza este; si acaba haciendo falta en varias pantallas se EXTRAE a un componente
// compartido, nunca se copia. (Fase 6: el Boost llevara icono PROPIO, distinto de este rayo.)
const IconoVoto = () => (
  <IconoAccion bold>
    <path d="M13 3 5 14h5l-1 7 8-11h-5l1-7Z" />
  </IconoAccion>
);
const IconoCompartir = () => (
  <IconoAccion>
    <path d="M12 15V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M5 13v6h14v-6" />
  </IconoAccion>
);

/** Icono de altavoz (con/sin ondas) para el botón de mute global del feed. SVG inline, trazo de marca. */
function IconoSonido({ silenciado }: { silenciado: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M5 9v6h3l4 3V6L8 9H5z" />
      {silenciado ? (
        <path d="M16 9l5 6M21 9l-5 6" />
      ) : (
        <>
          <path d="M16 8.5a4 4 0 0 1 0 7" />
          <path d="M18.5 6a7 7 0 0 1 0 12" />
        </>
      )}
    </svg>
  );
}

/**
 * Boton de accion. Neutro (icono blanco) salvo VOTA (`destacado`): circulo magenta con icono NEGRO =
 * la UNICA accion magenta de contenido (movil sobre el video; desktop en la columna de acciones fuera
 * del video). Zona tactil 44 px.
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
 * El VIDEO real lo reproduce `ReproductorHls` (variante `feed`, 9:16 inmersivo, autoplay en mute con
 * carga/descarga por visibilidad). Solo `votos` sale del modelo (Submission.voteCount); me gusta,
 * comentarios y compartir aún no tienen modelo (llegan en fases posteriores) y muestran 0 real.
 */
function PostInicio({
  post,
  alRef,
  haySesion,
  muted,
  mostrarHint,
  esActivo,
  onToggleSilencio,
  onNoDisponible,
}: {
  post: PostFeed;
  alRef: (el: HTMLElement | null) => void;
  /** ¿Marcar la reproducción como "vista"? Solo con sesión y solo si el vídeo ES una participación. */
  haySesion: boolean;
  /** Mute EFECTIVO (preferencia del usuario O permiso del navegador aún sin desbloquear). El icono y
   *  el aria se pintan según esto: NUNCA mienten sobre lo que se oye de verdad. */
  muted: boolean;
  /** ¿Mostrar el rótulo "toca para activar el sonido"? (audio bloqueado + preferencia sonido). */
  mostrarHint: boolean;
  /** ¿Es el vídeo ACTIVO? El rótulo solo se pinta sobre él. */
  esActivo: boolean;
  /** Recibe el SNAPSHOT del mute efectivo capturado ANTES del unlock (así el 1er clic no se pierde). */
  onToggleSilencio: (estabaMudo: boolean) => void;
  /** El vídeo ya no existe en el origen: se retira este slide del scroll. */
  onNoDisponible: () => void;
}) {
  // Snapshot del mute efectivo en la fase de CAPTURA del pointerdown (root->botón), ANTES de que el
  // listener del contenedor (fase de burbuja) desbloquee el audio y flipe `mutedEfectivo`. Sin esto,
  // si el PRIMER gesto es el botón, el onClick leería el estado ya cambiado y mutearía en vez de sonar.
  const intentoRef = useRef(muted);
  // Identidad: displayName prominente; @handle debajo (o de nombre si no hay displayName).
  const nombre = nombreMostrado(post.displayName, post.username);
  const conHandle = mostrarHandleSecundario(post.displayName);
  return (
    <section
      ref={alRef}
      className="relative flex h-[100svh] snap-start items-center justify-center lg:gap-5"
    >
      {/* VIDEO real (HLS firmado). En desktop, tira 9:16 centrada con filete; en movil, a sangre. */}
      <div className="relative h-full w-full overflow-hidden bg-raised lg:h-[86svh] lg:aspect-[9/16] lg:w-auto lg:rounded-sm lg:border lg:border-line">
        <div className="absolute inset-0">
          {/* Mute EFECTIVO GLOBAL: lo calcula el feed (preferencia + permiso del navegador); el player
              solo lo aplica. El tap-pausa y la barra de progreso viven dentro del player.
              `onNoDisponible` retira el slide si el vídeo ya no existe (404/410). */}
          <ReproductorHls
            variante="feed"
            src={post.src}
            poster={post.poster}
            silenciado={muted}
            onNoDisponible={onNoDisponible}
            /* Gate de "visto": null para invitados y para las subidas LIBRES (sin participación no
               hay nada que votar, así que no hay nada que marcar). */
            participacionVista={haySesion ? post.participacionId : null}
          />
        </div>
        {/* Scrim (velo) — solo movil (en desktop el video queda limpio) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/50 to-transparent lg:hidden" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-56 bg-gradient-to-t from-black/75 to-transparent lg:hidden" />
        {/* Info sobre el video — solo movil. `pointer-events-none`: los taps la ATRAVIESAN y llegan a la
            capa de pausa/reanudar del player (no es un target interactivo). */}
        <div className="pointer-events-none absolute bottom-0 left-0 z-10 w-3/4 p-4 pb-24 lg:hidden">
          <p className="text-base font-semibold text-white">{conHandle ? nombre : `@${nombre}`}</p>
          {conHandle ? <p className="text-sm text-white/80">@{post.username}</p> : null}
          <p className="mt-1 line-clamp-2 text-sm text-white/90">Reto: {post.retoTitulo}</p>
          {post.categoria ? (
            <div className="mt-2">
              <PildoraCategoria>{post.categoria}</PildoraCategoria>
            </div>
          ) : null}
        </div>
        {/* RÓTULO "toca para activar el sonido" — arriba-centro, discreto (no tapa descripción abajo ni
            acciones a la derecha). Solo sobre el vídeo ACTIVO mientras el audio esté bloqueado y la
            preferencia sea sonido; se desvanece suave al desbloquear. `pointer-events-none`: el tap lo
            atraviesa y desbloquea igual. Permanece montado (opacidad) para animar la salida. */}
        <div
          aria-hidden={!(mostrarHint && esActivo)}
          className={`pointer-events-none absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-void/70 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white backdrop-blur-sm transition-opacity duration-[var(--df-dur-reveal)] ease-mechanical ${mostrarHint && esActivo ? "opacity-100" : "opacity-0"}`}
        >
          <IconoSonido silenciado={false} />
          Toca para activar el sonido
        </div>
      </div>

      {/* ACCIONES: sobre el video en movil (absolute), FUERA del video en desktop (static) */}
      <div className="absolute right-2 bottom-24 z-10 flex flex-col items-center gap-5 lg:static lg:right-auto lg:bottom-auto">
        <Accion label="Me gusta" valor={0} icono={<IconoCorazon />} />
        <Accion label="Comentar" valor={0} icono={<IconoComentario />} />
        <Accion label="Votar" valor={post.votos} icono={<IconoVoto />} destacado />
        <Accion label="Compartir" valor={0} icono={<IconoCompartir />} />
        {/* MUTE GLOBAL: última acción de la columna, DEBAJO de Compartir (antes tapaba la descripción
            abajo-izquierda). Mismo look de icono que las acciones pero SIN contador (no tiene número).
            Icono y aria según el mute EFECTIVO (nunca miente). Un cambio afecta a TODOS los vídeos. */}
        <button
          type="button"
          onPointerDownCapture={() => {
            intentoRef.current = muted;
          }}
          onClick={() => onToggleSilencio(intentoRef.current)}
          aria-label={muted ? "Activar sonido" : "Silenciar"}
          className="flex flex-col items-center"
        >
          <span className="flex h-11 w-11 items-center justify-center text-white lg:text-text lg:hover:text-white">
            <IconoSonido silenciado={muted} />
          </span>
        </button>
      </div>
    </section>
  );
}

/** Panel de comentarios de escritorio (superficie v2). Cabecera del video ACTIVO (datos reales); la
 *  lista de comentarios es placeholder (el modelo `Comment` llega en la Fase 1). */
function PanelComentarios({ post }: { post: PostFeed }) {
  const nombre = nombreMostrado(post.displayName, post.username);
  const conHandle = mostrarHandleSecundario(post.displayName);
  return (
    <aside className="hidden border-l border-line bg-surface shadow-[var(--df-shadow-lg)] lg:flex lg:h-[100svh] lg:flex-col lg:overflow-hidden">
      <div className="border-b border-line p-4">
        <p className="font-semibold text-text">{conHandle ? nombre : `@${nombre}`}</p>
        {conHandle ? <p className="text-sm text-text-dim">@{post.username}</p> : null}
        <p className="mt-1 line-clamp-2 text-sm text-text-dim">Reto: {post.retoTitulo}</p>
        <div className="mt-2 flex items-center gap-2">
          {post.categoria ? <PildoraCategoria>{post.categoria}</PildoraCategoria> : null}
          <span className="text-2xs tabular-nums text-text-dim">
            {formatearContador(post.votos)} votos
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
 * FEED de Inicio — vertical, scroll-snap, un video por pantalla. La PRIMERA página llega ya renderizada
 * del servidor (`postsIniciales` + `cursorInicial`); al acercarse al final, el cliente pide la
 * siguiente a `/api/feed?cursor=...` y la anexa (scroll infinito). MOVIL: inmersivo a sangre completa.
 * DESKTOP (lg): columna de feed + panel de comentarios FIJO del video ACTIVO; flechas ↑/↓ navegan.
 */
export function FeedInicio({
  postsIniciales,
  cursorInicial,
  haySesion = false,
}: {
  postsIniciales: PostFeed[];
  cursorInicial: string | null;
  /** ¿Hay sesión? Solo decide si el reproductor marca "visto" (un invitado no marca). El feed es
   *  público: esto NO oculta ni protege nada, y la seguridad real la aplica siempre el endpoint. */
  haySesion?: boolean;
}) {
  const [posts, setPosts] = useState<PostFeed[]>(postsIniciales);
  const [cursor, setCursor] = useState<string | null>(cursorInicial);
  const [activo, setActivo] = useState(0);
  // MUTE del feed — DOS estados (una sola preferencia GLOBAL para todos los vídeos):
  //  - `silenciado`: PREFERENCIA del usuario (arranca en false = quiere sonido; el botón la togglea =
  //    mute opt-in).
  //  - `audioDesbloqueado`: PERMISO del navegador (arranca en false; el navegador bloquea el autoplay
  //    con sonido sin gesto). Pasa a true en el PRIMER gesto del usuario.
  // El mute EFECTIVO que aplican los players y pinta el icono es `silenciado || !audioDesbloqueado`:
  // el autoplay SIEMPRE arranca mudo (garantizado) y el icono NUNCA miente sobre lo que se oye.
  const [silenciado, setSilenciado] = useState(false);
  const [audioDesbloqueado, setAudioDesbloqueado] = useState(false);
  const mutedEfectivo = silenciado || !audioDesbloqueado;
  // Rótulo "toca para activar el sonido": SOLO mientras el audio está bloqueado y la preferencia es
  // sonido. Si el usuario silencia a propósito (silenciado), no se muestra; al desbloquear, desaparece.
  const mostrarHintSonido = !audioDesbloqueado && !silenciado;
  // Guarda anti-solape de la paginacion: es un ref (no se pinta), asi que no dispara renders.
  const cargandoRef = useRef(false);
  const columna = useRef<HTMLDivElement | null>(null);
  const secciones = useRef<HTMLElement[]>([]);
  // Índice del vídeo ACTIVO en un ref, para leerlo SIN closure obsoleto desde el listener de unlock.
  const activoRef = useRef(0);
  useEffect(() => {
    activoRef.current = activo;
  }, [activo]);

  // Activa el sonido del vídeo ACTIVO EN EL MISMO STACK del gesto: pone `muted=false` y reproduce. Es la
  // ÚNICA forma de que el navegador deje pasar de mudo a audible un vídeo autoplayado (la activación por
  // gesto es in-stack; un unmute async —en el efecto del player— NO se honra). El `play()` posterior
  // cubre el caso en que el navegador pause al desmutear. Solo refs -> callback estable.
  const activarSonidoVideoActivo = useCallback((): void => {
    const v = secciones.current[activoRef.current]?.querySelector("video");
    if (v) {
      v.muted = false;
      void v.play().catch(() => {});
    }
  }, []);

  // UNLOCK del audio al PRIMER gesto del usuario (el navegador exige un gesto para permitir sonido).
  // Un ÚNICO listener en el contenedor del feed. Se escucha `pointerup` (NO `pointerdown`): en TOUCH el
  // pointerdown NO otorga activación de usuario —la otorga el pointerup/touchend—, así que activar el
  // sonido en pointerdown lo bloquea el navegador. Además un SCROLL dispara `pointercancel` (no
  // pointerup), así que este listener solo salta en TAPS reales (que sí activan) y NO en scroll puro
  // (por eso el icono no miente: un scroll sin tap puede no desbloquear, es esperado). Al saltar:
  // desbloquea y, si la preferencia es sonido, activa el vídeo activo IN-STACK (dentro del gesto);
  // los siguientes suenan solos porque ya hay activación. Se auto-retira (`once`).
  useEffect(() => {
    const cont = columna.current;
    if (!cont || audioDesbloqueado) return;
    const desbloquear = (): void => {
      setAudioDesbloqueado(true);
      if (!silenciado) activarSonidoVideoActivo();
    };
    cont.addEventListener("pointerup", desbloquear, { once: true });
    cont.addEventListener("keydown", desbloquear, { once: true });
    return () => {
      cont.removeEventListener("pointerup", desbloquear);
      cont.removeEventListener("keydown", desbloquear);
    };
  }, [audioDesbloqueado, silenciado, activarSonidoVideoActivo]);

  // Detecta el video ACTIVO. Se re-suscribe cuando cambia el numero de posts (al anexar pagina) para
  // observar tambien las secciones nuevas.
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
    for (const s of secciones.current.slice(0, posts.length)) io.observe(s);
    return () => io.disconnect();
  }, [posts.length]);

  // Paginacion: al acercarse al final (a <=2 del ultimo) y habiendo cursor, pide la siguiente pagina.
  useEffect(() => {
    if (cursor === null || cargandoRef.current) return;
    if (activo < posts.length - 2) return;
    let vivo = true;
    cargandoRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/feed?cursor=${encodeURIComponent(cursor)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: PostFeed[]; nextCursor: string | null };
        if (!vivo) return;
        setPosts((prev) => [...prev, ...data.items]);
        setCursor(data.nextCursor);
      } catch {
        /* fallo de red: se reintentara al seguir desplazandose */
      } finally {
        cargandoRef.current = false;
      }
    })();
    return () => {
      vivo = false;
    };
  }, [activo, cursor, posts.length]);

  // Un vídeo cuyo objeto ya no existe (404/410) se retira del scroll: no debe ocupar un slide roto.
  // Esto es robustez de cliente, NO moderación (Fase 5: el servidor filtra los REMOVED del feed).
  const quitarPost = useCallback((id: string): void => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const irA = (i: number): void => {
    const dest = Math.max(0, Math.min(posts.length - 1, i));
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
        {posts.map((post, i) => (
          <PostInicio
            key={post.id}
            post={post}
            alRef={(el) => {
              if (el) secciones.current[i] = el;
            }}
            haySesion={haySesion}
            muted={mutedEfectivo}
            mostrarHint={mostrarHintSonido}
            esActivo={i === activo}
            onToggleSilencio={(estabaMudo) => {
              // Decide según el SNAPSHOT (lo que el usuario VEÍA al pulsar), no según el estado ya
              // cambiado por el unlock: si estaba mudo, quiere sonido (desbloquea + preferencia = sonido);
              // si sonaba, mutea (opt-in).
              if (estabaMudo) {
                setAudioDesbloqueado(true);
                setSilenciado(false);
                activarSonidoVideoActivo(); // IN-STACK: suena ya, no espera al efecto async del player
              } else {
                setSilenciado(true);
              }
            }}
            onNoDisponible={() => quitarPost(post.id)}
          />
        ))}
      </div>

      {posts.length > 0 ? <PanelComentarios post={posts[activo] ?? posts[0]!} /> : null}

      {/* Flechas de navegacion — solo desktop, fijas junto al panel */}
      <div className="pointer-events-none absolute top-1/2 right-[376px] hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        <Flecha dir="up" onClick={() => irA(activo - 1)} disabled={activo === 0} />
        <Flecha dir="down" onClick={() => irA(activo + 1)} disabled={activo >= posts.length - 1} />
      </div>
    </div>
  );
}
