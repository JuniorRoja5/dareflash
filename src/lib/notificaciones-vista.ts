/**
 * NOTIFICACIONES — lo que se PINTA en el navegador (la bandeja, el badge, la hora de un comentario).
 *
 * Aparte de `lib/notificaciones` porque aquel lleva el esquema de los avisos (zod), y con él dentro zod
 * entero viajaba al JS de toda página con la barra de navegación (Fase 11 · P1b). Esto no valida nada:
 * recibe números ya leídos.
 */
import type { es } from "@/textos/es";
import type { FuncionT } from "@/textos/plantilla";

import { formatearFechaParaQuienMira, type Idioma, type ZonaHoraria } from "./formato";

/**
 * "Hace cuánto", en castellano y sin librería. Grueso a propósito: en una bandeja importa el orden de
 * magnitud, no el minuto exacto. Más de una semana -> la fecha.
 */
export function haceCuanto(
  /** Las palabras, del espacio `tiempoRelativo` (P5b3): esta pieza decide la UNIDAD, no la frase. */
  t: FuncionT<(typeof es)["tiempoRelativo"]>,
  ms: number,
  ahoraMs: number,
  idioma: Idioma,
  zona: ZonaHoraria | null,
): string {
  const s = Math.max(0, Math.floor((ahoraMs - ms) / 1000));
  if (s < 60) return t("ahora");
  const min = Math.floor(s / 60);
  if (min < 60) return t("minutos", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("horas", { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t("dias", { n: d });
  // Más de una semana: el DÍA, en la zona de quien mira (Fase 11).
  return formatearFechaParaQuienMira(ms, idioma, zona, "diaMes");
}

/** Contador del badge: "99+" por encima del tope; `null` si no hay nada que pintar. */
export function textoBadge(noLeidas: number, tope: number): string | null {
  if (noLeidas <= 0) return null;
  return noLeidas > tope ? `${tope}+` : String(noLeidas);
}
