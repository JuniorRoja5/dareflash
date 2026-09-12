import type { DiaActividad } from "@/lib/serie-diaria";
import type { SerieReto } from "@/server/services/panel-metricas";

/** "3 sept" de un día "YYYY-MM-DD" (UTC: el mismo día que contó la BD, no el de la zona de quien mira). */
function fechaCorta(dia: string): string {
  return new Date(`${dia}T00:00:00Z`).toLocaleDateString("es-ES", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

/**
 * RENDIMIENTO EN EL TIEMPO (Fase 4). Ocupa el sitio de su ranura "próximamente": participaciones y
 * votos de cada día de la ventana del reto, tal cual los da `serieDiariaReto` (aquí no se calcula ni
 * se rellena nada).
 *
 * DOS gráficas pequeñas, una por serie, y no una con las dos: los votos suelen ser un orden de
 * magnitud más que las participaciones, y en una escala común las participaciones serían una raya.
 * NEUTRAS: recuentos en gris, sin lima (dinero) ni oro (podio).
 *
 * Vacíos HONESTOS, y distintos: un reto que aún no ha abierto no tiene ventana que medir; uno abierto
 * sin actividad tiene su ventana medida y vacía. Ninguno se pinta como una gráfica de ceros.
 */
export function RendimientoTiempo({ serie }: { serie: SerieReto }) {
  const hayActividad = serie.total.participaciones + serie.total.votos > 0;
  const primero = serie.dias[0];
  const ultimo = serie.dias[serie.dias.length - 1];

  return (
    <section
      aria-label="Rendimiento en el tiempo"
      className="rounded-sm border border-line bg-surface/60 p-5 shadow-[var(--df-shadow-md)]"
    >
      <h3 className="text-sm font-semibold text-text">Rendimiento en el tiempo</h3>
      <p className="mt-1 text-sm text-text-dim">
        Participaciones y votos de cada día, desde la apertura hasta el cierre (o hasta hoy). Días
        en UTC.
      </p>

      {serie.dias.length === 0 ? (
        <Vacio texto="El reto aún no ha abierto: la serie empieza el día de la apertura." />
      ) : !hayActividad || !primero || !ultimo ? (
        <Vacio texto="Todavía no hay participaciones ni votos en este reto." />
      ) : (
        <>
          <div className="mt-4 space-y-5">
            <Barras titulo="Participaciones" clave="participaciones" serie={serie} />
            <Barras titulo="Votos" clave="votos" serie={serie} />
          </div>
          <p className="mt-2 flex justify-between text-2xs text-text-dim tabular-nums">
            <span>{fechaCorta(primero.dia)}</span>
            {serie.dias.length > 1 ? <span>{fechaCorta(ultimo.dia)}</span> : null}
          </p>
          <p className="mt-3 text-2xs text-text-dim">
            Actividad registrada: incluye lo que después se retiró, así que los votos pueden sumar
            más que la tarjeta «Votos», que cuenta solo las visibles.
          </p>
          <TablaAccesible dias={serie.dias} />
        </>
      )}
    </section>
  );
}

/** Una serie en barras verticales, una por día; la altura es la proporción frente al día máximo. */
function Barras({
  titulo,
  clave,
  serie,
}: {
  titulo: string;
  clave: "participaciones" | "votos";
  serie: SerieReto;
}) {
  const maximo = serie.dias.reduce((m, d) => Math.max(m, d[clave]), 0);
  return (
    <figure aria-hidden>
      <figcaption className="flex items-baseline justify-between gap-3 text-2xs text-text-dim">
        <span className="font-semibold tracking-widest uppercase">{titulo}</span>
        <span className="tabular-nums">
          {serie.total[clave].toLocaleString("es-ES")} en total
          {maximo > 0 ? ` · máx. ${maximo.toLocaleString("es-ES")} en un día` : ""}
        </span>
      </figcaption>
      <div className="mt-2 flex h-20 items-end gap-px border-b border-line">
        {serie.dias.map((d) => (
          <div
            key={d.dia}
            data-serie={clave}
            data-dia={d.dia}
            data-valor={d[clave]}
            title={`${fechaCorta(d.dia)}: ${d[clave].toLocaleString("es-ES")}`}
            className="min-w-0 flex-1 rounded-t-[1px] bg-text-dim/60"
            style={{ height: `${altura(d[clave], maximo)}%` }}
          />
        ))}
      </div>
    </figure>
  );
}

/**
 * Altura en % frente al máximo. Un día CON actividad nunca sale a 0 aunque sea mínimo al lado del
 * máximo (redondear lo borraría y parecería un día sin nada): se le deja una raya visible.
 */
function altura(valor: number, maximo: number): number {
  if (valor <= 0 || maximo <= 0) return 0;
  return Math.max(Math.round((valor / maximo) * 100), 3);
}

/** Los mismos números en tabla, para lectores de pantalla: las barras son solo visuales. */
function TablaAccesible({ dias }: { dias: readonly DiaActividad[] }) {
  return (
    <table className="sr-only">
      <caption>Participaciones y votos por día (UTC)</caption>
      <thead>
        <tr>
          <th scope="col">Día</th>
          <th scope="col">Participaciones</th>
          <th scope="col">Votos</th>
        </tr>
      </thead>
      <tbody>
        {dias.map((d) => (
          <tr key={d.dia}>
            <th scope="row">{d.dia}</th>
            <td>{d.participaciones}</td>
            <td>{d.votos}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="mt-4 grid h-32 place-items-center rounded-sm border border-line/60 bg-void/20 px-4 text-center text-sm text-text-dim">
      {texto}
    </p>
  );
}
