import { CuentaAtras, type TamanoCuenta } from "./cuenta-atras";
import { ImportePremio, type TamanoImporte } from "./importe-premio";
import type { CuentaHacia } from "./logic";

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
  hacia = "cierre",
  apilarEnMovil = false,
  className = "",
}: {
  cents: number;
  currency?: string;
  /** El instante al que se cuenta. En un reto que aún no abre es su APERTURA (ver `hacia`). */
  deadlineMs: number | null;
  tamano?: TamanoMarcador;
  /**
   * HACIA QUÉ cuenta el plazo. Con `"apertura"` el número no pasa a la alarma y se antepone un
   * "Abre en": sin esa palabra, un reto que empieza mañana enseñaría "1 d 04 h" junto a su premio
   * y se leería como el tiempo que queda para participar, que es justo lo contrario.
   */
  hacia?: CuentaHacia;
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
      {/* "Abre en" SOLO cuando la cuenta va hacia la apertura. El número por sí solo es ambiguo
          —son los mismos dígitos en los dos casos— y la ambigüedad aquí cambia el significado
          entero: "te quedan 4 h para participar" frente a "faltan 4 h para poder participar". */}
      {/* LA ETIQUETA VA ENCIMA DEL NÚMERO, no al lado. En línea se comía el ancho de la barra de
          la tarjeta —que es estrecha: el 44% de media columna— y el plazo salía RECORTADO por el
          borde de la portada. Se vio en una captura, y ningún test lo habría visto.
          `whitespace-nowrap` porque además partía en dos ("ABRE / EN"), que se lee como roto. */}
      <span className="inline-flex min-w-0 flex-col items-start">
        {hacia === "apertura" ? (
          <span className="text-2xs leading-none font-semibold tracking-widest whitespace-nowrap text-text-dim uppercase">
            Abre en
          </span>
        ) : null}
        <CuentaAtras deadlineMs={deadlineMs} tamano={t.cuenta as TamanoCuenta} hacia={hacia} />
      </span>
    </div>
  );
}
