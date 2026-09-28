import type { CSSProperties } from "react";

import { EmblemaDeNivel } from "@/components/ui/emblema-nivel";
import { TOTAL_TIERS } from "@/lib/niveles";
import { progresoNivel } from "@/lib/progreso-nivel";

/**
 * HERO DE NIVEL — quién eres, en grande.
 *
 * AQUÍ SE GASTA TODA LA AUDACIA DE LA PANTALLA, y en un solo sitio: medallón con aro y halo del
 * color de tu nivel, la cifra en la tipografía de display, y la barra que se llena una vez al
 * cargar. Todo lo que viene debajo —escalera, tabla, historial— va deliberadamente quieto y neutro.
 * Si la escalera también brillara, no destacaría nada y la pantalla sería una feria.
 *
 * LA CIFRA MANDA SOBRE EL NOMBRE. Antes el nombre del nivel era el titular y los puntos una línea
 * pequeña debajo, y estaba del revés: a esta pantalla se viene a ver CUÁNTOS tienes. El nombre pasa
 * a chip del color del nivel, que es donde el color hace más trabajo con menos tinta.
 *
 * PROFUNDIDAD POR LUMINOSIDAD, que es la filosofía del sistema: superficie glass en capas
 * (`bg-surface/60` + desenfoque) con el halo detrás, y la sombra solo para despegar de la página.
 * Antes era `bg-surface` plano con un filete, o sea el mismo gris que el fondo: por eso se veía
 * muerto al lado del resto de la app, que ya usaba este idioma en retos y en buscar.
 *
 * EL MOVIMIENTO VA POR CLASES DEL SISTEMA (`df-float`, `df-sheen`, `df-barra`), nunca inline ni en
 * JS: la regla global de `prefers-reduced-motion` las apaga con `!important`, así que quien pide
 * menos movimiento ve el hero QUIETO sin que esta pantalla tenga que acordarse. Una animación en JS
 * se saltaría esa red, y un `style={{ animation }}` también si la regla perdiera su `!important`.
 *
 * ROOKIE NO TIENE EMBLEMA a propósito (ver `niveles.ts`: es el estándar, no un logro). En su hueco
 * va el medidor de barras y el halo cae en gris neutro: sigue teniendo cuerpo, sin inventarle una
 * insignia que no ha ganado.
 */
export function HeroNivel({ puntos }: { puntos: number }) {
  const { nivel, siguiente, faltan, porcentaje, esMaximo } = progresoNivel(puntos);
  const color = nivel.tokenColor ? `var(${nivel.tokenColor})` : "var(--df-line)";
  // Legend no tiene color propio: usa el oro del podio, y el halo va con él (ver `lib/niveles`).
  const halo = nivel.tokenColor ? { "--df-halo-color": `var(${nivel.tokenColor})` } : undefined;

  return (
    <section
      aria-labelledby="mi-nivel"
      style={halo as CSSProperties}
      className="relative overflow-hidden rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md lg:p-10"
    >
      {/* La luz de color, detrás de todo y sin capturar el ratón. */}
      <span className="df-halo" aria-hidden />

      <div className="relative flex flex-col items-center gap-7 text-center sm:flex-row sm:items-center sm:gap-9 sm:text-left">
        {/* EL MEDALLÓN. El aro lleva el color y el brillo; el emblema flota DENTRO, así el aro no se
            mueve y el conjunto no parece despegarse de la tarjeta. */}
        <div
          data-nivel={nivel.clave}
          className="df-sheen relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-2 bg-void/40"
          style={{
            borderColor: color,
            // Halo ceñido al aro: el mismo color, apenas un dedo de luz alrededor. Es lo que separa
            // "un círculo con un borde" de "una medalla".
            boxShadow: `0 0 0 6px color-mix(in srgb, ${color} 10%, transparent), 0 0 34px -6px color-mix(in srgb, ${color} 45%, transparent)`,
          }}
        >
          <div className="df-float flex items-center justify-center">
            {nivel.emblema ? (
              <EmblemaDeNivel nivel={nivel} clase="h-20 w-20" />
            ) : (
              <span className="flex items-end gap-1.5" aria-hidden>
                {Array.from({ length: TOTAL_TIERS }).map((_, i) => (
                  <span
                    key={i}
                    className={`w-2 shrink-0 rounded-xs ${i < nivel.tier ? "bg-text" : "bg-line"}`}
                    style={{ height: `${12 + i * 7}px` }}
                  />
                ))}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* La etiqueta es visual: el título de abajo ya la dice para quien escucha, y repetirla
              haría que un lector de pantalla anunciara "Tus puntos. Tus puntos: 905". */}
          <p className="text-2xs tracking-widest text-text-dim uppercase" aria-hidden>
            Tus puntos
          </p>
          {/* LA CIFRA, en la tipografía de display (la del logotipo): es lo único de la pantalla que
              se lee como un titular y no como un dato. Es el H1 de la página, y por eso lleva el
              "Tus puntos:" delante en voz: un encabezado que solo diga "905" no dice nada. */}
          <h1
            id="mi-nivel"
            className="mt-1 text-[clamp(3rem,10vw,4.5rem)] leading-[0.95] tabular-nums text-text"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wght" 800, "wdth" 125',
            }}
          >
            <span className="sr-only">Tus puntos: </span>
            {puntos.toLocaleString("es-ES")}
          </h1>

          {/* El nombre del nivel, en su color y con su emblema: el chip es donde el color de nivel
              hace todo su trabajo con la menor cantidad de tinta. */}
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold"
              style={{
                color,
                borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
              }}
            >
              {nivel.emblema ? <EmblemaDeNivel nivel={nivel} clase="h-4 w-4" /> : null}
              {nivel.nombre}
            </span>
          </p>

          {esMaximo ? (
            // SIN BARRA en el techo. Una barra al 100% permanente invita a buscar el siguiente
            // nivel, y no hay siguiente: decirlo cuesta una línea y no engaña a nadie.
            <p data-progreso="maximo" className="mt-5 text-sm font-medium text-text">
              Nivel máximo. No hay nada por encima de {nivel.nombre}.
            </p>
          ) : (
            <div className="mt-5" data-progreso="parcial">
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-raised"
                role="progressbar"
                aria-valuenow={porcentaje}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progreso hacia ${siguiente?.nombre}`}
              >
                {/* El ancho final va en el `style`; `df-barra` solo lo escala al entrar. */}
                <div
                  className="df-barra h-full rounded-full"
                  style={{
                    width: `${porcentaje}%`,
                    backgroundColor: color,
                    boxShadow: `0 0 12px -2px color-mix(in srgb, ${color} 60%, transparent)`,
                  }}
                />
              </div>
              <p className="mt-2.5 text-sm text-text-dim">
                <span className="font-medium tabular-nums text-text">{porcentaje}%</span> · faltan{" "}
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
