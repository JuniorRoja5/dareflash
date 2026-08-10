import { Avatar } from "@/components/ui/avatar";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";

import { PERFILES_BOOST } from "./portada-datos";

/**
 * PERFILES DESTACADOS (Boost) — maqueta de `BoostActivation` (Fase 6): perfiles PAGADOS por posicion
 * (1..5), usuarios DISTINTOS del Top Ranking (el Boost es visibilidad comprada; cualquiera paga por
 * aparecer). Nivel DERIVADO con `InsigniaNivel`. Copy en voz de USUARIO (descubrir + invitar a
 * destacar), no del mecanismo. Tratamiento v2: tarjetas glass + sombra suave; NO compite con el magenta
 * (aqui no hay magenta de accion).
 */
export function BoostDestacados() {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-xl font-semibold text-text">Descúbrelos hoy</h2>
          <span className="text-sm text-text-dim">
            Creadores a los que seguir la pista ahora mismo
          </span>
        </div>
        <a href="/perfil" className="shrink-0 text-sm font-medium text-text-dim hover:text-text">
          Destaca tu perfil →
        </a>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PERFILES_BOOST.map((perfil, i) => (
          <article
            key={perfil.username}
            className="relative flex flex-col items-center gap-2 rounded-sm border border-line bg-surface/60 p-4 text-center shadow-[var(--df-shadow-sm)] backdrop-blur-md transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-glow-hover)]"
          >
            <span
              className="absolute top-2.5 left-3 text-sm font-bold tabular-nums text-text-dim"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {i + 1}
            </span>
            <span className="absolute top-3 right-3 text-2xs tracking-widest text-text-dim uppercase">
              Boost
            </span>
            <Avatar nombre={perfil.username} tamano="lg" />
            <p className="mt-1 max-w-full truncate text-sm font-medium text-text">
              @{perfil.username}
            </p>
            <InsigniaNivel puntos={perfil.puntos} />
          </article>
        ))}
      </div>
    </section>
  );
}
