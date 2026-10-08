import type { CSSProperties } from "react";

import { BOOST_DAILY_LIMIT, BOOST_DURACION_MIN } from "@/config/constants";
import { duracionBoostHumana } from "@/lib/boost-duracion";

import { ActivarBoost } from "./activar-boost";

/**
 * HERO DE BOOSTS — cuántos tengo y qué compro con ellos.
 *
 * MISMO CUERPO QUE LOS OTROS DOS HEROES (glass al 60% + desenfoque + sombra grande + halo
 * recortado): `tests/simetria-secciones` lo exige a los tres a la vez, y por eso esta pantalla no
 * puede nacer "parecida" como le pasó a /referidos, que heredó las primitivas y no el cuerpo.
 *
 * LA CIFRA MANDA, como en /puntos: a esta pantalla se viene a ver CUÁNTOS Boosts tienes, no a leer
 * un título. Va en la tipografía de display y es el H1, con su "Tus Boosts:" en voz para quien
 * escucha —un encabezado que solo diga "0" no dice nada—.
 *
 * ┌─ EL HALO VA EN `--df-action`, NO EN `--df-money` ─────────────────────────────────────────────┐
 * │ La regla de oro del sistema es ACCIÓN != DINERO, y aquí conviven los dos: la pantalla TIENE   │
 * │ precios. El reparto es el que mantiene la regla legible: el acento de la pantalla —halo y el  │
 * │ único botón principal— es `--df-action`, porque lo que la pantalla quiere que hagas es        │
 * │ comprar; y `--df-money` se queda EXCLUSIVAMENTE para los importes, con el mismo tratamiento   │
 * │ que el premio de un reto (`ImportePremio`). Un Boost no es dinero: es un crédito.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL OBJETO DE LA DERECHA NO ES DECORACIÓN. En /puntos ese sitio lo ocupa el medallón del nivel y en
 * /referidos el QR; aquí va una maqueta GEOMÉTRICA del espacio destacado, con un hueco encendido,
 * porque "qué me llevo por cinco dólares" es justo lo que no se entiende leyendo la palabra Boost.
 * Geométrica y no un icono ilustrado ni un emoji, como todo el sistema.
 *
 * LAS DOS CIFRAS SALEN DE SU CONSTANTE (`BOOST_DAILY_LIMIT`, `BOOST_DURACION_MIN`, esta última ya
 * dicha en castellano por `duracionBoostHumana`). Escribirlas aquí sería la cifra inventada de
 * siempre: el día que cambien, la pantalla seguiría prometiendo el número viejo. Mientras la
 * activación no existió, la duración NO se decía — ahora está decidida y se dice derivada.
 *
 * EL BOTÓN DE DESTACAR VIVE AQUÍ, junto al saldo, porque es la acción sobre ese saldo. Cuando hay
 * Boosts es el único magenta de la pantalla; cuando no hay, no se pinta y el acento se va a los
 * paquetes (lo decide la página).
 */
export function HeroBoosts({
  saldo,
  usadasHoy,
  vigenteHastaMs,
}: {
  saldo: number;
  usadasHoy: number;
  vigenteHastaMs: number | null;
}) {
  return (
    <section
      aria-labelledby="mis-boosts"
      style={{ "--df-halo-color": "var(--df-action)" } as CSSProperties}
      className="relative overflow-hidden rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md lg:p-10"
    >
      <span className="df-halo" aria-hidden />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-12">
        <div className="min-w-0">
          <p className="text-2xs tracking-widest text-text-dim uppercase" aria-hidden>
            Tus Boosts
          </p>
          <h1
            id="mis-boosts"
            className="mt-1 text-[clamp(3rem,10vw,4.5rem)] leading-[0.95] tabular-nums text-text"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wght" 800, "wdth" 125',
            }}
          >
            <span className="sr-only">Tus Boosts: </span>
            {saldo.toLocaleString("es-ES")}
          </h1>

          <p className="mt-3 max-w-prose text-sm text-text-dim">
            Un Boost pone <strong className="font-semibold text-text">tu perfil</strong> en el
            espacio destacado {duracionBoostHumana(BOOST_DURACION_MIN)}, donde lo ve quien entra. No
            caducan: se quedan en tu saldo hasta que los uses.
          </p>

          {/* EL LÍMITE, EN EL HERO Y NO EN LA LETRA PEQUEÑA. Es la única restricción del producto y
              afecta a cuánto tiene sentido comprar: enterarse DESPUÉS de pagar el pack de 10 es
              enterarse tarde. Cuando ya se ha gastado alguna, el chip pasa a decir CUÁNTAS quedan:
              "máximo 3 al día" deja de ser lo útil en cuanto llevas dos. */}
          <p className="mt-4 inline-flex flex-wrap items-center gap-x-2 rounded-full border border-line px-3 py-1 text-sm text-text-dim">
            <span data-usadas-hoy={usadasHoy}>
              {usadasHoy > 0
                ? `Has destacado ${usadasHoy} de ${BOOST_DAILY_LIMIT} veces hoy`
                : `Máximo ${BOOST_DAILY_LIMIT} al día`}
            </span>
            {vigenteHastaMs !== null ? (
              <span data-destacado-ahora style={{ color: "var(--df-ok)" }}>
                · Destacado ahora mismo
              </span>
            ) : null}
          </p>

          <ActivarBoost saldo={saldo} usadasHoy={usadasHoy} vigenteHastaMs={vigenteHastaMs} />
        </div>

        {/* MAQUETA DEL ESPACIO DESTACADO. `aria-hidden`: lo que dice ya está dicho en el párrafo de
            al lado, y un lector de pantalla leyendo cuatro divs vacíos no aporta nada. */}
        <div className="flex flex-col items-center gap-3 lg:items-end" aria-hidden>
          <div className="flex items-end gap-2 rounded-sm border border-line bg-void/40 p-3">
            {/* El hueco ENCENDIDO: el tuyo. Más alto que los demás, con el aro y el halo del acento
                —el mismo idioma que el medallón de /puntos, a escala de maqueta—. */}
            <span
              className="flex h-20 w-14 flex-col items-center justify-end gap-1.5 rounded-xs border-2 bg-surface p-1.5"
              style={{
                borderColor: "var(--df-action)",
                boxShadow:
                  "0 0 0 4px color-mix(in srgb, var(--df-action) 10%, transparent), 0 0 24px -6px color-mix(in srgb, var(--df-action) 50%, transparent)",
              }}
            >
              <span
                className="h-5 w-5 rounded-full"
                style={{ backgroundColor: "var(--df-action)" }}
              />
              <span className="h-1 w-7 rounded-full bg-line" />
              <span className="h-1 w-5 rounded-full bg-line" />
            </span>
            {/* Los demás huecos, apagados y más bajos: el contraste es lo que explica el de al lado. */}
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="flex h-14 w-11 flex-col items-center justify-end gap-1.5 rounded-xs border border-line bg-raised/60 p-1.5"
              >
                <span className="h-4 w-4 rounded-full bg-line" />
                <span className="h-1 w-5 rounded-full bg-line" />
              </span>
            ))}
          </div>
          <p className="text-2xs text-text-dim">El espacio destacado</p>
        </div>
      </div>
    </section>
  );
}
