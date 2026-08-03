import type { CSSProperties } from "react";

/** Tamaños del ENTERO del importe (px). Escala de lista a heroe SIN cambiar de estructura. */
const TAMANO_PX = { lista: 20, tarjeta: 34, heroe: 64 } as const;
export type TamanoImporte = keyof typeof TAMANO_PX;

/**
 * IMPORTE DE PREMIO — el tratamiento del dinero. Archivo Expanded, peso muy alto, `tabular-nums`,
 * SOLO --df-money (texto lima sobre fondo oscuro; nunca relleno). Una cifra de dinero debe pesar en
 * pantalla lo que pesa en la cabeza del usuario. El simbolo y los centimos van mas pequeños para que
 * mande el entero. Los PUNTOS no son dinero: no usan este componente ni --df-money.
 */
export function ImportePremio({
  cents,
  currency = "USD",
  tamano = "tarjeta",
  className = "",
}: {
  cents: number;
  currency?: string;
  tamano?: TamanoImporte;
  className?: string;
}) {
  const px = TAMANO_PX[tamano];
  const partes = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(
    cents / 100,
  );
  const estilo: CSSProperties = {
    fontFamily: "var(--font-display)",
    fontVariationSettings: '"wght" 850, "wdth" 125',
    fontVariantNumeric: "tabular-nums",
    fontSize: `${px}px`,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
  return (
    <span className={`tabular-nums text-money ${className}`} style={estilo}>
      {partes.map((p, i) => {
        if (p.type === "currency") {
          return (
            <span key={i} style={{ fontSize: "0.5em", verticalAlign: "0.5em" }}>
              {p.value}
            </span>
          );
        }
        if (p.type === "decimal" || p.type === "fraction") {
          return (
            <span key={i} style={{ fontSize: "0.5em" }}>
              {p.value}
            </span>
          );
        }
        return <span key={i}>{p.value}</span>;
      })}
    </span>
  );
}
