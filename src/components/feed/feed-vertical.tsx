"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { BotonVoto } from "@/components/ui/boton-voto";
import { PildoraCategoria } from "@/components/ui/pildora";
import { ReproductorHls } from "@/components/ui/reproductor-hls";
import { mostrarHandleSecundario, nombreMostrado } from "@/lib/identidad";
import type { PostFeed } from "@/server/services/feed";

import { ComentariosVideo } from "./comentarios-video";
import { formatearContador } from "./feed-datos";

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
// VOTAR = RAYO (decision de marca, Sergio). Ya NO se define aqui: cuando llego el boton de voto real
// se EXTRAJO a `components/ui/boton-voto` —como decia su propio comentario que habia que hacer— y esta
// pantalla lo consume desde alli. Copiar el path en dos sitios era la unica salida que no valia.
// (Fase 6: el Boost llevara icono PROPIO, distinto de este rayo.)
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
  onClick,
}: {
  label: string;
  valor: number;
  icono: ReactNode;
  destacado?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
 * carga/descarga por visibilidad). `votos` sale de Submission.voteCount y `comentarios` de
 * Video.commentCount; me gusta y compartir aún no tienen modelo y muestran 0 real.
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
  onComentar,
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
  /** Abrir los comentarios de este vídeo (hoja en móvil; en escritorio, la caja del panel). */
  onComentar: () => void;
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
      <div className="relative h-full w-full overflow-hidden bg-raised lg:h-[calc(100svh-2rem)] lg:aspect-[9/16] lg:w-auto lg:rounded-sm lg:border lg:border-line">
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
            /* Gate de "visto". Dos datos SEPARADOS: si el vídeo es una participación votable (del
               vídeo; null en una subida libre) y si hay sesión (del usuario). El player los junta,
               y así la guarda de sesión recibe el dato real en vez de uno dado por hecho. */
            participacionVista={post.participacionId}
            haySesion={haySesion}
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
        <Accion
          label="Comentar"
          valor={post.comentarios}
          icono={<IconoComentario />}
          onClick={onComentar}
        />
        {/* VOTAR: el unico magenta de contenido de la pantalla. Solo si el video ES una participacion
            —una subida libre no pertenece a ningun reto, asi que no hay nada que votar y no se pinta un
            boton muerto—. Todo su estado (visto, mi voto, reto abierto) sale del payload y de los
            registros compartidos; ver `components/ui/boton-voto`. */}
        {post.participacionId && post.retoId ? (
          <BotonVoto
            variante="rail"
            retoId={post.retoId}
            participacionId={post.participacionId}
            votos={post.votos}
            miVoto={post.miVoto}
            retoAbierto={post.retoAbierto}
            haySesion={haySesion}
          />
        ) : null}
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

/** Panel de comentarios de ESCRITORIO: cabecera del vídeo ACTIVO y sus comentarios reales, con la caja
 *  de escribir (`ComentariosVideo`, la misma pieza que la hoja de móvil). */
function PanelComentarios({
  post,
  haySesion,
  onContador,
  anclaComentario,
}: {
  post: PostFeed;
  haySesion: boolean;
  onContador: (videoId: string, comentarios: number) => void;
  anclaComentario?: string;
}) {
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
            {formatearContador(post.votos)} votos · {formatearContador(post.comentarios)}{" "}
            comentarios
          </span>
        </div>
      </div>
      {/* La clave es el VÍDEO: al cambiar de vídeo activo, la lista y la caja empiezan de cero. */}
      <ComentariosVideo
        key={post.id}
        videoId={post.id}
        haySesion={haySesion}
        idCaja={`comentar-${post.id}`}
        anclaId={anclaComentario}
        onContador={(n) => onContador(post.id, n)}
      />
    </aside>
  );
}

