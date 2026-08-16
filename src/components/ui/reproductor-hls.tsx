"use client";

import type { LoaderCallbacks, LoaderConfiguration, LoaderContext } from "hls.js";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { CajaVideo } from "./caja-video";

/**
 * REPRODUCTOR HLS reutilizable — la primitiva de reproducción que consumen Feed, detalle y perfil.
 * Reproduce un stream HLS (.m3u8) con control TOTAL del encuadre y el comportamiento (el iframe de
 * Bunny queda descartado). NO se acopla a Bunny: la URL llega por `src` (la firma la da el backend en
 * su pieza); aquí NO se construye ninguna URL ni clave.
 *
 * Reproducción: HLS NATIVO donde el navegador lo soporta (Safari/iOS -> `canPlayType`), y `hls.js`
 * (import DINÁMICO, fuera del bundle inicial) en el resto. Rendimiento: carga/reproduce SOLO cuando
 * está en pantalla (IntersectionObserver) y suelta el buffer al salir de vista.
 *
 * Encuadre (reglas cerradas): `feed` = 9:16 inmersivo (el vídeo llena el alto; lo que no sea 9:16 se
 * rellena con fondo DIFUMINADO, nunca barras ni recorte). `detalle` = 16:9 escritorio / 9:16 móvil.
 *
 * CONTROLES DEL FEED (estilo TikTok, solo variante `feed`):
 *  - TAP en el vídeo -> pausa/reanuda, con icono de play central al pausar. Un arrastre (>10 px entre
 *    pointerdown y pointerup) NO alterna: es el scroll vertical del snap.
 *  - BARRA DE PROGRESO fina abajo; al pausar engorda y permite SEEK (tocar/arrastrar).
 *  - MUTE GLOBAL: el estado `silenciado` vive en el FEED (una sola preferencia para todos los vídeos)
 *    y llega por prop; el botón lo pinta el feed. En `detalle` no hay prop -> estado local (arranca en
 *    mute). El feed arranca CON SONIDO (preferencia); como el navegador bloquea el autoplay con sonido
 *    sin gesto previo, el player reintenta EN MUTE para garantizar el autoplay y el primer gesto del
 *    usuario reconcilia el `muted` con la preferencia (activa el sonido).
 */
type Variante = "feed" | "detalle";

/**
 * Naturaleza del fallo de carga. `transitorio` = red/decodificación: el "Reintentar" tiene sentido.
 * `permanente` = el objeto ya no existe en el origen (404/410); reintentar NUNCA funcionará, así que se
 * muestra un mensaje terminal (sin botón) y, en el feed, se retira del scroll. `null` = sin error.
 */
type FalloCarga = "transitorio" | "permanente";

const HLS_NATIVO = "application/vnd.apple.mpegurl";
const UMBRAL_TAP_PX = 10; // más movimiento que esto entre down y up = swipe (scroll), no un tap

