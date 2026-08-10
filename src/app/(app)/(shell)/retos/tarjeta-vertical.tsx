import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { CajaVideo } from "@/components/ui/caja-video";
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
 * TARJETA del muro del Inicio (brief v2) — un Challenge con su Submission representativo (el vídeo).
 * Placeholder de vídeo SOBRIO en la CAJA de formato cerrado (16:9 en escritorio, 9:16 en móvil, con
 * blurred-fill vía `CajaVideo`; Bunny monta el player real), con la categoria arriba, los votos
 * (agregado del reto), y el MARCADOR (firma: premio en lima + cuenta atras) abajo. En el tile estrecho
 * de móvil el marcador APILA premio/plazo (`apilarEnMovil`) para no recortar; en lg va en 1 línea.
 * Debajo, titulo + "Participar" (secundario, nunca magenta).
 *
 * v2: tarjeta GLASS + sombra suave (`--df-shadow-md`), realce en hover (`--df-glow-hover`) y brillo
 * `df-sheen` sobre el vídeo. `deadlineMs` puede ser null mientras el cliente calcula los plazos.
 */
export function TarjetaVertical({
  reto,
  deadlineMs,
}: {
  reto: RetoSemilla;
  deadlineMs: number | null;
}) {
  const href = `/retos/${reto.id}`;
  return (
    <article className="flex flex-col overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-1 hover:shadow-[var(--df-glow-hover)]">
      {/* Vídeo: 16:9 en escritorio / 9:16 en móvil (regla cerrada) con blurred-fill. */}
      <Link href={href} aria-label={reto.titulo} className="block">
        <CajaVideo
          className="df-sheen"
          overlays={
            <>
              <span className="pointer-events-none absolute top-2.5 left-2.5 z-10">
                <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
              </span>
              <span className="pointer-events-none absolute top-2.5 right-2.5 z-10 rounded-full border border-line bg-void/60 px-2.5 py-1 text-2xs tabular-nums text-text">
                {reto.votos.toLocaleString("en-US")} votos
              </span>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block border-t border-line bg-void/60 px-2.5 py-2">
                <Marcador
                  cents={reto.premioCents}
                  deadlineMs={deadlineMs}
                  tamano="lista"
                  apilarEnMovil
                />
              </span>
            </>
          }
        >
          <IconoPlay />
        </CajaVideo>
      </Link>

      <div className="flex items-center justify-between gap-3 p-3">
        <h3 className="line-clamp-2 min-w-0 text-sm leading-snug font-medium">
          <Link href={href} className="rounded-xs text-text hover:text-text-dim">
            {reto.titulo}
          </Link>
        </h3>
        <Boton variante="secundario" className="shrink-0 px-4 text-xs">
          Participar
        </Boton>
      </div>
    </article>
  );
}
