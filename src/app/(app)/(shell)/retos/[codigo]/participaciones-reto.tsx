"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { FeedVertical, fuenteReto } from "@/components/feed/feed-vertical";
import { RecuentoVotos } from "@/components/ui/boton-voto";
import { CajaVideo } from "@/components/ui/caja-video";
import { crearControlCapa } from "@/lib/capa-historial";
import { getJson } from "@/lib/cliente-http";
import { mostrarHandleSecundario, nombreMostrado } from "@/lib/identidad";
import type { PostFeed } from "@/server/services/feed";

/** Una participación ya lista para pintar: póster firmado en el servidor + datos del autor. */
export interface ParticipacionUI {
  submissionId: string;
  videoId: string;
  title: string | null;
  poster: string;
  username: string;
  displayName: string | null;
  votos: number;
  retoId: string;
  retoAbierto: boolean;
  miVoto: string | null;
  /**
   * El MISMO ítem, ya en la forma que pinta el feed. Lo construye el servidor con el mapeador
   * compartido (`lib/post-de-participacion`), igual para la primera página que para las siguientes.
   * Viaja junto al resto en vez de derivarse aquí para que no haya una tercera copia del mapeo.
   */
  post: PostFeed;
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
  // Índice de la participación por la que está abierto el feed del reto (`null` = cerrado). Vive AQUÍ
  // y no en cada celda porque el feed necesita la lista ENTERA para poder deslizar, no una sola.
  const [abiertoEn, setAbiertoEn] = useState<number | null>(null);

  // La fuente se memoiza: si se creara en cada render, el efecto de paginación del feed la vería
  // cambiar cada vez y pediría página sin parar.
  const fuente = useMemo(() => fuenteReto(challengeId), [challengeId]);
  const abierto = abiertoEn !== null;

  // Cerrar NO pone el estado a `null` directamente: pide un `back()` y deja que el `popstate` lo haga.
  // Así el botón, Escape y el gesto de ATRÁS del móvil recorren el mismo camino y el historial no se
  // queda con una entrada de más. Ver `lib/capa-historial`.
  const cerrar = useCallback(() => {
    if (typeof window !== "undefined") crearControlCapa(window.history).pedirCierre();
  }, []);

