/**
 * EL RANGO DE FECHAS DE UNA EXPORTACIÓN — puro, compartido por los dos export del panel.
 *
 * ┌─ POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────┐
 * │ Los CSV del panel bajaban SIEMPRE todo (hasta el tope) y el admin recortaba después en la   │
 * │ hoja. Eso significa sacar del servidor un año de IBANes para cuadrar un mes, y es justo lo  │
 * │ que un export auditado no debería obligar a hacer: cuanto menos sale, menos hay que         │
 * │ custodiar. El rango lo elige quien exporta y se aplica EN EL `where`, no recortando después │
 * │ —recortar después ya ha leído las filas, y el tope del export se habría gastado en filas    │
 * │ que se iban a tirar—.                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TODO EN UTC (`RESET_TIMEZONE`), como el resto de lo que cuenta en este producto. La zona del
 * admin interviene al PRESENTAR, nunca al filtrar: si no, dos personas exportando "el último mes"
 * el mismo día bajarían conjuntos distintos y ninguno sabría por qué.
 *
 * EL RANGO ES SEMIABIERTO `[desde, hasta)`, por lo mismo que el del periodo mensual: con un
 * "hasta" inclusivo hay que elegir el último milisegundo del día, y ese es el sitio clásico donde
 * una fila se pierde o se cuenta dos veces.
 */

/** Los presets que ofrece la pantalla, más el rango a mano. */
export const PRESETS_EXPORT = ["mes", "3meses", "ano", "custom"] as const;
export type PresetExport = (typeof PRESETS_EXPORT)[number];

export interface RangoExport {
  desde: Date;
  /** Exclusivo. */
  hasta: Date;
}

export type ResultadoRango =
  | { ok: true; rango: RangoExport }
  | { ok: false; motivo: "FECHA_INVALIDA" | "ORDEN_INVERTIDO" | "RANGO_VACIO" };

/** Cuántos MESES atrás mira cada preset. `custom` no está: lo pone quien exporta. */
const MESES_ATRAS: Record<Exclude<PresetExport, "custom">, number> = {
  mes: 1,
  "3meses": 3,
  ano: 12,
};

/**
 * `YYYY-MM-DD` (UTC) -> el instante de las 00:00 de ESE día. `null` si no es una fecha de verdad.
 *
 * SE VALIDA QUE LA FECHA EXISTA, no solo que tenga la forma: `new Date("2026-02-31")` no lanza,
 * "corrige" al 3 de marzo y devuelve un rango que nadie pidió. Se compara la fecha reconstruida
 * con la escrita, que es la única forma de pillarlo.
 */
export function diaUtc(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return d;
}

/**
 * El rango de un preset: una ventana RELATIVA a `ahora`, hacia atrás, hasta ahora mismo.
 *
 * "Último mes" es el mes anterior CONTADO DESDE HOY (del 14 de marzo al 14 de abril), no el mes
 * natural de marzo. Es lo que espera quien pulsa un botón que dice "último mes" mientras cuadra
 * cuentas: lo de las últimas cuatro semanas, no lo de un mes del calendario que ya cerró.
 */
export function rangoDePreset(preset: Exclude<PresetExport, "custom">, ahora: Date): RangoExport {
  const desde = new Date(ahora);
  desde.setUTCMonth(desde.getUTCMonth() - MESES_ATRAS[preset]);
  return { desde, hasta: ahora };
}

/**
 * RESUELVE lo que llega del formulario a un rango, o dice por qué no.
 *
 * El `hasta` de un rango a mano es INCLUSIVO para quien lo escribe ("hasta el 31 de marzo") y
 * exclusivo por dentro: se suma un día. Sin eso, exportar "del 1 al 31" se dejaría fuera todo el
 * día 31, que es el fallo que nadie ve hasta que falta una fila en la factura.
 */
export function resolverRango(
  entrada: { preset: PresetExport; desde?: string | null; hasta?: string | null },
  ahora: Date,
): ResultadoRango {
  if (entrada.preset !== "custom") {
    return { ok: true, rango: rangoDePreset(entrada.preset, ahora) };
  }

  const desde = entrada.desde ? diaUtc(entrada.desde) : null;
  const hasta = entrada.hasta ? diaUtc(entrada.hasta) : null;
  if (!desde || !hasta) return { ok: false, motivo: "FECHA_INVALIDA" };
  if (desde.getTime() > hasta.getTime()) return { ok: false, motivo: "ORDEN_INVERTIDO" };

  // +1 día: el `hasta` que escribe una persona incluye ese día entero.
  const finExclusivo = new Date(hasta.getTime() + 86_400_000);
  if (finExclusivo.getTime() <= desde.getTime()) return { ok: false, motivo: "RANGO_VACIO" };
  return { ok: true, rango: { desde, hasta: finExclusivo } };
}

/** Copy HUMANO del rechazo. Vive aquí para que la API y la pantalla digan lo mismo. */
export function motivoLegible(motivo: Exclude<ResultadoRango, { ok: true }>["motivo"]): string {
  switch (motivo) {
    case "FECHA_INVALIDA":
      return "Esas fechas no valen. Escribe las dos, con el formato del calendario.";
    case "ORDEN_INVERTIDO":
      return "La fecha de inicio es posterior a la de fin: dale la vuelta.";
    case "RANGO_VACIO":
      return "Ese rango no incluye ningún día.";
  }
}

/** Etiqueta del preset para la pantalla. Una sola fuente, para que botón y aviso coincidan. */
export const ETIQUETA_PRESET: Record<PresetExport, string> = {
  mes: "Último mes",
  "3meses": "Últimos 3 meses",
  ano: "Último año",
  custom: "Personalizado",
};
