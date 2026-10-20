import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";
import type { RetoPublicoVista } from "@/server/services/retos-publico";

import { ChapaExclusivo } from "./chapa-exclusivo";
import { nombreCategoria } from "./retos-datos";

/** Triangulo de "play" del placeholder de la miniatura (SVG inline; nada de emojis como iconos). */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-text-dim" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/** Lo común a las dos tarjetas: cambia el ENVOLTORIO, no lo que se enseña de un reto. */
const CLASES_CUERPO = "group flex h-full flex-col overflow-hidden rounded-sm lg:flex-row";
/** El movimiento al pasar por encima va SIEMPRE en el nodo de fuera: dentro del marco, la tarjeta
 *  exclusiva se movería por debajo de su propio borde dorado. */
const CLASES_HOVER =
  "transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-1 hover:shadow-[var(--df-glow-hover)]";

/**
 * TARJETA DE RETO (datos REALES). Presentación intacta (brief v2, reflowa por ancho): miniatura
 * VERTICAL 9:16 en móvil / APAISADA en lg, con el MARCADOR (premio en --df-money + cuenta atrás) superpuesto
 * abajo. Enlaza a la URL canónica `/retos/{publicCode}-{slug}`. Solo campos de la doc: título, premio,
 * cierre y categoría (nada de autor/votos/miniatura maqueta). "Participar" es acción aparte, secundaria.
 *
 * ┌─ EL RETO EXCLUSIVO: MARCO DORADO, Y SOLO ÉL ────────────────────────────────────────────────┐
 * │ Un reto `soloVip` se envuelve en el marco de luz (`df-reto-exclusivo*`) y lleva su chapa. Un │
 * │ reto normal se devuelve ANTES, con EL MISMO nodo de siempre: ni un envoltorio de más, ni una │
 * │ clase de más. Es el candado de la identidad aplicado aquí — como el oro no puede llegar por  │
 * │ ningún otro camino, es imposible que aparezca en un reto que no es exclusivo.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL PREMIO SIGUE EN `--df-money`, y eso es una desviación consciente de la maqueta (que lo pinta
 * en oro). Medido: en el tema CLARO `--vip-gold` y `--df-money` están a ΔE 4,6 —o sea, el mismo
 * color a la vista—, así que "el premio en oro" solo existiría en oscuro; y en oscuro queda a ΔE 6,4
 * del oro del PODIO (`--df-rank`), que significa otra cosa. El dinero se pinta como el dinero en
 * todas las pantallas del producto; lo que marca la exclusividad son el marco y la chapa, que son
 * forma y no color sobre una cifra.
 */
export function TarjetaReto({ reto }: { reto: RetoPublicoVista }) {
  const href = `/retos/${reto.publicCode}-${reto.slug}`;

  const contenido = (
    <>
      <Link
        href={href}
        aria-hidden
        tabIndex={-1}
        /* Portada APAISADA en móvil: con 9:16 y dos columnas, dos retos llenaban la pantalla entera.
           Es una portada para decidir si entras, no un vídeo que se reproduce aquí. */
        className="df-sheen relative block aspect-[4/3] shrink-0 bg-raised lg:aspect-video lg:w-[44%]"
      >
        {/* Portada real (servida por Caddy, no next/image) o placeholder si no hay. */}
        {reto.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- estático servido por Caddy en /portadas/*
          <img
            src={reto.coverImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <IconoPlay />
          </span>
        )}
        {/* LAS DOS ETIQUETAS, EN UNA FILA Y NO EN DOS ESQUINAS.
            Estaban en esquinas opuestas (`left-2.5` y `right-2.5`) y en móvil —dos columnas, tarjeta
            de ~170 px— la chapa se montaba ENCIMA de la categoría y la tapaba: se vio en una
            captura, y ningún test lo habría visto. En una fila no pueden solaparse: o caben las
            dos, o la segunda baja de línea. */}
        <span className="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex flex-wrap items-start justify-between gap-1.5">
          <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
          {reto.soloVip ? <ChapaExclusivo compacta /> : null}
        </span>
        {/* MARCADOR — firma, superpuesto abajo (siempre visible). Halo de dinero. */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block border-t border-line bg-void/70 px-2.5 py-2"
          style={{ filter: "var(--df-glow-dinero)" }}
        >
          <Marcador
            cents={reto.premioCents}
            deadlineMs={reto.deadlineMs}
            tamano="lista"
            apilarEnMovil
          />
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 lg:p-4">
        <h2 className="min-w-0">
          <Link
            href={href}
            /* DOS LÍNEAS, y el marco dorado depende de ello: el cuadrado que gira se dimensiona
               desde el ANCHO de la tarjeta y cubre la diagonal mientras no sea 1,73 veces más alta
               que ancha. Un título sin recortar rompería esa cuenta (ver `globals.css`). */
            className="line-clamp-2 rounded-xs leading-snug font-semibold text-text hover:text-text-dim"
          >
            {reto.titulo}
          </Link>
        </h2>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Boton href={href} variante="secundario" className="ml-auto px-4">
            Ver reto
          </Boton>
        </div>
      </div>
    </>
  );

  // RETO NORMAL: EL MISMO nodo de antes de la Fase 8. Sin envoltorio y sin una clase de más.
  if (!reto.soloVip) {
    return (
      <article
        className={`${CLASES_CUERPO} border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md ${CLASES_HOVER}`}
      >
        {contenido}
      </article>
    );
  }

  return (
    <div data-reto-exclusivo className={`df-reto-exclusivo h-full ${CLASES_HOVER}`}>
      <div className="df-reto-exclusivo-borde h-full">
        <article className={`${CLASES_CUERPO} df-reto-exclusivo-cara shadow-[var(--df-shadow-md)]`}>
          {contenido}
        </article>
      </div>
    </div>
  );
}
