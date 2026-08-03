import type { ButtonHTMLAttributes } from "react";

import { botonTokens, type BotonVariante } from "./logic";

// Lookups token -> clase LITERAL (Tailwind v4 solo genera clases que ve escritas; nada de
// `bg-${token}`). Atan la primitiva a `botonTokens` (la fuente de verdad testeada) sin construir
// clases dinamicas: si el mapa cambia, cambia el color renderizado.
const CLASE_FONDO = { action: "bg-action", alarm: "bg-alarm" } as const;
const CLASE_TEXTO = { void: "text-void", text: "text-text" } as const;

const BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-sm border px-5 text-sm font-semibold transition-[filter,background-color,border-color] duration-150 ease-mechanical disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 disabled:hover:bg-transparent";

/**
 * BOTON — cuatro variantes. Principal: --df-action de relleno + TEXTO NEGRO (--df-void), UNO por
 * pantalla. Peligro: --df-alarm de relleno + texto negro. Secundario: filete de 1 px, sin relleno.
 * Fantasma: solo texto. Zona tactil 44 px (min-h). El foco visible es global (anillo de 2 px).
 * Deshabilitado: sobrio (opacidad, sin hover). Los tokens salen de `botonTokens`.
 */
export function Boton({
  variante = "principal",
  className = "",
  children,
  ...props
}: { variante?: BotonVariante } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const t = botonTokens(variante);
  const clases = [
    BASE,
    t.fondo ? CLASE_FONDO[t.fondo] : "bg-transparent",
    CLASE_TEXTO[t.texto],
    t.filete ? "border-line" : "border-transparent",
    t.fondo ? "hover:brightness-110" : "hover:bg-raised",
    className,
  ].join(" ");
  return (
    <button className={clases} {...props}>
      {children}
    </button>
  );
}
