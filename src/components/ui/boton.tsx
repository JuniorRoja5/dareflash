import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { botonTokens, type BotonVariante } from "./logic";

// Lookups token -> clase LITERAL (Tailwind v4 solo genera clases que ve escritas; nada de
// `bg-${token}`). Atan la primitiva a `botonTokens` (la fuente de verdad testeada) sin construir
// clases dinamicas: si el mapa cambia, cambia el color renderizado.
const CLASE_FONDO = { action: "bg-action", alarm: "bg-alarm" } as const;
const CLASE_TEXTO = { void: "text-void", text: "text-text" } as const;

const BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-sm border px-5 text-sm font-semibold transition-[filter,background-color,border-color] duration-150 ease-mechanical disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 disabled:hover:bg-transparent";

/**
 * Clases de la variante (fuente: `botonTokens`, testeada). COMPARTIDAS por las dos formas (boton y
 * enlace) para que un CTA de navegacion salga byte a byte identico a un boton del mismo tipo.
 */
function clasesBoton(variante: BotonVariante, className: string): string {
  const t = botonTokens(variante);
  return [
    BASE,
    t.fondo ? CLASE_FONDO[t.fondo] : "bg-transparent",
    CLASE_TEXTO[t.texto],
    t.filete ? "border-line" : "border-transparent",
    t.fondo ? "hover:brightness-110" : "hover:bg-raised",
    className,
  ].join(" ");
}

type PropsComunes = { variante?: BotonVariante; className?: string; children?: ReactNode };

/** Forma <button> (sin href). */
type PropsBoton = PropsComunes &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined };

/** Forma <Link>/<a> (con href): un CTA de navegacion con el lenguaje del boton. */
type PropsEnlace = PropsComunes &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
  };

/**
 * BOTON — POLIMORFICO por `href`. Cuatro variantes; principal = --df-action de relleno + TEXTO NEGRO
 * (--df-void), UNO por pantalla; peligro = --df-alarm; secundario = filete de 1 px; fantasma = solo
 * texto. Zona tactil 44 px; foco visible global; deshabilitado sobrio.
 *
 * SIN `href` renderiza un <button> con el marcado EXACTO de antes (type="button" por defecto,
 * sobreescribible; spread de props). CON `href` renderiza un <Link> de Next (un <a>) con las MISMAS
 * clases: elimina el "<Link> vestido de boton" (CtaCrear, CTAs del hero) — el CTA de navegacion
 * queda identico al boton, sin duplicar el string de clases a mano.
 */
export function Boton({
  variante = "principal",
  className = "",
  children,
  ...props
}: PropsBoton | PropsEnlace) {
  const clases = clasesBoton(variante, className);

  if (props.href !== undefined) {
    return (
      <Link className={clases} {...props}>
        {children}
      </Link>
    );
  }
  // type="button" por defecto para no hacer submit por accidente dentro de un formulario; va ANTES
  // del spread para que quien pase `type` lo pueda sobreescribir (identico al comportamiento previo).
  return (
    <button type="button" className={clases} {...props}>
      {children}
    </button>
  );
}
