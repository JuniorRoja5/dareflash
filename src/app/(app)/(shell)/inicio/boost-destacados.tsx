import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";
import { nombreMostrado } from "@/lib/identidad";
import type { PerfilDestacado } from "@/server/services/boost-destacados";

/**
 * PERFILES DESTACADOS (Boost) — perfiles PAGADOS, con datos REALES.
 *
 * ┌─ AQUÍ HABÍA UNA MAQUETA, Y ESTABA EN PRODUCCIÓN ───────────────────────────────────────────────┐
 * │ `PERFILES_BOOST` de `portada-datos.ts`: cinco usuarios inventados (`sara_p`, `nico_skate`…)   │
 * │ con puntos inventados, pintados en la portada a todo el que entraba. Se fue con esta pieza, y │
 * │ `sin-datos-maqueta` impide que vuelva por su nombre.                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ORDEN LO DECIDE QUIÉN ACTIVÓ ANTES: el último en destacar entra arriba y empuja al resto hacia
 * abajo (lo resuelve la consulta, ver `destacadosVigentes`). Es lo que hace que pagar ahora se note
 * ahora. La POSICIÓN que se pinta es el sitio en la fila, no un dato guardado: nadie compra "el
 * puesto 1".
 *
 * VACÍO HONESTO. Si no hay nadie destacado no se rellena con gente: se invita a destacar. Rellenar
 * un hueco con usuarios de ejemplo es exactamente lo que había antes, y mentía a todo el mundo.
 *
 * ENLACE A /boosts. Antes apuntaba a /perfil, que no tiene nada que ver con destacar.
 *
 * Son usuarios DISTINTOS del Top Ranking por naturaleza: el Boost es visibilidad comprada, el
 * ranking se gana. Nivel DERIVADO de los puntos con `InsigniaNivel`, como en todo el producto. Y
 * aquí NO hay magenta: el único de la portada es el CTA del hero.
 */
export function BoostDestacados({ perfiles }: { perfiles: PerfilDestacado[] }) {
  return (
    <section aria-labelledby="destacados">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="destacados" className="text-xl font-semibold text-text">
            Descúbrelos hoy
          </h2>
          <span className="text-sm text-text-dim">
            Creadores a los que seguir la pista ahora mismo
          </span>
        </div>
        <Link href="/boosts" className="shrink-0 text-sm font-medium text-text-dim hover:text-text">
          Destaca tu perfil →
        </Link>
      </div>

      {perfiles.length === 0 ? (
        <p className="mt-4 rounded-sm border border-line bg-surface/40 p-6 text-center text-sm text-text-dim">
          Ahora mismo no hay ningún perfil destacado. Puedes ser el primero.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {perfiles.map((perfil, i) => (
            <Link
              key={perfil.activacionId}
              href={`/u/${perfil.username}`}
              data-destacado={perfil.username}
              className="relative flex flex-col items-center gap-2 rounded-sm border border-line bg-surface/60 p-4 text-center shadow-[var(--df-shadow-sm)] backdrop-blur-md transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-glow-hover)]"
            >
              {/* El glow del acento al pasar por encima SÍ está ganado aquí: la tarjeta lleva a
                  alguna parte (al perfil), que es la condición que pide el sistema. */}
              <span
                className="absolute top-2.5 left-3 text-sm font-bold tabular-nums text-text-dim"
                style={{ fontFamily: "var(--font-display)" }}
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="absolute top-3 right-3 text-2xs tracking-widest text-text-dim uppercase">
                Boost
              </span>
              <Avatar
                nombre={perfil.username}
                imagen={perfil.imagen}
                tamano="lg"
                perezosa
                puntos={perfil.puntos}
              />
              <p className="mt-1 max-w-full truncate text-sm font-medium text-text">
                {nombreMostrado(perfil.displayName, perfil.username)}
              </p>
              <InsigniaNivel puntos={perfil.puntos} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
