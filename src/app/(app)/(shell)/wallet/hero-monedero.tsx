import type { CSSProperties } from "react";

import { ImportePremio } from "@/components/ui/importe-premio";
import { MSG_RETIRADA_SIN_MINIMO, RETIRADA_MINIMA_CENTS } from "@/config/constants";
import { importeConMoneda } from "@/lib/dinero";

/**
 * EL HERO DEL MONEDERO — el saldo como figura de la pantalla.
 *
 * ┌─ POR QUÉ ASÍ Y NO COMO ESTABA ────────────────────────────────────────────────────────────────┐
 * │ La primera versión de esta pantalla era un titular pequeño y una tarjeta gris con una cifra   │
 * │ dentro, y no se parecía a ninguna otra del producto: /puntos y /boosts abren con un HERO —la  │
 * │ cifra en Archivo Expanded, enorme, sobre cristal, con el halo de su color— y esta abría como  │
 * │ un formulario de ajustes. El dinero es la cifra más importante que esta persona va a ver en   │
 * │ DareFlash, y pesaba menos en pantalla que su nivel.                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA CIFRA LA PINTA `ImportePremio`, que es LA primitiva del dinero: Archivo Expanded, peso 850,
 * `tabular-nums`, el entero mandando sobre símbolo y céntimos, y `--df-money` obligatorio. Escribir
 * aquí un tamaño y un color a mano sería un segundo tratamiento del dinero libre de discrepar del
 * premio de un reto, que es la misma cifra en otra pantalla.
 *
 * EL HALO LLEVA `--df-money` por la misma razón por la que el de /puntos lleva el color del nivel:
 * el halo dice DE QUÉ va la tarjeta. Y es `.df-halo`, el halo por elemento, no el glow ambiental de
 * la vitrina —ese tiene dueño (`.df-rescoldo`) y una fuerza decidida para él—.
 *
 * LAS DOS CIFRAS DE ESTADO SALEN DE CONSULTAS DE VERDAD y solo se pintan si existen: una tarjeta
 * "Cobrado: $0.00" en una cuenta que nunca ha cobrado no informa de nada, ocupa el sitio de lo que
 * sí importa y, sobre todo, se parece a una maqueta.
 */
export function HeroMonedero({
  saldoCents,
  enRevisionCents,
  cobradoCents,
}: {
  saldoCents: number;
  /** Lo pedido que aún no es final (en revisión, aceptado o en camino). */
  enRevisionCents: number;
  cobradoCents: number;
}) {
  const llegaAlMinimo = saldoCents >= RETIRADA_MINIMA_CENTS;

  return (
    <section
      aria-labelledby="mi-saldo"
      style={{ "--df-halo-color": "var(--df-money)" } as CSSProperties}
      className="relative overflow-hidden rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md lg:p-10"
    >
      <span className="df-halo" aria-hidden />

      <div className="relative min-w-0">
        {/* `aria-hidden`: lo que dice ya va en el `sr-only` del titular, y repetirlo hace que un
            lector de pantalla lea la pantalla dos veces antes de llegar a la cifra. */}
        <p className="text-2xs tracking-widest text-text-dim uppercase" aria-hidden>
          Tu monedero
        </p>
        <h1 id="mi-saldo" className="mt-1 leading-none">
          <span className="sr-only">Saldo disponible: </span>
          <ImportePremio cents={saldoCents} tamano="heroe" className="block" />
        </h1>

        <p className="mt-3 max-w-prose text-sm text-text-dim">
          Lo que ganas en los retos se acumula aquí. Cuando llegues al mínimo, puedes pedir que te
          lo enviemos al banco o en cripto.
        </p>

        {/* EL ESTADO, EN CHIPS Y NO EN LETRA PEQUEÑA. El mínimo es la única restricción del producto
            y decide si la mitad de esta pantalla sirve de algo: enterarse al final es tarde. */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center rounded-full border border-line px-3 py-1 text-text-dim">
            {llegaAlMinimo
              ? `Puedes cobrar desde ${importeConMoneda(RETIRADA_MINIMA_CENTS)}`
              : `Te faltan ${importeConMoneda(RETIRADA_MINIMA_CENTS - saldoCents)} para el mínimo`}
          </span>
          {enRevisionCents > 0 ? (
            <span className="inline-flex items-center rounded-full border border-line px-3 py-1 text-text-dim">
              {importeConMoneda(enRevisionCents)} en curso
            </span>
          ) : null}
          {cobradoCents > 0 ? (
            <span className="inline-flex items-center rounded-full border border-line px-3 py-1 text-text-dim">
              {importeConMoneda(cobradoCents)} cobrados
            </span>
          ) : null}
        </div>

        {saldoCents === 0 ? (
          <p className="mt-4 max-w-prose text-sm text-text-dim">
            Todavía no has ganado nada. Gana un reto y el premio aparecerá aquí.
          </p>
        ) : llegaAlMinimo ? null : (
          <p className="mt-4 max-w-prose text-sm text-text-dim">{MSG_RETIRADA_SIN_MINIMO}</p>
        )}
      </div>
    </section>
  );
}
