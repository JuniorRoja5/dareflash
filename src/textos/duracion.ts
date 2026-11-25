/**
 * LAS PALABRAS DE UNA DURACIÓN EN EL IDIOMA DE LA PÁGINA (Fase 11 · P5b2a), para `duracionBoostHumana`
 * (src/lib/boost-duracion.ts). Pura y sin diccionarios: recibe la `t` del espacio `duracion`, que el
 * servidor pide con `textos("duracion")` y el cliente con `useTextos("duracion")` (va en el armazón).
 */
import type { PalabrasDuracion } from "@/lib/boost-duracion";
import { formatearNumero, type Idioma } from "@/lib/formato";

import type { FuncionT } from "./plantilla";
import type { Textos } from "./servidor";

export function palabrasDuracion(
  t: FuncionT<Textos["duracion"]>,
  idioma: Idioma,
): PalabrasDuracion {
  const num = (n: number) => formatearNumero(n, idioma);
  return {
    minutos: (n) => t("minutos", { n }),
    horas: (n) => t("horas", { n }),
    horasMinutos: (horas, minutos) =>
      t("horasMinutos", { horas: num(horas), minutos: num(minutos) }),
    // En crudo: el valor TAL CUAL llegó, sin formatear (no es una duración bien formada y no se adorna).
    enCrudo: (valor) => t("enCrudo", { valor: String(valor) }),
  };
}
