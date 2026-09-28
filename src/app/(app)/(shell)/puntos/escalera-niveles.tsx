import { EmblemaDeNivel } from "@/components/ui/emblema-nivel";
import { NIVELES, nivelPorPuntos } from "@/lib/niveles";

/**
 * LA ESCALERA — los cinco niveles y el umbral de cada uno, con el tuyo marcado.
 *
 * ES LA PANTALLA COMPLETA DEL SISTEMA, y por eso están los cinco siempre: enseñar solo el siguiente
 * respondería "qué toca ahora" pero no "hasta dónde llega esto", que es justo lo que se viene a mirar.
 *
 * TRES ESTADOS Y NO DOS: conseguido, el actual, y los que quedan. Los que quedan van apagados porque
 * todavía no son tuyos; los conseguidos NO —los ganaste, y borrarlos de la vista sería quitarte lo
 * andado—. Lo que los distingue del actual es el marcado, no el tono.
 *
 * Los umbrales salen de `NIVELES`: mover uno mueve esta lista sin tocar este fichero.
 */
export function EscaleraNiveles({ puntos }: { puntos: number }) {
  const actual = nivelPorPuntos(puntos);

  return (
    <section aria-labelledby="escalera">
      <h2 id="escalera" className="text-sm font-semibold tracking-widest text-text-dim uppercase">
        Los cinco niveles
      </h2>
      <ol className="mt-4 divide-y divide-line rounded-sm border border-line bg-surface">
        {NIVELES.map((n) => {
          const esActual = n.clave === actual.clave;
          const conseguido = puntos >= n.minimo;
          return (
            <li
              key={n.clave}
              data-nivel={n.clave}
              data-estado={esActual ? "actual" : conseguido ? "conseguido" : "pendiente"}
              aria-current={esActual ? "step" : undefined}
              className={`flex items-center gap-3 p-4 ${esActual ? "bg-raised" : ""} ${
                conseguido ? "" : "opacity-60"
              }`}
            >
              {/* El emblema del nivel, en su color. Rookie no tiene: en su sitio va un punto neutro,
                  del mismo tamaño, para que la columna no se descuadre. */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                {n.emblema ? (
                  <EmblemaDeNivel nivel={n} clase="h-6 w-6" />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-text-dim" aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm ${esActual ? "font-semibold text-text" : "text-text"}`}
                >
                  {n.nombre}
                </span>
                <span className="block text-2xs text-text-dim">
                  {n.minimo === 0
                    ? "Desde el primer día"
                    : `Desde ${n.minimo.toLocaleString("es-ES")} puntos`}
                </span>
              </span>
              {esActual ? (
                <span className="shrink-0 rounded-xs border border-line px-2 py-0.5 text-2xs tracking-wide text-text uppercase">
                  Estás aquí
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
