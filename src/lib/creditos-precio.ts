/**
 * LOS PAQUETES DE CRÉDITOS EN VENTA (Fase 9 · P11) — puro, derivado del catálogo `PAQUETES_CREDITOS`.
 *
 * Cuánto sale cada crédito y cuál es el de MEJOR PRECIO se calculan, no se escriben: mover un precio en
 * constants mueve la etiqueta y el acento de golpe, como en los paquetes de Boost.
 */
import { PAQUETES_CREDITOS, type PaqueteCreditos } from "@/config/constants";

export interface PaqueteCreditosEnVenta {
  clave: PaqueteCreditos;
  creditos: number;
  precioCents: number;
  /** Céntimos por crédito, redondeado al céntimo. */
  porCreditoCents: number;
  /** El de menor precio por crédito (uno solo: si empatan, el más grande). */
  mejorPrecio: boolean;
}

export function paquetesCreditosEnVenta(): PaqueteCreditosEnVenta[] {
  const lista = (Object.keys(PAQUETES_CREDITOS) as PaqueteCreditos[]).map((clave) => {
    const p = PAQUETES_CREDITOS[clave];
    return {
      clave,
      creditos: p.creditos,
      precioCents: p.precioCents,
      porCreditoCents: Math.round(p.precioCents / p.creditos),
    };
  });
  const mejor = lista.reduce((a, b) =>
    b.precioCents / b.creditos < a.precioCents / a.creditos ||
    (b.precioCents / b.creditos === a.precioCents / a.creditos && b.creditos > a.creditos)
      ? b
      : a,
  );
  return lista.map((p) => ({ ...p, mejorPrecio: p.clave === mejor.clave }));
}
