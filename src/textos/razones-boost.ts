/**
 * EL MOTIVO DE UN MOVIMIENTO DE BOOSTS EN EL IDIOMA DE LA PÁGINA (Fase 11 · P5b2a). Qué frase toca lo
 * decide `claveRazonBoost` (lib/razones-boost); una razón desconocida se dice TAL CUAL. Pura: recibe la
 * `t` del espacio `razonesBoost`.
 */
import { claveRazonBoost } from "@/lib/razones-boost";

import type { FuncionT } from "./plantilla";
import type { Textos } from "./servidor";

export function razonBoost(
  t: FuncionT<Textos["razonesBoost"]>,
  razon: string,
  delta?: number,
): string {
  const clave = claveRazonBoost(razon, delta);
  return clave ? t(`propia_${clave}`) : razon;
}
