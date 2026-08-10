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
  apilarEnMovil = false,
  className = "",
}: {
  cents: number;
  currency?: string;
  deadlineMs: number | null;
  tamano?: TamanoMarcador;
  /**
   * OPT-IN (por defecto false → comportamiento intacto). Si true, en movil PREMIO y PLAZO se APILAN
   * (dos lineas, sin recortar) y en lg vuelven a la linea horizontal de siempre. Pensado para tiles
   * verticales estrechos (2 columnas), donde el marcador de 1 linea del mayor premio no cabria. La
   * unidad sigue indivisible: nunca se separan ni se recorta el plazo; solo cambia de forma. Afinado
   * para `tamano="lista"` (el usado en esos tiles); el filete vertical se oculta en movil (apilado).
   */
  apilarEnMovil?: boolean;
  className?: string;
}) {
  const t = TAMANOS[tamano];
  const contenedor = apilarEnMovil
    ? `flex flex-col items-start gap-0.5 lg:flex-row lg:items-center lg:gap-3`
    : `inline-flex items-center ${t.gap}`;
  const filete = apilarEnMovil
    ? `hidden lg:block w-px ${t.filete} shrink-0 bg-line`
    : `w-px ${t.filete} shrink-0 bg-line`;
  return (
    <div className={`${contenedor} ${className}`}>
      <ImportePremio cents={cents} currency={currency} tamano={t.importe as TamanoImporte} />
      <span className={filete} aria-hidden />
      <CuentaAtras deadlineMs={deadlineMs} tamano={t.cuenta as TamanoCuenta} />
    </div>
  );
}
