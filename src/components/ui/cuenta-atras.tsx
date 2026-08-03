"use client";

import { type CSSProperties, useEffect, useState } from "react";

import { formatearCuentaAtras, tokenCuentaAtras } from "./logic";

const TAMANO_PX = { lista: 14, tarjeta: 22, heroe: 40 } as const;
export type TamanoCuenta = keyof typeof TAMANO_PX;

const PLACEHOLDER = "··:··:··";

/**
 * CUENTA ATRAS — `tabular-nums`, --df-time, y transicion a --df-alarm POR DEBAJO DE 24 H. Ese paso
 * es un EVENTO DE PRODUCTO (la eleccion del token vive en `tokenCuentaAtras`, testeada), no un
 * adorno; la transicion de color (300 ms) es de las pocas cosas que se mueven despacio y la
 * desactiva `prefers-reduced-motion` via la regla CSS global.
 *
 * `deadlineMs` es ABSOLUTO (viene de datos; sin "now" en el render -> componente puro). El tiempo
 * restante se calcula SOLO en el cliente (efecto): no hay Date.now() impuro en render, y el primer
 * render de servidor y cliente coincide en un placeholder estable que el efecto sustituye (sin
 * mismatch de hidratacion). `deadlineMs === null` es el estado "aun sin plazo" (p. ej. cargando).
 */
export function CuentaAtras({
  deadlineMs,
  tamano = "tarjeta",
  className = "",
}: {
  deadlineMs: number | null;
  tamano?: TamanoCuenta;
  className?: string;
}) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    if (deadlineMs === null) return;
    const tick = (): void => setMs(deadlineMs - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const token = ms === null ? "time" : tokenCuentaAtras(ms);
  const estilo: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontVariationSettings: '"wght" 640, "wdth" 112',
    fontVariantNumeric: "tabular-nums",
    fontSize: `${TAMANO_PX[tamano]}px`,
    lineHeight: 1,
    color: `var(--color-${token})`,
    transition: "color 300ms var(--ease-mechanical)",
    whiteSpace: "nowrap",
  };
  return (
    <span className={`tabular-nums ${className}`} style={estilo} role="timer">
      {ms === null ? PLACEHOLDER : formatearCuentaAtras(ms)}
    </span>
  );
}
