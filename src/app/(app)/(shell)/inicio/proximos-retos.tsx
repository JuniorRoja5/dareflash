import type { Idioma } from "@/lib/formato";
import Link from "next/link";

import type { RetoPublicoVista } from "@/server/services/retos-publico";

import { TarjetaReto } from "../retos/tarjeta-reto";

/**
 * «PRÓXIMOS RETOS» (rediseño de /inicio): los que abren pronto (`proximosPortada`), con la MISMA tarjeta
 * que la lista de /retos —su chapa de «Próximamente» y la cuenta atrás a la APERTURA, no al cierre—.
 * Es el bloque que más llena la portada cuando hay pocos abiertos, y la anticipación es parte del
 * producto. Sin ninguno, no se pinta (no hay nada que anunciar).
 */
export function ProximosRetos({ retos, idioma }: { retos: RetoPublicoVista[]; idioma: Idioma }) {
  if (retos.length === 0) return null;
  return (
    <section aria-labelledby="proximos-retos">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="proximos-retos" className="text-xl font-semibold text-text lg:text-2xl">
          Próximos retos
        </h2>
        <Link href="/retos" className="shrink-0 text-sm font-medium text-text-dim hover:text-text">
          Ver todos →
        </Link>
      </div>
      {/* DOS COLUMNAS en móvil, como la lista de /retos (`feed-retos`): la tarjeta está pensada para
          eso. En una sola columna cada tarjeta ocupaba una pantalla entera. */}
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {retos.map((r) => (
          <li key={r.publicCode} className="min-w-0">
            <TarjetaReto reto={r} idioma={idioma} />
          </li>
        ))}
      </ul>
    </section>
  );
}
