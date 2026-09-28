import { ladoQr, matrizQr, rutaQr } from "@/lib/qr";

/**
 * CÓDIGO QR de un enlace. Se genera en el SERVIDOR y viaja como SVG: ni un byte de JavaScript en el
 * cliente para pintar una imagen que no cambia nunca.
 *
 * NO SIGUE AL TEMA, y es deliberado: los lectores esperan módulos oscuros sobre fondo claro y varios
 * fallan con el patrón invertido, así que en oscuro un QR "coherente con la interfaz" sería un QR
 * que algunos teléfonos no cogen — roto sin que se vea roto. Lleva su placa clara en los dos temas,
 * con los únicos dos tokens del sistema que valen lo mismo en ambos (ver `--df-qr-*` en globals).
 */
export function CodigoQr({
  valor,
  etiqueta,
  clase = "",
}: {
  /** El enlace que se codifica. */
  valor: string;
  /** Qué es, para quien no lo ve (el QR es una imagen y necesita su texto). */
  etiqueta: string;
  clase?: string;
}) {
  // La codificación y el dibujo son PUROS y viven en `lib/qr`, atados con su propia huella: aquí
  // no se rehace nada, que es lo que hacía que el test comprobara una copia en vez del código.
  const matriz = matrizQr(valor);
  const lado = ladoQr(matriz);

  return (
    <svg
      viewBox={`0 0 ${lado} ${lado}`}
      role="img"
      aria-label={etiqueta}
      className={clase}
      // `crispEdges` apaga el suavizado: un módulo de QR es un cuadrado y tiene que acabar donde
      // acaba. Con suavizado, a tamaño pequeño los bordes se lavan y el contraste baja justo en lo
      // que el lector mide.
      shapeRendering="crispEdges"
    >
      {/* La placa clara, zona tranquila incluida: el margen es parte del código, no del hueco. */}
      <rect width={lado} height={lado} fill="var(--df-qr-fondo)" rx="1" />
      <path d={rutaQr(matriz)} fill="var(--df-qr-tinta)" />
    </svg>
  );
}
