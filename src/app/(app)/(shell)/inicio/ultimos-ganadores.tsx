import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Imagen3d } from "@/components/ui/imagen-3d";
import { NombreUsuario } from "@/components/ui/identidad-usuario";
import { centimosAImporte } from "@/lib/dinero";
import type { Tema } from "@/lib/tema";
import type { GanadorPortada } from "@/server/services/portada";

/**
 * «ÚLTIMOS GANADORES» (rediseño de /inicio): los puestos 1 REALES más recientes y lo que cobraron
 * (`ganadoresPortada`: solo personas visibles, solo retos no ocultos). Es la prueba de que aquí se gana
 * de verdad, y no se rellena: sin ningún ganador todavía, la portada NO pinta el bloque.
 *
 * El trofeo va con el oro del podio (`--df-rank`); el premio, en `--df-money` —dinero y solo dinero—,
 * y los dos no se tocan (MARCA.md §4: el dinero y el podio son dos dorados distintos a propósito).
 */
export function UltimosGanadores({ ganadores, tema }: { ganadores: GanadorPortada[]; tema: Tema }) {
  if (ganadores.length === 0) return null;
  return (
    <section aria-labelledby="ultimos-ganadores">
      <div className="flex items-center gap-3">
        <Imagen3d pieza="trofeo" tema={tema} tamano={56} className="df-glow-podio w-12 lg:w-14" />
        <h2 id="ultimos-ganadores" className="text-xl font-semibold text-text lg:text-2xl">
          Últimos ganadores
        </h2>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ganadores.map((g) => (
          <li
            key={`${g.userId}-${g.cuandoMs}`}
            className="flex items-center gap-3 rounded-sm border border-line bg-surface/60 p-3 backdrop-blur-md"
          >
            <Link href={`/u/${g.username}`} className="shrink-0" aria-hidden tabIndex={-1}>
              <Avatar nombre={g.username} imagen={g.image} tamano="sm" perezosa puntos={g.puntos} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/u/${g.username}`} className="block min-w-0 hover:underline">
                <NombreUsuario
                  username={g.username}
                  displayName={g.displayName}
                  esVip={g.esVip}
                  colorNombre={g.colorNombre}
                  clase="block truncate text-sm font-semibold"
                />
              </Link>
              <p className="truncate text-2xs text-text-dim">
                ganó{" "}
                <Link href={g.retoHref} className="text-text hover:underline">
                  {g.retoTitulo}
                </Link>
              </p>
            </div>
            <p
              className="shrink-0 text-base text-money tabular-nums"
              style={{ fontFamily: "var(--font-display)", fontVariationSettings: '"wght" 780' }}
            >
              {centimosAImporte(g.premioCents)} {g.moneda}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
