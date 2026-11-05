import { textoInsignia } from "@/lib/pendientes-panel";

/**
 * LA INSIGNIA DE «HAY ALGO ESPERÁNDOTE». La usan la barra lateral (por sección) y la cabecera (el
 * total): un solo componente para que las dos se lean igual.
 *
 * ┌─ POR QUÉ ESTE COLOR, Y NO OTRO ────────────────────────────────────────────────────────────────┐
 * │ El encargo era «visible, no texto gris», y `MARCA.md` dice que los recuentos van en NEUTRO.     │
 * │ Las dos cosas caben: el neutro de MÁXIMO contraste —el color del texto como fondo, sobre el     │
 * │ panel oscuro— salta a la vista sin quitarle el trabajo a ningún token. `--df-action` es la      │
 * │ acción principal, UNA por pantalla, y la barra no puede gastarla; `--df-alarm` es error y        │
 * │ peligro, y una empresa esperando no es ninguna de las dos cosas. La campana del producto usa    │
 * │ `bg-text-dim`, que es justo el gris que aquí no valía.                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Con 0 no pinta nada: una insignia con un cero es ruido que enseña a no mirarla.
 */
export function InsigniaPendientes({
  n,
  etiqueta,
}: {
  n: number;
  /** Lo que se lee con lector de pantalla: «3 empresas por verificar», no «3». */
  etiqueta: string;
}) {
  const texto = textoInsignia(n);
  if (!texto) return null;
  return (
    <span
      data-insignia={n}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-text px-1.5 text-2xs font-semibold tabular-nums text-void"
    >
      <span aria-hidden="true">{texto}</span>
      <span className="sr-only">{etiqueta}</span>
    </span>
  );
}
