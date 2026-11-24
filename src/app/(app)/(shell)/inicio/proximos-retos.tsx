import type { Idioma } from "@/lib/formato";
import { Enlace } from "@/components/enlace";

import type { RetoPublicoVista } from "@/server/services/retos-publico";
import { textos } from "@/textos/servidor";

import { ESPACIOS_TARJETA_RETO, TarjetaReto } from "../retos/tarjeta-reto";
import { textosClienteDeLaPeticion } from "@/textos/servidor";

/**
 * «PRÓXIMOS RETOS» (rediseño de /inicio): los que abren pronto (`proximosPortada`), con la MISMA tarjeta
 * que la lista de /retos —su chapa de «Próximamente» y la cuenta atrás a la APERTURA, no al cierre—.
 * Es el bloque que más llena la portada cuando hay pocos abiertos, y la anticipación es parte del
 * producto. Sin ninguno, no se pinta (no hay nada que anunciar).
 */
export async function ProximosRetos({
  retos,
  idioma,
}: {
  retos: RetoPublicoVista[];
  idioma: Idioma;
}) {
  if (retos.length === 0) return null;
  const [t, textosTarjeta] = await Promise.all([
    textos("inicio"),
    textosClienteDeLaPeticion(ESPACIOS_TARJETA_RETO),
  ]);
  return (
    <section aria-labelledby="proximos-retos">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="proximos-retos" className="text-xl font-semibold text-text lg:text-2xl">
          {t("proximosTitulo")}
        </h2>
        <Enlace
          href="/retos"
          className="shrink-0 text-sm font-medium text-text-dim hover:text-text"
        >
          {t("verTodos")}
        </Enlace>
      </div>
      {/* DOS COLUMNAS en móvil, como la lista de /retos (`feed-retos`): la tarjeta está pensada para
          eso. En una sola columna cada tarjeta ocupaba una pantalla entera. */}
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {retos.map((r) => (
          <li key={r.publicCode} className="min-w-0">
            <TarjetaReto reto={r} idioma={idioma} textos={textosTarjeta} />
          </li>
        ))}
      </ul>
    </section>
  );
}
