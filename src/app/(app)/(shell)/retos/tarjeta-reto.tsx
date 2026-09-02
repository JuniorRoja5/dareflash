import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";
import type { RetoPublicoVista } from "@/server/services/retos-publico";

import { nombreCategoria } from "./retos-datos";

/** Triangulo de "play" del placeholder de la miniatura (SVG inline; nada de emojis como iconos). */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-text-dim" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/**
 * TARJETA DE RETO (datos REALES). Presentación intacta (brief v2, reflowa por ancho): miniatura
 * VERTICAL 9:16 en móvil / APAISADA en lg, con el MARCADOR (premio en lima + cuenta atrás) superpuesto
 * abajo. Enlaza a la URL canónica `/retos/{publicCode}-{slug}`. Solo campos de la doc: título, premio,
 * cierre y categoría (nada de autor/votos/miniatura maqueta). "Participar" es acción aparte, secundaria.
 */
export function TarjetaReto({ reto }: { reto: RetoPublicoVista }) {
  const href = `/retos/${reto.publicCode}-${reto.slug}`;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-1 hover:shadow-[var(--df-glow-hover)] lg:flex-row">
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
        <span className="pointer-events-none absolute top-2.5 left-2.5 z-10">
          <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
        </span>
        {/* MARCADOR — firma, superpuesto abajo (siempre visible). Halo lima. */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block border-t border-line bg-void/70 px-2.5 py-2"
          style={{ filter: "var(--df-glow-lima)" }}
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
    </article>
  );
}
