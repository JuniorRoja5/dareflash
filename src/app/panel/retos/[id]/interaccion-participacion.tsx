import { nombreMostrado } from "@/lib/identidad";
import type { InteraccionParticipacion } from "@/server/services/panel-metricas";

/**
 * INTERACCIÓN POR PARTICIPACIÓN (Fase 3). Ocupa el hueco que tenía su tarjeta "próximamente" en la
 * rejilla de estadísticas: cada fila es una participación VISIBLE con sus votos, de más a menos, tal
 * cual las da `interaccionPorParticipacion` (esta vista no calcula ni rellena nada).
 *
 * NEUTRA: son recuentos, no dinero ni podio — ni lima ni oro. La barra es la proporción frente a la
 * más votada, en gris, para leer la distribución de un vistazo.
 *
 * Sin participaciones visibles, un vacío HONESTO que dice qué pasa: ni un 0 (se leería como "se midió
 * y salió cero") ni una raya de "próximamente" (el dato ya existe; lo que no hay son participaciones).
 */
export function TarjetaInteraccion({
  filas,
  visibles,
}: {
  filas: readonly InteraccionParticipacion[];
  /** Cuántas visibles hay en total (`metricasReto`): dice si la lista enseña solo las más votadas. */
  visibles: number;
}) {
  const maximo = filas.reduce((m, f) => Math.max(m, f.votos), 0);

  return (
    <section
      aria-label="Interacción por participación"
      className="rounded-sm border border-line bg-surface/60 p-5 shadow-[var(--df-shadow-md)] sm:col-span-2"
    >
      <h3 className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
        Interacción por participación
      </h3>
      <p className="mt-1 text-2xs text-text-dim">Votos de cada participación visible</p>

      {filas.length === 0 ? (
        <p className="mt-4 text-sm text-text-dim">
          Aún no hay participaciones visibles. Cuando las haya, aquí verás los votos de cada una.
        </p>
      ) : (
        <>
          <ol className="mt-4 space-y-3">
            {filas.map((f) => (
              <li key={f.submissionId}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-text">
                    {f.titulo?.trim() ? f.titulo : "Sin título"}
                    <span className="text-text-dim">
                      {" · "}
                      {nombreMostrado(f.displayName, f.username)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-text">
                    {f.votos.toLocaleString("es-ES")}{" "}
                    <span className="font-normal text-text-dim">
                      {f.votos === 1 ? "voto" : "votos"}
                    </span>
                  </span>
                </div>
                <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                  <div
                    data-barra
                    className="h-full rounded-full bg-text-dim/60"
                    style={{ width: `${maximo > 0 ? Math.round((f.votos / maximo) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
          {visibles > filas.length ? (
            <p className="mt-4 text-2xs text-text-dim">
              Las {filas.length} más votadas de {visibles} visibles. Todas, en la tabla de
              participaciones.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
