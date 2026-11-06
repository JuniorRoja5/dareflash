import { Denunciar } from "@/components/ui/denunciar";
import type { PiezaEntregada } from "@/server/services/publicidad-entrega";

/**
 * UNA PIEZA DE PUBLICIDAD EN EL FEED (Fase 9 · P7): una diapositiva más del scroll, con la MISMA altura
 * y el mismo marco 9:16 que un vídeo, para que el snap no salte. No es un vídeo: no reproduce nada ni
 * cuenta como «visto»; el feed la salta en todo lo que va por vídeo (ver `FeedVertical`).
 *
 * LA ETIQUETA SIEMPRE A LA VISTA y arriba: «Publicidad» si es de un tercero, «De DareFlash» si es la
 * casa (ver `ETIQUETA_PIEZA_*`). Escondida en un rincón o tras un toque sería publicidad encubierta.
 *
 * EL ENLACE SALE DEL DTO (`enlace`, generado en una sola función: `enlaceDeCampana`), y el de una campaña
 * va en pestaña nueva con `rel="sponsored noopener noreferrer"`: es de un tercero, se dice a los
 * buscadores que es pagado y no se le pasa ni el `window.opener` ni de dónde viene la visita.
 */
export function PiezaFeed({
  pieza,
  alRef,
  denuncia = null,
}: {
  pieza: PiezaEntregada;
  alRef: (el: HTMLElement | null) => void;
  /**
   * P8: con qué sesión se puede DENUNCIAR la campaña (la misma regla que un vídeo), o `null` para quien
   * solo mira (una cuenta de empresa). La casa no se denuncia: es de DareFlash.
   */
  denuncia?: { haySesion: boolean; emailVerificado: boolean } | null;
}) {
  const esCasa = pieza.tipo === "casa";
  return (
    <section
      ref={alRef}
      aria-label={pieza.etiqueta}
      data-pieza={pieza.tipo}
      className="relative flex h-[100svh] snap-start items-center justify-center"
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-raised lg:h-[calc(100svh-2rem)] lg:aspect-[9/16] lg:w-auto lg:rounded-sm lg:border lg:border-line">
        {/* LA ETIQUETA, arriba y fija: es lo primero que se lee. */}
        <span className="absolute top-4 left-4 z-10 rounded-xs bg-void/70 px-2 py-1 text-2xs font-semibold tracking-widest text-text uppercase backdrop-blur-sm">
          {pieza.etiqueta}
        </span>
        {/* DENUNCIAR una campaña (P8): arriba a la derecha, frente a la etiqueta. */}
        {!esCasa && denuncia ? (
          <div className="absolute top-3 right-3 z-10 rounded-xs bg-void/70 backdrop-blur-sm">
            <Denunciar
              targetType="PUBLICIDAD"
              targetId={pieza.id}
              haySesion={denuncia.haySesion}
              emailVerificado={denuncia.emailVerificado}
              esMio={false}
              className="text-text"
            />
          </div>
        ) : null}

        {pieza.imagen ? (
          <div className="relative min-h-0 flex-1 bg-void">
            {/* eslint-disable-next-line @next/next/no-img-element -- fichero del volumen, servido por Caddy */}
            <img
              src={pieza.imagen}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : (
          // LA CASA no trae imagen: el hueco es su texto, centrado y grande.
          <div className="flex min-h-0 flex-1 items-center justify-center px-8">
            <p className="text-center text-2xl font-semibold text-balance text-text">
              {pieza.titulo}
            </p>
          </div>
        )}

        <div className="space-y-3 border-t border-line bg-surface p-5 pb-24 lg:pb-5">
          <p className="text-base break-words text-text">{pieza.texto}</p>
          <a
            href={pieza.enlace}
            {...(pieza.externo ? { target: "_blank", rel: "sponsored noopener noreferrer" } : {})}
            className="flex min-h-[44px] w-full items-center justify-center rounded-sm border border-line bg-raised px-4 text-sm font-semibold text-text hover:bg-void/40"
          >
            {pieza.cta}
            {pieza.externo ? (
              <span aria-hidden className="ml-1.5">
                ↗
              </span>
            ) : null}
          </a>
          {esCasa ? null : <p className="text-2xs text-text-dim">Se abre en una pestaña nueva.</p>}
        </div>
      </div>
    </section>
  );
}
