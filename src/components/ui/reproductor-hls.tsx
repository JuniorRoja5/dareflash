"use client";

import type { LoaderCallbacks, LoaderConfiguration, LoaderContext } from "hls.js";
import { useEffect, useRef, useState } from "react";

import { CajaVideo } from "./caja-video";

/**
 * REPRODUCTOR HLS reutilizable — la primitiva de reproducción que consumen Feed, detalle y perfil.
 * Reproduce un stream HLS (.m3u8) con control TOTAL del encuadre y el comportamiento (el iframe de
 * Bunny queda descartado). NO se acopla a Bunny: la URL llega por `src` (la firma la da el backend en
 * su pieza); aquí NO se construye ninguna URL ni clave.
 *
 * Reproducción: HLS NATIVO donde el navegador lo soporta (Safari/iOS -> `canPlayType`), y `hls.js`
 * (import DINÁMICO, fuera del bundle inicial) en el resto. Rendimiento: carga/reproduce SOLO cuando
 * está en pantalla (IntersectionObserver) y suelta el buffer al salir de vista — clave para un feed
 * con muchos vídeos (nunca 10 a la vez).
 *
 * Encuadre (reglas cerradas): `feed` = 9:16 inmersivo (el vídeo llena el alto; el material que no sea
 * 9:16 se rellena con fondo DIFUMINADO, nunca barras ni recorte). `detalle` = 16:9 en escritorio /
 * 9:16 en móvil vía `CajaVideo`, con el mismo relleno difuminado.
 */
type Variante = "feed" | "detalle";

const HLS_NATIVO = "application/vnd.apple.mpegurl";

export function ReproductorHls({
  src,
  poster,
  variante,
}: {
  src: string;
  poster: string;
  variante: Variante;
}) {
  const esFeed = variante === "feed";
  const videoRef = useRef<HTMLVideoElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const cargadoRef = useRef(false);
  const [error, setError] = useState(false);
  const [silenciado, setSilenciado] = useState(true); // el feed arranca en mute (autoplay lo exige)
  const [intento, setIntento] = useState(0); // fuerza recarga al "Reintentar"

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
      setError(false);

      // hls.js PRIMERO (donde esta soportado: MSE / Managed Media Source en iOS 17.1+), con un LOADER
      // propio que propaga el token a CADA peticion. El HLS nativo queda de fallback SOLO donde hls.js
      // no corre.
      let usaHlsJs = false;
      try {
        const { default: Hls } = await import("hls.js");
        if (cancelado) return;
        if (Hls.isSupported()) {
          usaHlsJs = true;
          // El token del endpoint viaja en el query de `src` (?token=...&token_path=...&expires=...).
          // hls.js NO lo arrastra a los segmentos por defecto -> se anade en el loader a la playlist,
          // subniveles (p.ej. 720p/) y segmentos (.ts/.m4s). El token es de DIRECTORIO /{videoId}/, asi
          // que la MISMA firma cubre todo ese prefijo.
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
            if (data.fatal) setError(true); // solo los fatales; los recuperables los gestiona hls.js
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          hlsRef.current = hls;
        }
      } catch {
        setError(true);
        return;
      }

      if (!usaHlsJs) {
        // FALLBACK HLS NATIVO (iOS viejo sin MSE). LIMITACION CONOCIDA: el navegador pide los segmentos
        // por su cuenta y aqui el token NO se propaga a ellos -> con token-auth activo darian 403. Se
        // decide aparte; NO se resuelve en esta pieza.
        if (video.canPlayType(HLS_NATIVO)) {
          video.src = src;
        } else {
          setError(true);
          return;
        }
      }
      if (esFeed) {
        // Autoplay: puede fallar por política del navegador -> se queda en el póster, sin romper.
        try {
          await video.play();
        } catch {
          /* autoplay bloqueado */
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

  // Mantener el mute del elemento sincronizado con el estado (toggle de sonido del feed).
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = silenciado;
  }, [silenciado]);

  // Fondo DIFUMINADO (póster escalado + blur): cubre los lados/franjas sin barras negras ni recorte.
  const relleno = (
    <div
      aria-hidden
      className="absolute inset-0 bg-void bg-cover bg-center"
      style={{ backgroundImage: `url("${poster}")`, filter: "blur(28px)", transform: "scale(1.2)" }}
    />
  );

  const video = (
    <video
      ref={videoRef}
      poster={poster}
      muted={silenciado}
      loop={esFeed}
      playsInline
      controls={!esFeed} // detalle: controles nativos mínimos; feed: sin cromo (solo el toggle)
      controlsList="nodownload noplaybackrate noremoteplayback"
      disablePictureInPicture
      onError={() => setError(true)}
      className="h-full w-full object-contain"
      aria-label="Vídeo"
    />
  );

  const overlayError = error ? (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-void/85 p-4 text-center">
      <p className="text-sm text-text-dim">No se pudo cargar el vídeo. Reintenta.</p>
      <button
        type="button"
        onClick={() => {
          cargadoRef.current = false;
          setError(false);
          setIntento((n) => n + 1);
        }}
        className="rounded-sm border border-line px-4 py-1.5 text-sm text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised"
      >
        Reintentar
      </button>
    </div>
  ) : null;

  const toggleSonido = esFeed ? (
    <button
      type="button"
      onClick={() => setSilenciado((s) => !s)}
      aria-label={silenciado ? "Activar sonido" : "Silenciar"}
      className="absolute bottom-3 left-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-void/60 text-white backdrop-blur-sm transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-void/80"
    >
      <IconoSonido silenciado={silenciado} />
    </button>
  ) : null;

  // DETALLE: usa CajaVideo (16:9 escritorio / 9:16 móvil) con el relleno difuminado.
  if (variante === "detalle") {
    return (
      <div ref={contenedorRef} className="h-full w-full">
        <CajaVideo relleno={relleno} overlays={overlayError} className="h-full w-full">
          {video}
        </CajaVideo>
      </div>
    );
  }

  // FEED: 9:16 inmersivo (no usa CajaVideo). Llena su contenedor; el vídeo se centra (object-contain)
  // y el fondo difuminado rellena lo que sobre.
  return (
    <div ref={contenedorRef} className="relative h-full w-full overflow-hidden">
      {relleno}
      <div className="absolute inset-0 flex items-center justify-center">{video}</div>
      {toggleSonido}
      {overlayError}
    </div>
  );
}

/** Icono de altavoz (con/sin ondas). SVG inline, trazo de marca; nada de librerías de iconos. */
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
