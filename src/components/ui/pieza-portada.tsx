import type { PiezaEntregada } from "@/server/services/publicidad-entrega";

import { Denunciar } from "./denunciar";

/**
 * UN HUECO DE PUBLICIDAD EN LA PORTADA (Fase 9 · P7): Espacio 1 (global/país) o Espacio 2 (local).
 *
 * LA ETIQUETA SIEMPRE A LA VISTA, arriba: «Publicidad» si es de un tercero, «De DareFlash» si es la casa.
 * Sin acento de acción: el CTA del cromo y el del hero son los acentos de la pantalla, y un anuncio que
 * los imitara competiría con ellos. El enlace sale del DTO (`enlaceDeCampana`, una sola función para el
 * feed y la portada) y, si es de un tercero, en pestaña nueva con `rel="sponsored noopener noreferrer"`.
 *
 * `compacta`: la del rail de la derecha (Espacio 2), con la imagen arriba; la ancha (Espacio 1) pone la
 * imagen al lado en escritorio y encima en móvil.
 */
export function PiezaPortada({
  pieza,
  compacta = false,
  denuncia = null,
}: {
  pieza: PiezaEntregada;
  compacta?: boolean;
  /** P8: con qué sesión se puede denunciar la campaña; `null` para quien solo mira. La casa, nunca. */
  denuncia?: { haySesion: boolean; emailVerificado: boolean } | null;
}) {
  const externo = pieza.externo ? { target: "_blank", rel: "sponsored noopener noreferrer" } : {};
  return (
    <aside
      aria-label={pieza.etiqueta}
      data-pieza={pieza.tipo}
      className={`relative overflow-hidden rounded-sm border border-line bg-surface/80 shadow-[var(--df-shadow-sm)] backdrop-blur-sm ${
        compacta ? "" : "sm:flex sm:items-stretch"
      }`}
    >
      <span className="absolute top-3 left-3 z-10 rounded-xs bg-void/70 px-2 py-0.5 text-2xs font-semibold tracking-widest text-text uppercase backdrop-blur-sm">
        {pieza.etiqueta}
      </span>
      {pieza.tipo === "campana" && denuncia ? (
        <div className="absolute top-2 right-2 z-10 rounded-xs bg-void/70 backdrop-blur-sm">
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
        <div
          className={`relative bg-void ${compacta ? "aspect-[4/3]" : "aspect-[4/3] sm:aspect-auto sm:w-64 sm:shrink-0"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- fichero del volumen, servido por Caddy */}
          <img
            src={pieza.imagen}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}
      <div className={`min-w-0 flex-1 space-y-2 p-5 ${pieza.imagen ? "" : "pt-11"}`}>
        {pieza.titulo ? (
          <p className="text-lg font-semibold text-balance text-text">{pieza.titulo}</p>
        ) : null}
        <p className="text-sm break-words text-text-dim">{pieza.texto}</p>
        <a
          href={pieza.enlace}
          {...externo}
          className="inline-flex min-h-[44px] items-center rounded-sm border border-line px-4 text-sm font-semibold text-text hover:bg-raised"
        >
          {pieza.cta}
          {pieza.externo ? (
            <span aria-hidden className="ml-1.5">
              ↗
            </span>
          ) : null}
        </a>
      </div>
    </aside>
  );
}
