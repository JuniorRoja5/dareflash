import { CuentaAtras, type TamanoCuenta } from "./cuenta-atras";
import { ImportePremio, type TamanoImporte } from "./importe-premio";

/** El marcador escala de la tarjeta pequeña al heroe SIN cambiar de estructura: solo el tamaño. */
const TAMANOS = {
  lista: { importe: "lista", cuenta: "lista", filete: "h-6", gap: "gap-3" },
  tarjeta: { importe: "tarjeta", cuenta: "tarjeta", filete: "h-10", gap: "gap-4" },
  heroe: { importe: "heroe", cuenta: "heroe", filete: "h-16", gap: "gap-6" },
} as const;
export type TamanoMarcador = keyof typeof TAMANOS;

/**
 * EL MARCADOR — elemento firma. La unidad indivisible que junta PREMIO y TIEMPO: nunca se separan
 * (un premio sin plazo es una promesa sin condiciones). Filete vertical de 1 px; SIN fondo, SIN
 * sombra, SIN caja: vive directamente sobre la superficie. Es lo unico del sistema que puede gritar.
 */
export function Marcador({
  cents,
  currency = "USD",
  deadlineMs,
  tamano = "tarjeta",
  className = "",
}: {
  cents: number;
  currency?: string;
  deadlineMs: number | null;
  tamano?: TamanoMarcador;
  className?: string;
}) {
  const t = TAMANOS[tamano];
  return (
    <div className={`inline-flex items-center ${t.gap} ${className}`}>
      <ImportePremio cents={cents} currency={currency} tamano={t.importe as TamanoImporte} />
      <span className={`w-px ${t.filete} shrink-0 bg-line`} aria-hidden />
      <CuentaAtras deadlineMs={deadlineMs} tamano={t.cuenta as TamanoCuenta} />
    </div>
  );
}
