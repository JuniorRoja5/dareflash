import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { CajaVideo } from "@/components/ui/caja-video";
import { Inclinable } from "@/components/ui/inclinable";
import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";
import type { RetoPortada } from "@/server/services/portada";

import { nombreCategoria } from "../retos/retos-datos";

function IconoPlay() {
  return (
    <span className="grid h-14 w-14 place-items-center rounded-full border border-line bg-void/40">
      <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6 text-text" fill="currentColor" aria-hidden>
        <path d="M9 6.5v11l9-5.5z" />
      </svg>
    </span>
  );
}

const cifra = (n: number) => n.toLocaleString("es-ES");

/**
 * EL RETO DESTACADO DEL HERO (brief v2) — un reto REAL y ABIERTO: el que eligió el admin desde el
 * panel o, si no eligió ninguno (o el suyo ya cerró), el abierto de mayor premio (`retoDestacadoPortada`).
 * Con sus participantes y votos de verdad —hasta P14 eran «247» y la cifra de la maqueta—, su portada si
 * la tiene y el MARCADOR (premio + cuenta atrás al cierre). Enlaza al reto.
 *
 * SIN NINGÚN RETO ABIERTO, el hueco no se rellena con uno falso: dice lo que pasa y lleva a la lista,
 * donde están los próximos y los cerrados.
 *
 * PROFUNDIDAD SUTIL (rediseño de /inicio): con un puntero fino, la tarjeta se inclina hacia el cursor y
 * un brillo lo sigue (`Inclinable`); al pasar, el glow de la acción. Ya NO flota sola (`df-float`): con el
 * rayo y el recuento de las cifras, el hero tendría tres cosas moviéndose. Y la profundidad sale de la
 * LUMINOSIDAD, no de una sombra (MARCA.md).
 *
 * Server Component: el plazo viaja absoluto y el marcador cuenta en el cliente.
 */
export function HeroDestacado({
  destacado,
}: {
  destacado: { reto: RetoPortada; elegido: boolean } | null;
}) {
  if (!destacado) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center justify-center rounded-sm border border-line bg-surface/70 p-8 text-center backdrop-blur-md">
        <p className="text-lg font-semibold text-text">Ahora mismo no hay retos abiertos</p>
        <p className="mt-2 max-w-prose text-sm text-text-dim">
          Los próximos abren pronto. Mientras, puedes ver los que están por llegar y quién ganó los
          últimos.
        </p>
        <Boton href="/retos" variante="secundario" className="mt-5">
          Ver los retos
        </Boton>
      </div>
    );
  }
  const { reto, elegido } = destacado;
  const href = `/retos/${reto.publicCode}-${reto.slug}`;
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10"
        style={{ background: "var(--df-glow-accion)" }}
      />
      <div className="mx-auto w-full max-w-[320px] lg:max-w-[560px]">
        <Inclinable className="rounded-sm transition-[box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:shadow-[var(--df-glow-hover)]">
          <Link href={href} aria-label={`Reto destacado: ${reto.titulo}`} className="block">
            <CajaVideo
              className="rounded-sm border border-line bg-raised"
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
                  <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between gap-2">
                    <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
                    <span className="rounded-full border border-line bg-void/60 px-2.5 py-1 text-2xs font-semibold tracking-wide text-text uppercase">
                      Reto destacado
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 z-10 border-t border-line bg-void/65 px-3 py-3">
                    <h2 className="text-base leading-snug font-semibold text-text">
                      {reto.titulo}
                    </h2>
                    <p className="mt-0.5 text-2xs tabular-nums text-text-dim">
                      {reto.participantes === 0
                        ? "Todavía nadie ha participado: puedes ser el primero"
                        : `${cifra(reto.participantes)} ${reto.participantes === 1 ? "participante" : "participantes"} · ${cifra(reto.votos)} ${reto.votos === 1 ? "voto" : "votos"}`}
                    </p>
                    <div className="mt-2" style={{ filter: "var(--df-glow-dinero)" }}>
                      <Marcador
                        cents={reto.premioCents}
                        deadlineMs={reto.deadlineMs}
                        tamano="tarjeta"
                      />
                    </div>
                  </div>
                </>
              }
            >
              {reto.coverImage ? null : <IconoPlay />}
            </CajaVideo>
          </Link>
        </Inclinable>
        <p className="mt-3 text-center text-sm text-text-dim">
          {elegido ? (
            <>
              Elegido por el <span className="font-medium text-text">equipo de DareFlash</span>
            </>
          ) : (
            <>
              El <span className="font-medium text-text">mayor premio</span> en juego ahora mismo
            </>
          )}
        </p>
      </div>
    </div>
  );
}
