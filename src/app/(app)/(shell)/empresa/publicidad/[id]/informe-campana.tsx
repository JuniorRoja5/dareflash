import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { Tarjeta } from "@/components/ui/tarjeta";
import { PUBLICIDAD_METRICAS_CADENCIA_MS } from "@/config/constants";
import type { Paginacion } from "@/lib/paginacion-pila";
import { clicsPorCienVistas } from "@/lib/publicidad";
import type { InformeDeCampana } from "@/server/services/publicidad-metricas";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const DIA = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } as const;
const MINUTOS = Math.round(PUBLICIDAD_METRICAS_CADENCIA_MS / 60_000);

const cifra = (n: number) => n.toLocaleString("es-ES");
const porCien = (vistas: number, clics: number) => {
  const p = clicsPorCienVistas(vistas, clics);
  // Siempre con su decimal («2,0», no «2»): en una columna de cifras, uno sin decimal parece de otra cosa.
  return p === null
    ? "—"
    : p.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("es-ES", DIA);

/**
 * LOS RESULTADOS DE UNA CAMPAÑA (Fase 9 · P10): los totales y el desglose por día, del más reciente al
 * más antiguo, paginado por KEYSET (nunca OFFSET). Server Component: las cifras y las fechas se escriben
 * en el servidor (el `Intl` del navegador no siempre coincide y rompería la hidratación).
 *
 * TABLA EN ESCRITORIO y filas apiladas en móvil, como el historial de créditos. Qué es cada cifra va
 * escrito al lado.
 *
 * «VECES QUE SE MOSTRÓ», NO «VISTAS» (revisión de P10): la cifra cuenta ENTREGAS en un hueco (se suma en
 * `elegirPieza` al elegir la campaña), no apariciones en pantalla: una página que se carga y no se baja
 * hasta el hueco cuenta igual. «Vistas» prometería más de lo que mide. En el código sigue llamándose
 * `vistas` (la columna, el campo de Redis); lo que cambia es lo que lee la empresa.
 */
export function InformeCampana({
  informe,
  aqui,
  base,
}: {
  informe: InformeDeCampana;
  aqui: Paginacion;
  base: string;
}) {
  const { totales, dias } = informe;
  return (
    <section aria-labelledby="resultados" className="space-y-3">
      <Tarjeta className="p-5 lg:p-6">
        <h2 id="resultados" className="text-base font-semibold text-text">
          Resultados
        </h2>
        <p className="mt-1 max-w-prose text-sm text-text-dim">
          Veces que se mostró: las veces que la pusimos en el feed o en la portada. Clics: las veces
          que alguien la tocó para ir a tu web. Se actualizan cada {MINUTOS} minutos.
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[
            ["Veces que se mostró", cifra(totales.vistas)],
            ["Clics", cifra(totales.clics)],
            ["Clics por cada 100 veces que se mostró", porCien(totales.vistas, totales.clics)],
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-sm border border-line bg-surface p-3">
              <dt className="text-2xs text-text-dim">{etiqueta}</dt>
              <dd className="mt-1 text-xl font-semibold text-text tabular-nums">{valor}</dd>
            </div>
          ))}
        </dl>

        {dias.length === 0 ? (
          <p className="mt-4 max-w-prose text-sm text-text-dim">
            {aqui.cursor
              ? "No hay días más antiguos."
              : "Todavía no hay cifras. Aparecen en cuanto la campaña empieza a mostrarse."}
          </p>
        ) : (
          <>
            <table className="mt-5 hidden w-full border-collapse text-left text-sm md:table">
              <thead className="border-b border-line">
                <tr>
                  <th className={`py-2 pr-4 ${CABECERA}`}>Día</th>
                  <th className={`py-2 pr-4 text-right ${CABECERA}`}>Veces que se mostró</th>
                  <th className={`py-2 pr-4 text-right ${CABECERA}`}>Clics</th>
                  <th className={`py-2 text-right ${CABECERA}`}>Clics por cada 100 veces</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {dias.map((d) => (
                  <tr key={d.dia} data-dia-metricas={d.dia}>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-text-dim tabular-nums">
                      {dia(d.dia)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-text tabular-nums">
                      {cifra(d.vistas)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-text tabular-nums">
                      {cifra(d.clics)}
                    </td>
                    <td className="py-2.5 text-right text-text-dim tabular-nums">
                      {porCien(d.vistas, d.clics)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="mt-4 divide-y divide-line md:hidden">
              {dias.map((d) => (
                <li key={d.dia} className="flex items-baseline justify-between gap-3 py-3">
                  <span className="text-sm text-text-dim tabular-nums">{dia(d.dia)}</span>
                  <span className="text-right text-sm text-text tabular-nums">
                    se mostró {cifra(d.vistas)} {d.vistas === 1 ? "vez" : "veces"} ·{" "}
                    {cifra(d.clics)} {d.clics === 1 ? "clic" : "clics"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Tarjeta>
      {/* Fuera del `if` de la lista: una página posterior vacía no encierra a nadie. */}
      <PasosKeyset base={base} aqui={aqui} proximoCursor={informe.nextCursor} />
    </section>
  );
}