export function ReproductorHls({
  src,
  poster,
  variante,
  silenciado: silenciadoProp,
  onNoDisponible,
}: {
  src: string;
  poster: string;
  variante: Variante;
  /** Mute CONTROLADO (feed: preferencia global). Sin prop (detalle) -> estado local, arranca en mute. */
  silenciado?: boolean;
  /** Se invoca cuando el vídeo ya no existe (fallo permanente): el feed lo usa para retirarlo del scroll. */
  onNoDisponible?: () => void;
}) {
  const esFeed = variante === "feed";
  const videoRef = useRef<HTMLVideoElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const cargadoRef = useRef(false);
  const bajadaRef = useRef<{ x: number; y: number } | null>(null);
  const swipeRef = useRef(false);
  const [error, setError] = useState<FalloCarga | null>(null);
  const [pausado, setPausado] = useState(false); // pausa MANUAL del usuario (feed): pinta el icono play
  const [progreso, setProgreso] = useState(0); // 0..1
  const [intento, setIntento] = useState(0); // fuerza recarga al "Reintentar"
  // Orientación real del vídeo (feed): VERTICAL -> object-cover (llena, recorta lo mínimo); HORIZONTAL
  // -> object-contain + relleno difuminado (no recorta los lados). `null` hasta leer los metadatos: se
  // asume vertical (el feed es 9:16), así el caso común llena sin parpadeo.
  const [orientacion, setOrientacion] = useState<"vertical" | "horizontal" | null>(null);

  // Mute: en FEED lo controla el prop (preferencia global). En DETALLE no hay prop -> arranca en mute y
  // el usuario lo cambia con los controles NATIVOS del <video> (el efecto solo fija el valor inicial).
  const silenciado = silenciadoProp ?? true;

  useEffect(() => {
    const video = videoRef.current;
    const cont = contenedorRef.current;
    if (!video || !cont) return;
    let cancelado = false;

    const soltar = (): void => {
      video.pause();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
      video.load(); // libera el buffer y vuelve a mostrar el póster
      cargadoRef.current = false;
    };

    const cargar = async (): Promise<void> => {
      if (cargadoRef.current) return;
      cargadoRef.current = true;
      setError(null);
      setPausado(false); // al entrar en vista se reproduce: no hay pausa manual pendiente

      // hls.js PRIMERO (donde esta soportado: MSE / Managed Media Source en iOS 17.1+), con un LOADER
      // propio que propaga el token a CADA peticion. El HLS nativo queda de fallback SOLO donde hls.js
      // no corre.
      let usaHlsJs = false;
      try {
        const { default: Hls } = await import("hls.js");
        if (cancelado) return;
        if (Hls.isSupported()) {
          usaHlsJs = true;
          const params = src.includes("?") ? src.slice(src.indexOf("?") + 1) : "";
          class LoaderConToken extends Hls.DefaultConfig.loader {
            load(
              context: LoaderContext,
              config: LoaderConfiguration,
              callbacks: LoaderCallbacks<LoaderContext>,
            ): void {
              if (params && !context.url.includes("token=")) {
                context.url += (context.url.includes("?") ? "&" : "?") + params;
              }
              super.load(context, config, callbacks);
            }
          }
          const hls = new Hls({ enableWorker: true, loader: LoaderConToken });
          hls.on(Hls.Events.ERROR, (_evento, data) => {
            if (!data.fatal) return; // solo los fatales; los recuperables los gestiona hls.js
            // 404/410 en la playlist o el segmento = el objeto ya no existe en Bunny -> PERMANENTE.
            // Cualquier otro fatal (timeout, red caída, decodificación) se trata como transitorio.
            const codigo = data.response?.code;
            setError(codigo === 404 || codigo === 410 ? "permanente" : "transitorio");
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          hlsRef.current = hls;
        }
      } catch {
        setError("transitorio");
        return;
      }

      if (!usaHlsJs) {
        if (video.canPlayType(HLS_NATIVO)) {
          video.src = src;
        } else {
          setError("transitorio");
          return;
        }
      }
      if (esFeed) {
        try {
          await video.play();
        } catch {
          // Autoplay CON sonido bloqueado por el navegador (sin gesto del usuario): reintenta EN MUTE
          // para que el vídeo AL MENOS autoreproduzca —nunca se queda parado en el póster—. La
          // PREFERENCIA global sigue siendo la del feed; el primer gesto del usuario la reconcilia
          // (ver `alternarPausa` y el sync de `muted`) y, si pedía sonido, lo activa.
          try {
            video.muted = true;
            await video.play();
          } catch {
            /* ni en mute -> se queda en el póster, sin romper */
          }
        }
      }
    };

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) void cargar();
          else soltar();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(cont);

    return () => {
      cancelado = true;
      io.disconnect();
      soltar();
    };
  }, [src, esFeed, intento]);

  // Mute del elemento sincronizado con el estado (controlado por el feed o local en detalle).
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = silenciado;
  }, [silenciado]);

  // PROGRESO (solo feed): rAF mientras reproduce; para al pausar/salir. Los eventos del <video> son la
  // fuente de verdad (cubren pausa manual, buffering y fin de bucle).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !esFeed) return;
    let raf = 0;
    const tick = (): void => {
      if (video.duration > 0) setProgreso(video.currentTime / video.duration);
      raf = requestAnimationFrame(tick);
    };
    const arrancar = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const parar = (): void => cancelAnimationFrame(raf);
    // Orientación por la relación REAL del vídeo (no del contenedor): decide cover vs contain.
    const medir = (): void => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setOrientacion(video.videoHeight > video.videoWidth ? "vertical" : "horizontal");
      }
    };
    if (video.readyState >= 1) medir(); // metadatos ya disponibles (recarga)
    video.addEventListener("loadedmetadata", medir);
    video.addEventListener("playing", arrancar);
    video.addEventListener("pause", parar);
    video.addEventListener("ended", parar);
    return () => {
      parar();
      video.removeEventListener("loadedmetadata", medir);
      video.removeEventListener("playing", arrancar);
      video.removeEventListener("pause", parar);
      video.removeEventListener("ended", parar);
    };
  }, [esFeed, src, intento]);

  // Fallo PERMANENTE (el vídeo ya no existe): avisa al contenedor. El feed lo aprovecha para retirar el
  // slide del scroll; el detalle no pasa handler y se queda solo con el mensaje terminal.
  useEffect(() => {
    if (error === "permanente") onNoDisponible?.();
  }, [error, onNoDisponible]);

  // --- Tap para pausar/reanudar (feed) ---
  function alternarPausa(): void {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // Un gesto del usuario permite salir del mute que el navegador forzó al bloquear el autoplay con
      // sonido: reconcilia el `muted` del elemento con la PREFERENCIA (`silenciado`) antes de reproducir.
      // Si la preferencia es "con sonido", este toque lo activa (ya hay gesto -> el navegador lo permite).
      v.muted = silenciado;
      void v.play().catch(() => {});
      setPausado(false);
    } else {
      v.pause();
      setPausado(true);
    }
  }
  function onTapDown(e: ReactPointerEvent): void {
    bajadaRef.current = { x: e.clientX, y: e.clientY };
    swipeRef.current = false;
  }
  function onTapMove(e: ReactPointerEvent): void {
    const b = bajadaRef.current;
    if (b && Math.hypot(e.clientX - b.x, e.clientY - b.y) > UMBRAL_TAP_PX) swipeRef.current = true;
  }
  function onTapClick(): void {
    // El click nativo cubre el tap Y el teclado (Space/Enter en el <button>). Si hubo arrastre, fue
    // scroll: no alternamos.
    if (swipeRef.current) return;
    alternarPausa();
  }

  // --- Seek por la barra (solo cuando está pausado) ---
  function buscarEn(clientX: number): void {
    const v = videoRef.current;
    const barra = barraRef.current;
    if (!v || !barra || !(v.duration > 0)) return;
    const r = barra.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    v.currentTime = ratio * v.duration;
    setProgreso(ratio);
  }
  function onBarraDown(e: ReactPointerEvent): void {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    buscarEn(e.clientX);
  }
  function onBarraMove(e: ReactPointerEvent): void {
    if (e.pointerType === "mouse" && e.buttons === 0) return; // ratón sin botón: no arrastres
    buscarEn(e.clientX);
  }

  // Fondo DIFUMINADO (póster escalado + blur): cubre los lados/franjas sin barras negras ni recorte.
  const relleno = (
    <div
      aria-hidden
      className="absolute inset-0 bg-void bg-cover bg-center"
      style={{ backgroundImage: `url("${poster}")`, filter: "blur(28px)", transform: "scale(1.2)" }}
    />
  );

  // FEED: vertical llena la pantalla (cover, recorta lo mínimo); horizontal no recorta los lados
  // (contain + relleno difuminado). DETALLE: siempre contain (el encuadre lo pone CajaVideo).
  const ajuste = !esFeed || orientacion === "horizontal" ? "object-contain" : "object-cover";

  const video = (
    <video
      ref={videoRef}
      poster={poster}
      muted={silenciado}
      loop={esFeed}
      playsInline
      controls={!esFeed} // detalle: controles nativos mínimos; feed: cromo propio
      controlsList="nodownload noplaybackrate noremoteplayback"
      disablePictureInPicture
      onError={() => setError((prev) => prev ?? "transitorio")}
      className={`h-full w-full ${ajuste}`}
      aria-label="Vídeo"
    />
  );

  // PERMANENTE: mensaje terminal, SIN "Reintentar" (nunca funcionaría). TRANSITORIO: el reintento actual.
  const overlayError =
    error === "permanente" ? (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-void/85 p-4 text-center">
        <p className="text-sm font-medium text-text">Este vídeo ya no está disponible</p>
        <p className="text-2xs text-text-dim">Puede que su autor lo haya retirado.</p>
      </div>
    ) : error === "transitorio" ? (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-void/85 p-4 text-center">
        <p className="text-sm text-text-dim">No se pudo cargar el vídeo. Reintenta.</p>
        <button
          type="button"
          onClick={() => {
            cargadoRef.current = false;
            setError(null);
            setIntento((n) => n + 1);
          }}
          className="rounded-sm border border-line px-4 py-1.5 text-sm text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
        >
          Reintentar
        </button>
      </div>
    ) : null;

  // DETALLE: usa CajaVideo (16:9 escritorio / 9:16 móvil) con el relleno difuminado. Sin cromo propio.
  if (variante === "detalle") {
    return (
      <div ref={contenedorRef} className="h-full w-full">
        <CajaVideo relleno={relleno} overlays={overlayError} className="h-full w-full">
          {video}
        </CajaVideo>
      </div>
    );
  }

  // FEED: 9:16 inmersivo con controles propios (tap-pausa, icono play, barra de progreso).
  return (
    <div ref={contenedorRef} className="relative h-full w-full overflow-hidden">
      {relleno}
      {/* El vídeo llena TODO el slide (a sangre): vertical con cover, horizontal con contain sobre el
          relleno difuminado. La barra inferior fija (móvil) se superpone abajo; los controles flotan
          sobre ella (safe-area) sin reservar espacio, así el vídeo no queda pequeño ni difuminado. */}
      <div className="absolute inset-0 flex items-center justify-center">{video}</div>

      {/* Capa de TAP (pausa/reanuda). z por DEBAJO de la barra (para no robar el seek) y de los
          overlays del feed (caption/acciones/mute, z-10). `touch-action: pan-y` deja pasar el scroll
          vertical del snap; el umbral de movimiento distingue tap de swipe. El click nativo cubre el
          tap y el teclado (Space/Enter con foco). */}
      <button
        type="button"
        aria-label={pausado ? "Reanudar el vídeo" : "Pausar el vídeo"}
        onPointerDown={onTapDown}
        onPointerMove={onTapMove}
        onClick={onTapClick}
        style={{ touchAction: "pan-y" }}
        className="absolute inset-0 z-[1] cursor-default appearance-none bg-transparent"
      />

      {/* Icono PLAY central al pausar (decorativo, no intercepta). */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-[2] flex items-center justify-center transition-opacity duration-[var(--df-dur-fast)] ease-mechanical ${
          pausado && !error ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="grid h-16 w-16 place-items-center rounded-full bg-void/45 text-white backdrop-blur-sm">
          <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>

      {/* BARRA DE PROGRESO: fina al reproducir (no interactiva) y sobre la barra inferior + safe-area.
          Al pausar: engorda, aparece el scrubber y acepta seek (tocar/arrastrar). El contenedor añade
          zona táctil vertical al pausar para que sea fácil de agarrar. */}
      <div
        className={`absolute inset-x-0 bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] z-[2] px-3 lg:bottom-0 ${
          pausado ? "pointer-events-auto py-3" : "pointer-events-none py-0"
        }`}
        onPointerDown={pausado ? onBarraDown : undefined}
        onPointerMove={pausado ? onBarraMove : undefined}
      >
        <div
          ref={barraRef}
          className={`relative w-full rounded-full bg-white/25 transition-[height] duration-[var(--df-dur-fast)] ease-mechanical ${
            pausado ? "h-1.5" : "h-[3px]"
          }`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white"
            style={{ width: `${progreso * 100}%` }}
          />
          {pausado ? (
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[var(--df-shadow-sm)]"
              style={{ left: `${progreso * 100}%` }}
            />
          ) : null}
        </div>
      </div>

      {overlayError}
    </div>
  );
}
