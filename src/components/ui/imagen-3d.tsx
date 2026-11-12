import type { Tema } from "@/lib/tema";

/**
 * LAS IMÁGENES 3D DE LA PORTADA (rediseño de /inicio): las genera `scripts/optimizar-recursos-3d.mjs` a
 * partir de los originales de Junior (`recursos/3d/`, sin versionar) y viven en `public/img/3d/`.
 *
 * UNA VERSIÓN POR TEMA, y el servidor sirve SOLO la del tema de quien mira (lo sabe por la cookie): el
 * color de cada pieza sale de los tokens de SU tema (`--df-money` no vale lo mismo en claro que en oscuro),
 * así que la del otro tema quedaría sucia o sin contraste. Mandar las dos y esconder una con CSS haría
 * bajar las dos.
 *
 * AVIF con WebP de respaldo, a 1× y 2×, con `width`/`height` puestos (sin saltos de maquetación). Los
 * originales son de 512 px: ninguna se pinta a más de 256 px CSS, o se vería borrosa.
 *
 * Decorativas (`alt=""`): lo que dicen ya lo dice el texto al lado. Sin sombra ni glow incrustados: el
 * glow lo pone quien la monta, con los tokens.
 */
export const PIEZAS_3D = {
  rayo: [176, 352],
  moneda: [48, 96],
  trofeo: [72, 144],
  "paso-1-reto": [64, 128],
  "paso-2-video": [64, 128],
  "paso-3-voto": [64, 128],
} as const satisfies Record<string, readonly [number, number]>;

export type Pieza3d = keyof typeof PIEZAS_3D;

const ruta = (pieza: Pieza3d, tema: Tema, ancho: number, ext: "avif" | "webp") =>
  `/img/3d/${pieza}-${tema}-${ancho}.${ext}`;

export function Imagen3d({
  pieza,
  tema,
  tamano,
  className = "",
  prioridad = false,
  primeraPantalla = false,
}: {
  pieza: Pieza3d;
  tema: Tema;
  /** Lado en px CSS. Como mucho el ancho 1× de la pieza (los originales son de 512 px). */
  tamano?: number;
  className?: string;
  /** Solo para la imagen que sea el LCP de la página (y solo si lo es). */
  prioridad?: boolean;
  /**
   * Se ve en la PRIMERA pantalla (sin prioridad): se carga ya, no en perezoso. Medido: una imagen del
   * hero en `lazy` retrasaba el LCP en móvil.
   */
  primeraPantalla?: boolean;
}) {
  const [a1, a2] = PIEZAS_3D[pieza];
  const lado = Math.min(tamano ?? a1, a1);
  const srcset = (ext: "avif" | "webp") =>
    `${ruta(pieza, tema, a1, ext)} 1x, ${ruta(pieza, tema, a2, ext)} 2x`;
  return (
    <picture className={`block shrink-0 ${className}`}>
      <source type="image/avif" srcSet={srcset("avif")} />
      <source type="image/webp" srcSet={srcset("webp")} />
      <img
        src={ruta(pieza, tema, a1, "webp")}
        alt=""
        width={lado}
        height={lado}
        loading={prioridad || primeraPantalla ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={prioridad ? "high" : "auto"}
        className="h-auto w-full select-none"
        draggable={false}
      />
    </picture>
  );
}
