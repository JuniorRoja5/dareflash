import Link from "next/link";

import { CATEGORIES } from "@/config/constants";
import { categoriasDeLaPortada } from "@/lib/portada";

/**
 * LAS CATEGORÍAS (rediseño de /inicio): las catorce, como PUERTAS a `/retos?categoria=` (el mismo filtro
 * que preseleccionan los chips de /buscar). Cada una lleva cuántos retos tiene ABIERTOS solo si tiene
 * alguno —un «0» al lado de cada vacía haría la portada más pobre, no más honesta— y las que tienen van
 * primero (`categoriasDeLaPortada`). El recuento, en neutro: es un recuento, no dinero.
 *
 * Sin emojis: el catálogo los trae, pero un emoji no es un icono (cambia según el sistema, no hereda el
 * color, y el lector de pantalla lo lee en voz alta). Chips de una sola línea, que bajan enteras.
 */
export function CategoriasPortada({ porCategoria }: { porCategoria: Record<string, number> }) {
  const categorias = categoriasDeLaPortada(CATEGORIES, porCategoria);
  return (
    <section aria-labelledby="categorias-portada">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="categorias-portada" className="text-xl font-semibold text-text lg:text-2xl">
          Categorías
        </h2>
        <Link href="/retos" className="shrink-0 text-sm font-medium text-text-dim hover:text-text">
          Ver todos los retos →
        </Link>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {categorias.map((c) => (
          <li key={c.key}>
            <Link
              href={`/retos?categoria=${c.key}`}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised ${
                c.abiertos > 0
                  ? "border-line bg-surface/70 text-text"
                  : "border-line/60 bg-transparent text-text-dim"
              }`}
            >
              {c.es}
              {c.abiertos > 0 ? (
                <span className="rounded-full bg-raised px-2 py-0.5 text-2xs font-semibold tabular-nums text-text">
                  {c.abiertos}
                  <span className="sr-only"> {c.abiertos === 1 ? "abierto" : "abiertos"}</span>
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
