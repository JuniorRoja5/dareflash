import type { PiezaEntregada } from "@/server/services/publicidad-entrega";

import { Denunciar } from "./denunciar";
import { ImagenAnuncio } from "./imagen-anuncio";

/** A partir de esta longitud el texto baja un escalón: 125 caracteres en el cuerpo grande eran 7 líneas. */
const TEXTO_LARGO = 70;

/**
 * LA TARJETA DE UN ANUNCIO, tipo entrada de blog (Fase 9 · P7, rediseñada). UN SOLO componente para
 * todos los sitios donde se pinta un anuncio fuera del feed vertical: la portada a lo ancho (Espacio 1),
 * el carril de la portada (Espacio 2) y la vista previa «Así se verá» del portal. La vista previa sale
 * de AQUÍ y de la misma `piezaDeCampana` que el reparto: lo que la empresa ve es lo que se publica (un
 * test lo exige).
 *
 * LA DISPOSICIÓN LA DECIDE EL ANCHO DE SU CAJA, no el de la ventana (`@container`): a partir de 42rem
 * de caja, imagen a la izquierda (la mitad) y el texto al lado; más estrecha —móvil, el carril, la
 * columna de la vista previa—, la imagen arriba. Así no hace falta una variante «compacta» que se
 * desincronice de la ancha: es el mismo marcado. Y nunca se estira de lado a lado: `max-w-4xl`.
 *
 * REGLAS QUE NO SE MUEVEN:
 *  - La etiqueta («Publicidad» o «De DareFlash») SIEMPRE a la vista, la primera de la columna de texto
 *    y con el contraste del texto principal: es la identificación obligatoria de la publicidad.
 *  - «Visitar» es NEUTRO, nunca `--df-action`: la acción de la pantalla es la de DareFlash, y un anuncio
 *    que la imitara competiría con ella.
 *  - Profundidad por LUMINOSIDAD (`--df-surface` sobre el fondo, `--df-raised` en la imagen), sin sombra.
 *  - El enlace es `pieza.enlace` (`/ir/{id}`, que cuenta el clic); el dominio es TEXTO, no enlace.
 *  - «Denunciar» al lado de la etiqueta, fuera del creativo (antes tapaba una esquina de la imagen).
 */
export function TarjetaAnuncio({
  pieza,
  denuncia = null,
  previa = false,
}: {
  pieza: PiezaEntregada;
  /** P8: con qué sesión se puede denunciar la campaña; `null` para quien solo mira. La casa, nunca. */
  denuncia?: { haySesion: boolean; emailVerificado: boolean } | null;
  /**
   * La vista previa del portal: el MISMO dibujo, pero «Visitar» no navega (la campaña aún no se sirve
   * y un clic de la propia empresa no debe contar) y no se ofrece denunciarla.
   */
  previa?: boolean;
}) {
  const externo = pieza.externo ? { target: "_blank", rel: "sponsored noopener noreferrer" } : {};
  const cta = (
    <>
      {pieza.cta}
      {pieza.externo ? (
        // Dice algo (se abre fuera, en otra pestaña), no adorna.
        <span aria-hidden className="ml-1.5">
          ↗
        </span>
      ) : null}
    </>
  );
  const claseCta =
    "inline-flex min-h-[44px] shrink-0 items-center rounded-sm border border-line bg-raised px-5 text-sm font-semibold text-text hover:border-text-dim";
  // Sin título (una campaña): el texto ES el titular. Con título (la casa): el título lo es.
  const textoEsTitular = !pieza.titulo;
  const largo = pieza.texto.length > TEXTO_LARGO;

  return (
    <aside
      aria-label={pieza.etiqueta}
      data-pieza={pieza.tipo}
      data-tarjeta-anuncio={previa ? "previa" : "servida"}
      className="@container mx-auto w-full max-w-4xl"
    >
      <div
        className={`grid overflow-hidden rounded-sm border border-line bg-surface ${
          pieza.imagen ? "@2xl:grid-cols-2" : ""
        }`}
      >
        {pieza.imagen ? <ImagenAnuncio src={pieza.imagen} /> : null}

        <div className="flex min-w-0 flex-col gap-4 p-5 @2xl:p-8">
          <div className="flex min-h-[44px] items-center justify-between gap-3">
            <span
              data-etiqueta-anuncio
              className="rounded-xs border border-line px-2 py-0.5 text-2xs font-semibold tracking-widest text-text uppercase"
            >
              {pieza.etiqueta}
            </span>
            {pieza.tipo === "campana" && denuncia && !previa ? (
              <Denunciar
                targetType="PUBLICIDAD"
                targetId={pieza.id}
                haySesion={denuncia.haySesion}
                emailVerificado={denuncia.emailVerificado}
                esMio={false}
                className="text-text-dim"
              />
            ) : null}
          </div>

          {pieza.titulo ? (
            <p className="font-display text-xl font-semibold text-balance text-text @2xl:text-2xl">
              {pieza.titulo}
            </p>
          ) : null}
          <p
            className={
              textoEsTitular
                ? `font-display font-semibold text-pretty break-words text-text ${
                    largo ? "text-lg @2xl:text-xl" : "text-xl @2xl:text-3xl"
                  }`
                : "text-sm break-words text-text-dim"
            }
          >
            {pieza.texto}
          </p>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-2">
            {pieza.dominio ? (
              <p className="min-w-0 truncate text-sm text-text-dim" data-dominio-anuncio>
                {pieza.dominio}
              </p>
            ) : null}
            {previa ? (
              <span className={claseCta} aria-disabled="true">
                {cta}
              </span>
            ) : (
              <a href={pieza.enlace} {...externo} className={claseCta}>
                {cta}
              </a>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
