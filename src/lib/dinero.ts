/**
 * Dinero SIEMPRE en enteros (céntimos); nunca coma flotante (convención de arquitectura). Aquí, las
 * dos conversiones PURAS entre el importe humano ("20", "20,50") y los céntimos enteros, hechas con
 * ARITMÉTICA ENTERA sobre las partes (parte entera y decimales), sin `* 100` en float que redondee mal.
 */

/**
 * "20" / "20.5" / "20,50" -> céntimos enteros (2000 / 2050 / 2050). Acepta coma o punto y hasta 2
 * decimales. Devuelve `null` si el formato no es un importe válido (el que llama muestra copy humano).
 */
export function importeACentimos(entrada: string): number | null {
  const s = entrada.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [enteros, decimales = ""] = s.split(".");
  const centimos = Number(enteros) * 100 + Number((decimales + "00").slice(0, 2));
  return Number.isSafeInteger(centimos) ? centimos : null;
}

/** Céntimos enteros -> importe con 2 decimales ("2000" -> "20.00"). Para MOSTRAR el premio. */
export function centimosAImporte(centimos: number): string {
  const signo = centimos < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(centimos));
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