  // Con el feed abierto: el fondo NO se desplaza (si no, al cerrar apareces en otro punto de la
  // rejilla), Escape cierra, y —lo que faltaba— hay una ENTRADA DE HISTORIAL, así que el atrás del
  // navegador cierra la capa en vez de sacarte del reto.
  useEffect(() => {
    if (!abierto) return;
    const control = crearControlCapa(window.history);
    control.abrir();

    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclado = (e: KeyboardEvent): void => {
      if (e.key === "Escape") control.pedirCierre();
    };
    const alVolver = (e: PopStateEvent): void => {
      if (control.debeCerrar(e.state)) setAbiertoEn(null);
    };
    document.addEventListener("keydown", alTeclado);
    window.addEventListener("popstate", alVolver);
    return () => {
      document.body.style.overflow = scrollPrevio;
      document.removeEventListener("keydown", alTeclado);
      window.removeEventListener("popstate", alVolver);
    };
  }, [abierto]);

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
      {/* DOS columnas ya en móvil. Con una sola y miniaturas 9:16, cada participación ocupaba más de
          una pantalla: ver quién participa costaba un scroll por persona. Es una rejilla de VISTAZO;
          la reproducción inmersiva sigue estando al tocar, en el feed del reto. */}
      <ul role="list" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {items.map((p, i) => (
          <li key={p.submissionId}>
            <Celda
              participacion={p}
              puesto={i + 1}
              esMio={p.submissionId === miSubmissionId}
              challengeId={challengeId}
              onAbrir={() => setAbiertoEn(i)}
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

      {abiertoEn !== null ? (
        <FeedDelReto
          items={items}
          cursor={cursor}
          indice={abiertoEn}
          fuente={fuente}
          haySesion={haySesion}
          onCerrar={cerrar}
        />
      ) : null}
    </>
  );
}

/**
 * FEED DEL RETO — la MISMA experiencia inmersiva del feed global, acotada a este reto y abierta por la
 * participación que se tocó. Sustituye al reproductor en modal que había antes.
 *
 * ┌─ POR QUÉ EL MISMO COMPONENTE Y NO UNO PROPIO ──────────────────────────────────────────────────┐
 * │ El modal era una SEGUNDA superficie de reproducción que había que mantener en paralelo: cada    │
 * │ cosa que llegue (likes, comentarios, Boost) habría que cablearla dos veces o quedaría coja       │
 * │ aquí. Y, sobre todo, el feed carga y SUELTA los vídeos por visibilidad —por eso aguanta cientos  │
 * │ sin montar cientos de `<video>`—; reconstruirlo habría sido heredar el problema en vez de la     │
 * │ solución. Lo único que cambia entre los dos feeds es de dónde salen las páginas siguientes.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ARRANCA CON LO QUE LA REJILLA YA TIENE en memoria, no con una consulta nueva: así se puede deslizar
 * hacia ARRIBA desde el vídeo por el que se entró (los anteriores ya estaban cargados) y hacia abajo se
 * sigue paginando con la keyset del reto desde el mismo cursor.
 */
function FeedDelReto({
  items,
  cursor,
  indice,
  fuente,
  haySesion,
  onCerrar,
}: {
  items: ParticipacionUI[];
  cursor: string | null;
  indice: number;
  fuente: ReturnType<typeof fuenteReto>;
  haySesion: boolean;
  onCerrar: () => void;
}) {
  const posts: PostFeed[] = items.map((p) => p.post);

  // PORTAL A <body>, y no es cosmético: la capa se monta dentro de una `<section className="df-rise">`,
  // que ANIMA `transform`. Un ancestro con transform crea BLOQUE CONTENEDOR para `position: fixed`, así
  // que el `inset-0` NO se resolvía contra el viewport sino contra esa sección — de ahí que en móvil el
  // rail de acciones no cupiera y que en escritorio la capa dejara media pantalla fuera. Es exactamente
  // por esto que `ModalReproductor` portaliza; al reutilizar el feed sin portal se heredó la trampa.
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-void"
      role="dialog"
      aria-modal="true"
      aria-label="Vídeos del reto"
    >
      <FeedVertical
        postsIniciales={posts}
        cursorInicial={cursor}
        fuente={fuente}
        indiceInicial={indice}
        haySesion={haySesion}
      />
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Volver al reto"
        className="absolute top-4 left-4 z-[60] grid h-10 w-10 place-items-center rounded-full bg-void/60 text-white backdrop-blur-sm transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-void/80"
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
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
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    </div>,
    document.body,
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
  challengeId,
  onAbrir,
}: {
  participacion: ParticipacionUI;
  puesto: number;
  esMio: boolean;
  challengeId: string;
  /** Abre el FEED DEL RETO por esta participación. La celda no reproduce nada por su cuenta. */
  onAbrir: () => void;
}) {
  const autor = nombreMostrado(p.displayName, p.username);
  const etiqueta = p.title?.trim() ? `Reproducir «${p.title}»` : `Reproducir el vídeo de ${autor}`;
  const fondo = `url("${p.poster}")`;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onAbrir}
        aria-label={etiqueta}
        title={p.title ?? undefined}
        className="group block w-full overflow-hidden rounded-sm border border-line transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-shadow-md)] focus-visible:-translate-y-0.5 focus-visible:shadow-[var(--df-shadow-md)] focus-visible:outline-none"
      >
        <CajaVideo
          proporcion="miniatura"
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
                <RecuentoVotos
                  retoId={challengeId}
                  participacionId={p.submissionId}
                  votos={p.votos}
                  /* El `miVoto` del PROPIO ítem: dice si su `votos` ya contaba el voto del usuario,
                     que es lo que `votosMostrados` necesita para reconciliar sin acumular deltas. */
                  miVoto={p.miVoto}
                />
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
