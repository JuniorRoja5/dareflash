import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { CajaVideo } from "@/components/ui/caja-video";
import { Inclinable } from "@/components/ui/inclinable";
import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";
import type { RetoPublicoVista } from "@/server/services/retos-publico";

import { ChapaExclusivo } from "./chapa-exclusivo";
import { MarcaSponsor } from "./marca-sponsor";
import { nombreCategoria } from "./retos-datos";

/** Triangulo de "play" del placeholder (SVG inline; nada de emojis como iconos). */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-text-dim" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/**
 * TARJETA del muro de la portada (brief v2) — un reto ABIERTO real (`RetoPublicoVista`, la misma vista
 * que la lista de retos). Hasta P14 pintaba la maqueta (`RetoSemilla`: retos, votos y plazos
 * inventados); ahora sale de `rejillaPortada`.
 *
 * La CAJA de formato cerrado (16:9 en escritorio, 9:16 en móvil, con blurred-fill vía `CajaVideo`) con
 * su PORTADA si la hay (o el placeholder sobrio), la categoría y la chapa de exclusivo arriba, y abajo el
 * MARCADOR (premio en --df-money + cuenta atrás al cierre) con la marca si es patrocinado —dentro de la
 * barra, como en `TarjetaReto`, para que no se monten—. Debajo, el título y «Participar» (secundario,
 * nunca el acento), que lleva al reto.
 *
 * Solo retos ABIERTOS: la portada no enseña ni próximos ni cerrados, así que la cuenta va al cierre. El
 * plazo viaja ABSOLUTO (`deadlineMs`): el marcador cuenta en el cliente, sin `Date.now()` en el render.
 */
export function TarjetaVertical({ reto }: { reto: RetoPublicoVista }) {
  const href = `/retos/${reto.publicCode}-${reto.slug}`;
  return (
    // PROFUNDIDAD SUTIL (rediseño de /inicio): inclinación hacia el puntero y brillo que lo sigue
    // (`Inclinable`, solo con puntero fino), y al pasar SUBE LA LUMINOSIDAD (`raised`) con el glow de la
    // acción. Sin sombra para dar profundidad (MARCA.md: la profundidad es luminosidad).
    <Inclinable className="h-full rounded-sm">
      <article className="flex h-full flex-col overflow-hidden rounded-sm border border-line bg-surface/60 backdrop-blur-md transition-[background-color,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised/80 hover:shadow-[var(--df-glow-hover)]">
        <Link href={href} aria-label={reto.titulo} className="block">
          {/* Sin el barrido `df-sheen`: en la portada había una docena a la vez (y anima
              `background-position` en bucle). El brillo que sigue al puntero (`Inclinable`) hace ese
              papel, y solo al pasar. */}
          <CajaVideo
            // La PORTADA cubre la caja entera (es el relleno), no la tira 9:16 del centro: una portada
            // suele ser apaisada, y metida en la tira se vería recortada a una columna.
            relleno={
              reto.coverImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- estático servido por Caddy en /portadas/*
                <img
                  src={reto.coverImage}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : undefined
            }
            overlays={
              <>
                <span className="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex flex-wrap items-start justify-between gap-1.5">
                  <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
                  {reto.soloVip ? <ChapaExclusivo compacta /> : null}
                </span>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block border-t border-line bg-void/70 px-2.5 py-2">
                  {reto.sponsor ? (
                    <span className="mb-1.5 flex min-w-0">
                      <MarcaSponsor sponsor={reto.sponsor} compacta />
                    </span>
                  ) : null}
                  <span className="block" style={{ filter: "var(--df-glow-dinero)" }}>
                    <Marcador
                      cents={reto.premioCents}
                      deadlineMs={reto.deadlineMs}
                      tamano="lista"
                      apilarEnMovil
                    />
                  </span>
                </span>
              </>
            }
          >
            {reto.coverImage ? null : <IconoPlay />}
          </CajaVideo>
        </Link>

        {/* En móvil la rejilla va a dos columnas (~170 px): título y botón en fila dejaban el título en
          «Reto de…». Apilados, el título tiene el ancho entero; desde `sm`, en fila. */}
        <div className="flex flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <h3 className="line-clamp-2 min-w-0 text-sm leading-snug font-medium">
            <Link href={href} className="rounded-xs text-text hover:text-text-dim">
              {reto.titulo}
            </Link>
          </h3>
          <Boton href={href} variante="secundario" className="shrink-0 px-4 text-xs">
            Participar
          </Boton>
        </div>
      </article>
    </Inclinable>
  );
}