/**
 * Hoja de comentarios de MÓVIL: en móvil no hay panel lateral, así que el botón "Comentar" abre esto
 * desde abajo, con la MISMA pieza que el panel de escritorio. Se cierra con la ×, tocando fuera o con
 * Escape. Fuera de la columna del vídeo a propósito: un toque aquí no debe llegar al desbloqueo del
 * sonido ni a la pausa del reproductor.
 */
function HojaComentarios({
  post,
  haySesion,
  onContador,
  onCerrar,
  anclaComentario,
}: {
  post: PostFeed;
  haySesion: boolean;
  onContador: (videoId: string, comentarios: number) => void;
  onCerrar: () => void;
  anclaComentario?: string;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Cerrar comentarios"
        onClick={onCerrar}
        className="absolute inset-0 bg-void/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comentarios"
        className="absolute inset-x-0 bottom-0 flex h-[70svh] flex-col rounded-t-sm border-t border-line bg-surface shadow-[var(--df-shadow-lg)]"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-text tabular-nums">
            {formatearContador(post.comentarios)} comentarios
          </p>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid h-9 w-9 place-items-center rounded-full text-text-dim hover:bg-raised hover:text-text"
          >
            ×
          </button>
        </div>
        <ComentariosVideo
          key={post.id}
          videoId={post.id}
          haySesion={haySesion}
          anclaId={anclaComentario}
          onContador={(n) => onContador(post.id, n)}
        />
      </div>
    </div>
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
 * AVISO DE ENTRADA — una línea honesta cuando el enlace por el que se llegó ya no lleva a donde decía
 * (el vídeo del aviso se retiró). No se redirige ni se finge: se entra al feed normal y se explica.
 * Se cierra a mano; no desaparece solo, para que no se lo pierda quien tarde en mirar.
 */
function AvisoEntrada({ texto }: { texto: string }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 top-3 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-sm border border-line bg-surface px-3 py-2 shadow-[var(--df-shadow-lg)]"
    >
      <p className="text-sm text-text-dim">{texto}</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar aviso"
        className="shrink-0 rounded-full px-2 text-text-dim hover:text-text"
      >
        ×
      </button>
    </div>
  );
}

/**
 * DE DÓNDE SALEN LAS PÁGINAS SIGUIENTES. Es lo ÚNICO que distingue al feed global del feed de un reto:
 * el resto —reproducción, carga/descarga por visibilidad, mute global, gate de "visto", botón de voto,
 * comentarios— es idéntico, así que el componente es UNO SOLO y se parametriza por aquí.
 *
 * Devuelve items ya en forma `PostFeed`: la conversión la hace cada fuente, no el componente. Así el
 * feed no sabe nada de endpoints ni de formas de payload.
 *
 * El CURSOR es OPACO: el global usa el id del último vídeo y el del reto la tupla keyset de su ranking
 * (votos, instante, id). El componente solo lo guarda y lo devuelve — nunca lo interpreta, que es lo
 * que permite que las dos paginaciones sean keyset sin que él se entere de la diferencia.
 */
export interface FuenteFeed {
  siguientePagina(cursor: string): Promise<{ items: PostFeed[]; nextCursor: string | null }>;
}

/** Fuente GLOBAL (`/api/feed`): el feed de inicio, todos los vídeos publicados. */
export const fuenteGlobal: FuenteFeed = {
  async siguientePagina(cursor) {
    const res = await fetch(`/api/feed?cursor=${encodeURIComponent(cursor)}`);
    if (!res.ok) throw new Error("feed");
    return (await res.json()) as { items: PostFeed[]; nextCursor: string | null };
  },
};

/**
 * Fuente de UN RETO (`/api/retos/{id}/participaciones`): solo sus participaciones, en su orden de
 * RANKING (votos, instante, id). Es la misma keyset que ya usaba la rejilla del detalle — no hay una
 * paginación nueva ni, por supuesto, un OFFSET: el cursor viaja opaco y el feed ni lo mira.
 *
 * Deslizar dentro de este feed NO puede sacarte del reto, y eso no lo garantiza el componente sino
 * esta fuente: es el único sitio de donde salen más vídeos, y solo devuelve los de este reto.
 *
 * El endpoint sirve a DOS consumidores (rejilla y feed), así que cada ítem trae su forma de feed ya
 * construida en `post`; aquí solo se extrae. Construirla otra vez en el cliente sería una tercera copia
 * del mapeo que podría divergir de las otras dos.
 */
export function fuenteReto(retoId: string): FuenteFeed {
  const base = `/api/retos/${encodeURIComponent(retoId)}/participaciones`;
  return {
    async siguientePagina(cursor) {
      const res = await fetch(`${base}?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error("participaciones");
      const data = (await res.json()) as {
        items: { post: PostFeed }[];
        nextCursor: string | null;
      };
      return { items: data.items.map((i) => i.post), nextCursor: data.nextCursor };
    },
  };
}

/**
 * FEED VERTICAL — scroll-snap, un vídeo por pantalla. La PRIMERA página llega ya renderizada
 * (`postsIniciales` + `cursorInicial`); al acercarse al final pide la siguiente a su `fuente` y la
 * anexa. MOVIL: inmersivo a sangre completa. DESKTOP (lg): columna de feed + panel de comentarios FIJO
 * del vídeo ACTIVO; flechas ↑/↓ navegan.
 *
 * Lo usan DOS superficies: el feed de inicio (fuente global) y el feed de un reto (fuente del reto,
 * abierto en la participación que se tocó). No hay dos componentes: forkearlo habría significado
 * mantener dos veces la carga/descarga por visibilidad —que es lo que hace que cientos de vídeos no
 * monten cientos de `<video>`— y cablear dos veces cada cosa que llegue (likes, comentarios, Boost).
 */
export function FeedVertical({
  postsIniciales,
  cursorInicial,
  haySesion = false,
  fuente = fuenteGlobal,
  indiceInicial = 0,
  comentarioDestacado,
  aviso,
}: {
  postsIniciales: PostFeed[];
  cursorInicial: string | null;
  /** ¿Hay sesión? Solo decide si el reproductor marca "visto" (un invitado no marca). El feed es
   *  público: esto NO oculta ni protege nada, y la seguridad real la aplica siempre el endpoint. */
  haySesion?: boolean;
  /** De dónde salen las páginas siguientes. Por defecto, el feed global. */
  fuente?: FuenteFeed;
  /** Índice del vídeo por el que abrir. Lo usa el feed de un reto para entrar por el que se tocó. */
  indiceInicial?: number;
  /**
   * Comentario al que se llega desde el aviso (`/feed?video=…&comentario=…`). Su vídeo es el PRIMERO
   * de `postsIniciales` —lo coloca ahí la página—, así que abrir el feed ya deja ese vídeo delante:
   * aquí solo queda enseñar sus comentarios y marcar cuál era.
   */
  comentarioDestacado?: string;
  /** Aviso honesto de la entrada (p. ej. el vídeo del enlace ya no está). Se puede cerrar. */
  aviso?: string;
}) {
  const [posts, setPosts] = useState<PostFeed[]>(postsIniciales);
  const [cursor, setCursor] = useState<string | null>(cursorInicial);
  // Arranca en el índice pedido, NO en 0: si se pusiera a 0 y luego se corrigiera, el vídeo 0
  // autoreproduciría un instante antes de saltar al que el usuario tocó.
  const [activo, setActivo] = useState(indiceInicial);
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

  // ENTRAR por el vídeo pedido (feed de un reto: el que se tocó en la rejilla). Sin animación y una
  // sola vez: es la posición de partida, no un desplazamiento que el usuario deba ver.
  useEffect(() => {
    if (indiceInicial <= 0) return;
    secciones.current[indiceInicial]?.scrollIntoView({ behavior: "auto", block: "start" });
    // Solo al montar: si dependiera de `posts`, cada página anexada devolvería al usuario al principio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const data = await fuente.siguientePagina(cursor);
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
  }, [activo, cursor, posts.length, fuente]);

  // Un vídeo cuyo objeto ya no existe (404/410) se retira del scroll: no debe ocupar un slide roto.
  // Esto es robustez de cliente, NO moderación (Fase 5: el servidor filtra los REMOVED del feed).
  const quitarPost = useCallback((id: string): void => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // COMENTARIOS: el contador de un vídeo se actualiza con el número que devuelve el servidor tras
  // publicar o borrar (el de la BD, no una suma local). La hoja de móvil guarda QUÉ vídeo tiene abierto.
  const [hoja, setHoja] = useState<string | null>(null);
  const cerrarHoja = useCallback((): void => setHoja(null), []);
  const alContador = useCallback((videoId: string, comentarios: number): void => {
    setPosts((prev) => prev.map((p) => (p.id === videoId ? { ...p, comentarios } : p)));
  }, []);
  // "Comentar": en escritorio el panel ya está a la vista, así que enfoca su caja; en móvil abre la hoja.
  const abrirComentarios = (videoId: string): void => {
    const escritorio =
      typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;
    const caja = escritorio ? document.getElementById(`comentar-${videoId}`) : null;
    if (caja) caja.focus();
    else setHoja(videoId);
  };
  const postHoja = hoja ? posts.find((p) => p.id === hoja) : undefined;

  // DEEP-LINK del aviso: el vídeo del comentario es el primero (lo pone la página). En ESCRITORIO el
  // panel ya está a la vista, así que no hay nada que abrir; en MÓVIL hay que abrir la hoja, o el
  // usuario aterrizaría en el vídeo correcto sin ver el comentario del que hablaba el aviso.
  const videoAncla = comentarioDestacado ? (postsIniciales[0]?.id ?? null) : null;
  // El estado NO puede nacer con la hoja abierta: el servidor no sabe si esto es un móvil (lo dice
  // `matchMedia`, que solo existe en el navegador), así que abrirla en el primer render rompería la
  // hidratación. Por eso se abre AQUÍ, después de montar, aunque la regla prefiera lo contrario.
  useEffect(() => {
    if (!videoAncla) return;
    const escritorio =
      typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;
    // Un render de más al entrar por el enlace, a cambio de no romper la hidratación: aceptado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!escritorio) setHoja(videoAncla);
  }, [videoAncla]);

  const irA = (i: number): void => {
    const dest = Math.max(0, Math.min(posts.length - 1, i));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    secciones.current[dest]?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <div className="lg:grid lg:h-[100svh] lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Columna del vídeo. `relative` AQUÍ (no en la rejilla entera) para que las flechas se anclen a
          ESTA columna: antes colgaban de la rejilla con un `right-[376px]` calculado a mano contra el
          ancho del panel, así que cualquier cambio de ese ancho las descuadraba. */}
      <div className="relative min-w-0">
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
              onComentar={() => abrirComentarios(post.id)}
            />
          ))}
        </div>

        {/* Flechas de navegación — solo escritorio, ancladas al borde derecho de SU columna. */}
        <div className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
          <Flecha dir="up" onClick={() => irA(activo - 1)} disabled={activo === 0} />
          <Flecha
            dir="down"
            onClick={() => irA(activo + 1)}
            disabled={activo >= posts.length - 1}
          />
        </div>
      </div>

      {posts.length > 0
        ? (() => {
            const post = posts[activo] ?? posts[0]!;
            return (
              <PanelComentarios
                post={post}
                haySesion={haySesion}
                onContador={alContador}
                anclaComentario={post.id === videoAncla ? comentarioDestacado : undefined}
              />
            );
          })()
        : null}

      {postHoja ? (
        <HojaComentarios
          post={postHoja}
          haySesion={haySesion}
          onContador={alContador}
          onCerrar={cerrarHoja}
          anclaComentario={postHoja.id === videoAncla ? comentarioDestacado : undefined}
        />
      ) : null}

      {aviso ? <AvisoEntrada texto={aviso} /> : null}
    </div>
  );
}
