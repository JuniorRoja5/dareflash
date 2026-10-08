import Link from "next/link";

import { TarjetaDestacado } from "@/components/ui/tarjeta-destacado";
import type { PerfilDestacado } from "@/server/services/boost-destacados";

/**
 * PERFILES DESTACADOS (Boost) — la FILA de la portada, con datos reales.
 *
 * ┌─ AQUÍ HABÍA UNA MAQUETA, Y ESTABA EN PRODUCCIÓN ───────────────────────────────────────────────┐
 * │ `PERFILES_BOOST` de `portada-datos.ts`: cinco usuarios inventados (`sara_p`, `nico_skate`…)   │
 * │ con puntos inventados, pintados en la portada a todo el que entraba. Se fue con la activación, │
 * │ y `sin-datos-maqueta` impide que vuelva por su nombre.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CINCO Y UN "VER TODOS". La fila es un escaparate, no la lista: quien quiera verlos todos va a
 * /destacados. En móvil ese enlace es además la ÚNICA entrada a la sección (la barra inferior está
 * llena, ver `NAV_MOVIL`), así que no es un adorno de escritorio.
 *
 * EL ORDEN LO DECIDE QUIÉN ACTIVÓ ANTES: el último en destacar entra arriba y empuja al resto hacia
 * abajo (lo resuelve la consulta, ver `destacadosVigentes`). Es lo que hace que pagar ahora se note
 * ahora. Y una persona, una plaza: aparecer dos veces sería acaparar la fila.
 *
 * VACÍO HONESTO. Si no hay nadie destacado no se rellena con gente: se invita a destacar. Rellenar
 * un hueco con usuarios de ejemplo es exactamente lo que había antes, y mentía a todo el mundo.
 *
 * Son usuarios DISTINTOS del Top Ranking por naturaleza: el Boost es visibilidad comprada, el
 * ranking se gana. Y aquí NO hay magenta: el único de la portada es el CTA del hero.
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
        {/* DOS ENLACES CON TRABAJOS DISTINTOS: "ver todos" lleva a la lista (y es la puerta de móvil
            a la sección); "destaca tu perfil" lleva a comprar. Juntar los dos en uno obligaría a
            elegir entre mirar y pagar. */}
        <div className="flex shrink-0 flex-wrap items-baseline gap-x-4">
          {perfiles.length > 0 ? (
            <Link href="/destacados" className="text-sm font-medium text-text-dim hover:text-text">
              Ver todos →
            </Link>
          ) : null}
          <Link href="/boosts" className="text-sm font-medium text-text-dim hover:text-text">
            Destaca tu perfil →
          </Link>
        </div>
      </div>

      {perfiles.length === 0 ? (
        <p className="mt-4 rounded-sm border border-line bg-surface/40 p-6 text-center text-sm text-text-dim">
          Ahora mismo no hay ningún perfil destacado. Puedes ser el primero.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {perfiles.map((perfil, i) => (
            <TarjetaDestacado
              key={perfil.activacionId}
              username={perfil.username}
              displayName={perfil.displayName}
              imagen={perfil.imagen}
              puntos={perfil.puntos}
              posicion={i + 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}
