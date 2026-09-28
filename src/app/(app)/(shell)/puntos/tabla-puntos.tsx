import { ACCIONES_PUNTOS } from "@/config/constants";

/**
 * CÓMO GANAR PUNTOS — la tabla entera, con el estado de cada fila.
 *
 * LO QUE TODAVÍA NO PAGA SE DICE, NO SE OFRECE. Una fila "Próximamente" va atenuada y con su
 * etiqueta, y su importe se pinta igual de atenuado: se anticipa lo que vendrá sin que parezca que
 * se puede cobrar hoy. Nada de un botón, ni de un "gana +X ahora" al lado de algo que no otorga —
 * eso sería una promesa, y una promesa que no se cumple se paga en confianza.
 *
 * EL ESTADO NO SE ESCRIBE AQUÍ: sale de `ACCIONES_PUNTOS` (config), y un test contrasta esa config
 * contra lo que de verdad otorga `server/services`. Así el día que se cablee la racha, la fila pasa
 * sola a ACTIVA sin que nadie tenga que acordarse de esta pantalla.
 *
 * Y los importes salen de `POINTS`, nunca escritos en el JSX: un número a mano aquí sería un segundo
 * catálogo esperando a discrepar del que se paga.
 */
export function TablaPuntos() {
  const activas = ACCIONES_PUNTOS.filter((a) => a.activa);
  const proximas = ACCIONES_PUNTOS.filter((a) => !a.activa);

  return (
    <section aria-labelledby="como-ganar">
      <h2 id="como-ganar" className="text-sm font-semibold tracking-widest text-text-dim uppercase">
        Cómo ganar puntos
      </h2>

      <ul className="mt-4 divide-y divide-line rounded-sm border border-line bg-surface">
        {activas.map((a) => (
          <li
            key={a.razon}
            data-accion={a.razon}
            data-estado="activa"
            className="flex items-center gap-3 p-4"
          >
            <span className="min-w-0 flex-1 text-sm text-text">{a.etiqueta}</span>
            <span className="shrink-0 text-sm font-semibold text-text tabular-nums">
              +{a.puntos}
            </span>
          </li>
        ))}

        {proximas.map((a) => (
          <li
            key={a.razon}
            data-accion={a.razon}
            data-estado="proximamente"
            /* Atenuada ENTERA, importe incluido: si el número se viera igual que el de las activas,
               la etiqueta de "próximamente" sería letra pequeña al lado de una oferta. */
            className="flex flex-wrap items-center gap-3 p-4 text-text-dim"
          >
            <span className="min-w-0 flex-1 text-sm">
              {a.etiqueta}
              {a.nota ? <span className="mt-0.5 block text-2xs">{a.nota}</span> : null}
            </span>
            {/* "Fase 6" dice CUÁNDO; "Próximamente" solo dice que no es hoy. Se enseña la fase
                cuando está decidida, y el genérico cuando no — antes que inventarse una, que el
                usuario leería como un compromiso. */}
            <span className="shrink-0 rounded-xs border border-line px-2 py-0.5 text-2xs tracking-wide uppercase">
              {a.fase ? `Fase ${a.fase}` : "Próximamente"}
            </span>
            <span className="shrink-0 text-sm tabular-nums">+{a.puntos}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
