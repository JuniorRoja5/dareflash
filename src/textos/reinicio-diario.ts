/**
 * CUÁNDO SE REINICIAN LOS CONTADORES DIARIOS (Boost, toques), dicho en la hora de quien mira (Fase 11):
 * «El contador se reinicia a las 01:00.» El DÍA se sigue calculando en UTC (`RESET_TIMEZONE`): esto
 * cambia cómo se DICE, nunca cuándo se reinicia. A un usuario no se le dice «UTC», y sin su zona no se
 * inventa una hora: se dice que es cada día.
 *
 * Desde la P5b3 la frase es del diccionario (`reinicioDiario`) y esto solo la compone: recibe la `t`
 * (no importa ningún diccionario), así que lo usan igual la API y un componente de cliente.
 */
import { horaDelReinicioDiario, type Idioma, type ZonaHoraria } from "@/lib/formato";

import type { es } from "./es";
import type { FuncionT } from "./plantilla";

export function fraseReinicioDiario(
  t: FuncionT<(typeof es)["reinicioDiario"]>,
  ahora: Date,
  idioma: Idioma,
  zona: ZonaHoraria | null,
): string {
  const cuando = zona
    ? t("aLas", { hora: horaDelReinicioDiario(ahora, idioma, zona) })
    : t("cadaDia");
  return t("frase", { cuando });
}
