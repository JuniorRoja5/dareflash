import { EmblemaDeNivel } from "@/components/ui/emblema-nivel";
import { TOTAL_TIERS } from "@/lib/niveles";
import { progresoNivel } from "@/lib/progreso-nivel";

/**
 * HERO DE NIVEL — quién eres, en grande.
 *
 * EL MEDALLÓN ES LA PIEZA, y es la única que se permite ser llamativa en toda la pantalla: aro del
 * color de tu nivel, emblema macizo dentro y una flotación lenta. Todo lo demás —métricas, escalera,
 * tabla, historial— va deliberadamente quieto y neutro. Un solo elemento memorable y el resto
 * disciplinado; si flotara también la escalera, no destacaría nada.
 *
 * EL MOVIMIENTO ES `df-float`, una clase del sistema, y no una animación escrita aquí: la regla
 * global de `prefers-reduced-motion` en `globals.css` apaga las animaciones con `!important`, así que
 * quien pide menos movimiento ve el medallón QUIETO sin que esta pantalla tenga que acordarse. Una
 * animación en JS (o un `style` con `animation`) se habría saltado esa red.
 *
 * ROOKIE NO TIENE EMBLEMA a propósito (ver `niveles.ts`: es el estándar, no un logro). En su hueco va
 * el medidor de barras, en neutro: dice "todavía no tienes ninguna" sin inventarle una insignia.
 */
export function HeroNivel({ puntos }: { puntos: number }) {
  const { nivel, siguiente, faltan, porcentaje, esMaximo } = progresoNivel(puntos);
  const color = nivel.tokenColor ? `var(${nivel.tokenColor})` : "var(--df-line)";

  return (
    <section
      aria-labelledby="mi-nivel"
      className="rounded-sm border border-line bg-surface p-6 lg:p-8"
    >
      <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
        {/* El aro lleva el color del nivel; el emblema flota DENTRO, así el aro no se mueve y el
            conjunto no parece que se despegue de la tarjeta. */}
        <div
          data-nivel={nivel.clave}
          className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-2"
          style={{ borderColor: color }}
        >
          <div className="df-float flex items-center justify-center">
            {nivel.emblema ? (
              <EmblemaDeNivel nivel={nivel} clase="h-16 w-16" />
            ) : (
              <span className="flex items-end gap-1" aria-hidden>
                {Array.from({ length: TOTAL_TIERS }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 shrink-0 rounded-xs ${i < nivel.tier ? "bg-text" : "bg-line"}`}
                    style={{ height: `${10 + i * 6}px` }}
                  />
                ))}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* El nombre del nivel en la tipografía de DISPLAY, la misma del logotipo: es lo único de
              la pantalla que se lee como un título y no como un dato. */}
          <h1
            id="mi-nivel"
            className="text-4xl leading-none text-text lg:text-5xl"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wght" 800, "wdth" 125',
            }}
          >
            {nivel.nombre}
          </h1>
          <p className="mt-2 text-sm text-text-dim">
            <span className="font-semibold tabular-nums text-text">
              {puntos.toLocaleString("es-ES")}
            </span>{" "}
            {puntos === 1 ? "punto" : "puntos"} acumulados
          </p>

          {esMaximo ? (
            // SIN BARRA en el techo. Una barra al 100% permanente invita a buscar el siguiente nivel,
            // y no hay siguiente: decirlo cuesta una línea y no engaña a nadie.
            <p data-progreso="maximo" className="mt-4 text-sm font-medium text-text">
              Nivel máximo. No hay nada por encima de {nivel.nombre}.
            </p>
          ) : (
            <div className="mt-4" data-progreso="parcial">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-raised"
                role="progressbar"
                aria-valuenow={porcentaje}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso hacia ${siguiente?.nombre}`}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${porcentaje}%`, backgroundColor: color }}
                />
              </div>
              <p className="mt-2 text-sm text-text-dim">
                <span className="tabular-nums">{porcentaje}%</span> · faltan{" "}
                <span className="font-medium tabular-nums text-text">
                  {faltan.toLocaleString("es-ES")}
                </span>{" "}
                {faltan === 1 ? "punto" : "puntos"} para {siguiente?.nombre}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
