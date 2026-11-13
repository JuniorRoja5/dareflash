"use client";

import { useEffect, useRef, useState } from "react";

type Estado = "cargando" | "lista" | "error";

/**
 * LA IMAGEN DE UN ANUNCIO, sin recortar nunca lo esencial del creativo.
 *
 * Los creativos llegan en cualquier proporción (hasta `PUBLICIDAD_IMAGEN_MAX_LADO` de lado, y muchos
 * verticales, que es el formato del feed). Un `object-cover` recortaba el texto del creativo; un
 * `object-contain` solo dejaba bandas muertas. Aquí la imagen va CONTENIDA y, detrás, una copia
 * desenfocada de la misma imagen llena el hueco con sus propios colores: un vertical, un cuadrado o un
 * apaisado se ven intencionados, y no se pierde un píxel del creativo.
 *
 * TRES ESTADOS, los tres pintados: cargando (el fondo `--df-raised` quieto; la imagen entra solo con
 * `opacity`), lista y error (un aviso discreto en su sitio: la tarjeta no se descoloca y la empresa, en
 * la vista previa, ve que su imagen no carga).
 *
 * Si la imagen ya estaba en caché, `onLoad` puede dispararse ANTES de hidratar y perderse: por eso el
 * efecto mira `complete` al montar.
 */
export function ImagenAnuncio({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [estado, setEstado] = useState<Estado>("cargando");

  useEffect(() => {
    const img = ref.current;
    if (img?.complete) setEstado(img.naturalWidth > 0 ? "lista" : "error");
  }, []);

  return (
    <div
      data-imagen-anuncio={estado}
      className="relative isolate aspect-[4/3] overflow-hidden bg-raised @2xl:aspect-auto @2xl:min-h-[20rem]"
    >
      {estado === "error" ? (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-text-dim">
          La imagen no se ha podido cargar.
        </p>
      ) : (
        <>
          {/* El relleno: la MISMA imagen, desenfocada y atenuada. Decorativo. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- fichero del volumen, servido por Caddy */}
          <img
            src={src}
            alt=""
            aria-hidden
            className={`absolute inset-0 -z-10 h-full w-full scale-110 object-cover blur-2xl transition-opacity duration-500 ${
              estado === "lista" ? "opacity-50" : "opacity-0"
            }`}
            loading="lazy"
            decoding="async"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- fichero del volumen, servido por Caddy */}
          <img
            ref={ref}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
              estado === "lista" ? "opacity-100" : "opacity-0"
            }`}
            loading="lazy"
            decoding="async"
            onLoad={() => setEstado("lista")}
            onError={() => setEstado("error")}
          />
        </>
      )}
    </div>
  );
}
