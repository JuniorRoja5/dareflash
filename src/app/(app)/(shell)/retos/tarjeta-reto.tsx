import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";

import { nombreCategoria, type RetoSemilla } from "./retos-datos";

/** Triangulo de "play" del placeholder de video (SVG inline; nada de emojis como iconos). */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-text-dim" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/**
 * TARJETA DE RETO — ADAPTATIVA (brief v2 + regla de dispositivo). UNA sola tarjeta que REFLOWA por
 * ancho, sin duplicar DOM ni ocultar-una-por-breakpoint:
 *   - Movil (<lg): `flex-col` → miniatura VERTICAL 9:16 arriba, cuerpo debajo (rejilla de 2 tiles).
 *   - Escritorio (lg): `flex-row` → miniatura APAISADA 16:9 a la izquierda (~2/5), cuerpo a la derecha.
 *
 * EL MARCADOR (firma: premio en lima + cuenta atras) es UN SOLO nodo, SUPERPUESTO al pie de la
 * miniatura (como el muro de verticales del Inicio): asi se ve SIEMPRE dentro del viewport en movil
 * (no cae bajo el fold como caeria en el cuerpo de un tile 9:16 a pantalla completa) y sigue sobre la
 * miniatura al reflowar a apaisada. Va a tamaño "lista" para caber en el tile estrecho de 2 columnas;
 * el halo lima (`--df-glow-lima`) lo realza como firma aunque sea compacto.
 *
 * v2 (piel, no estructura): superficie GLASS + sombra suave (`--df-shadow-md`), realce en hover
 * (`--df-glow-hover`), brillo `df-sheen` sobre la miniatura.
 *
 * A11Y: sin interactivos anidados. Miniatura (oculta a lectores) y titulo enlazan a /retos/[id];
 * "Participar" es accion aparte, secundaria, NUNCA magenta (el magenta de la pantalla es "Crear reto"
 * del cromo). `deadlineMs` puede ser null mientras el feed calcula los plazos en cliente.
 */
export function TarjetaReto({
  reto,
  deadlineMs,
}: {
  reto: RetoSemilla;
  deadlineMs: number | null;
}) {
  const href = `/retos/${reto.id}`;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-1 hover:shadow-[var(--df-glow-hover)] lg:flex-row">
      {/* Miniatura = placeholder de video. Vertical 9:16 en movil; apaisada 16:9 (~2/5) en lg.
          Un solo nodo que cambia de aspecto/ancho: no hay dos miniaturas. */}
      <Link
        href={href}
        aria-hidden
        tabIndex={-1}
        className="df-sheen relative block aspect-[9/16] shrink-0 bg-raised lg:aspect-video lg:w-[44%]"
      >
        <span className="pointer-events-none absolute top-2.5 left-2.5 z-10">
          <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
        </span>
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <IconoPlay />
          <span className="line-clamp-1 px-3 text-center text-2xs text-text-dim">
            {reto.miniaturaPlaceholder}
          </span>
        </span>
        {/* MARCADOR — firma, superpuesto abajo (siempre visible). Halo lima. */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block border-t border-line bg-void/70 px-2.5 py-2"
          style={{ filter: "var(--df-glow-lima)" }}
        >
          <Marcador cents={reto.premioCents} deadlineMs={deadlineMs} tamano="lista" apilarEnMovil />
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 lg:p-4">
        {/* Titulo (enlace accesible al reto). */}
        <h2 className="min-w-0">
          <Link
            href={href}
            className="line-clamp-2 rounded-xs leading-snug font-semibold text-text hover:text-text-dim"
          >
            {reto.titulo}
          </Link>
        </h2>

        {/* Participar (secundario, NUNCA magenta), anclado abajo. */}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Boton variante="secundario" className="ml-auto px-4">
            Participar
          </Boton>
        </div>
      </div>
    </article>
  );
}
