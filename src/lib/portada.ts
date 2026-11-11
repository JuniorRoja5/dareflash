/**
 * LA PORTADA (Fase 9 · P14) — lo puro: qué cifras se enseñan, cómo se escribe un premio corto y en qué
 * orden va la rejilla. Sin datos inventados en ningún sitio: todo sale de lo que el servidor contó.
 */
import { REJILLA_CIERRE_PRONTO_MS } from "@/config/constants";

export interface CifrasPortada {
  /** Categorías con al menos un reto abierto (no las del catálogo: esas no dicen nada de hoy). */
  categorias: number;
  retosAbiertos: number;
  /** La suma de los premios de los retos abiertos, en céntimos. */
  premiosCents: number;
}

export type CifraVisible =
  | { clave: "premios"; valor: number; etiqueta: string }
  | { clave: "retos"; valor: number; etiqueta: string }
  | { clave: "categorias"; valor: number; etiqueta: string };

/**
 * LAS CIFRAS QUE SE ENSEÑAN. Ninguna se inventa y ninguna se enseña para decir poco:
 *  - sin retos abiertos, NINGUNA (la portada pone otro mensaje: un «0 en premios» espanta);
 *  - los premios, si suman algo;
 *  - las categorías, solo si hay más de una (una «1 categoría» no es una cifra, es una frase).
 */
export function cifrasVisibles(c: CifrasPortada): CifraVisible[] {
  if (c.retosAbiertos <= 0) return [];
  const r: CifraVisible[] = [];
  if (c.premiosCents > 0)
    r.push({ clave: "premios", valor: c.premiosCents, etiqueta: "en premios ahora" });
  r.push({
    clave: "retos",
    valor: c.retosAbiertos,
    etiqueta: c.retosAbiertos === 1 ? "reto abierto" : "retos abiertos",
  });
  if (c.categorias > 1)
    r.push({ clave: "categorias", valor: c.categorias, etiqueta: "categorías" });
  return r;
}

/**
 * UN PREMIO CORTO para una cifra de hero: «$250», «$8.4k», «$12k». Por debajo de mil dólares, entero;
 * desde mil, en miles con un decimal (y sin «.0»). En inglés de EE. UU., como el resto del dinero del
 * producto (`formatearImporte`): el mismo «$» en todas partes.
 */
export function premioCorto(cents: number): string {
  const dolares = cents / 100;
  if (dolares < 1000) return `$${Math.round(dolares)}`;
  const miles = Math.round(dolares / 100) / 10;
  return `$${Number.isInteger(miles) ? miles.toFixed(0) : miles.toFixed(1)}k`;
}

/**
 * EL ORDEN DE LA REJILLA: primero los que cierran PRONTO (menos de `REJILLA_CIERRE_PRONTO_MS`), por
 * premio; después el resto, por premio. Empates, el que cierra antes. Las dos razones para entrar ya
 * —mucho premio y poco plazo— sin una fórmula que nadie sepa leer.
 */
export function ordenarRejilla<R extends { premioCents: number; deadlineMs: number }>(
  retos: readonly R[],
  ahoraMs: number,
): R[] {
  const pronto = (r: R) => r.deadlineMs - ahoraMs < REJILLA_CIERRE_PRONTO_MS;
  return [...retos].sort((a, b) => {
    const pa = pronto(a);
    const pb = pronto(b);
    if (pa !== pb) return pa ? -1 : 1;
    if (a.premioCents !== b.premioCents) return b.premioCents - a.premioCents;
    return a.deadlineMs - b.deadlineMs;
  });
}

/**
 * ¿SE PINTA ESTA PIEZA DE PUBLICIDAD EN LA PORTADA? Una CAMPAÑA, siempre (es lo vendido). El anuncio de
 * la CASA («Anúnciate aquí»), solo a una EMPRESA, que es la única que puede hacer algo con él (la lleva
 * a su sección de publicidad).
 *
 * POR QUÉ (P14, la doble invitación): para un invitado la casa era una SEGUNDA invitación a negocios,
 * repetida con el bloque «¿Tienes un negocio?». Se queda el bloque —tiene la oferta de Socios
 * Fundadores y su botón, y no depende de que la publicidad se venda o no: si un día todos los huecos
 * tienen campaña, la casa desaparece y el invitado se quedaría sin ninguna—. Y a un participante no se
 * le invita a anunciarse: no puede convertir su cuenta. El reparto no se toca: el hueco se decide igual
 * (y cuenta igual para el resumen del admin); lo que cambia es si la portada lo pinta.
 */
export function pintarPiezaEnPortada(
  pieza: { tipo: "campana" | "casa" },
  esEmpresa: boolean,
): boolean {
  return pieza.tipo === "campana" || esEmpresa;
}
