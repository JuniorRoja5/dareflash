/**
 * LO QUE HAY QUE SABER PARA ELEGIR UN PAQUETE DE BOOST (puro).
 *
 * ┌─ NADA DE ESTO SE ESCRIBE A MANO ──────────────────────────────────────────────────────────────┐
 * │ "$3 por Boost", "ahorras un 40%", "el mejor precio": son tres cifras que la pantalla PODRÍA   │
 * │ escribir en su JSX, y las tres serían un segundo catálogo esperando a discrepar del que se     │
 * │ cobra. Aquí se DERIVAN de `PAQUETES_BOOST`, que es el único sitio donde viven los precios, así │
 * │ que mover un precio mueve el porcentaje, el "por Boost" y la etiqueta de recomendado de golpe. │
 * │ Ya nos mordió con las categorías: dos listas, y la inválida acabó en producción.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EN CÉNTIMOS ENTEROS, como el resto del dinero del producto. Los tres paquetes dan división exacta
 * (500/1, 1500/5, 2000/10) pero no se da por supuesto: el céntimo por boost se redondea, porque un
 * paquete futuro de 3 por $10 daría 333,33 y un flotante en una cifra de dinero es un error esperando.
 *
 * SIN REACT NI SERVIDOR: se testea directo.
 */
import { PAQUETES_BOOST, type PaqueteBoost } from "@/config/constants";

export interface PaqueteEnVenta {
  clave: PaqueteBoost;
  boosts: number;
  precioCents: number;
  /** Céntimos POR BOOST. Es la única cifra que compara dos paquetes entre sí de verdad. */
  porBoostCents: number;
  /**
   * Cuánto se ahorra por boost frente al paquete MÁS CARO por unidad, en porcentaje entero. El más
   * caro sale a 0 y por eso no lleva etiqueta: "ahorras un 0%" es ruido con forma de oferta.
   */
  ahorroPct: number;
  /** El de mejor precio por boost. EXACTAMENTE uno (ver el desempate en `paquetesEnVenta`). */
  mejorPrecio: boolean;
}

/**
 * Los paquetes a la venta, de menos a más boosts: el orden en que se leen en pantalla, y el mismo en
 * los dos temas y los dos anchos.
 *
 * EL DESEMPATE DEL "MEJOR PRECIO" ES EXPLÍCITO: si dos paquetes salieran al mismo céntimo por boost,
 * gana el de MÁS boosts. No es una preferencia estética — sin regla, `reduce` elegiría el primero que
 * viera y la etiqueta bailaría al reordenar el catálogo. Y tiene que ser uno solo: dos "mejor precio"
 * en la misma fila no recomiendan nada.
 */
export function paquetesEnVenta(): PaqueteEnVenta[] {
  const base = (Object.keys(PAQUETES_BOOST) as PaqueteBoost[])
    .map((clave) => {
      const { boosts, precioCents } = PAQUETES_BOOST[clave];
      return { clave, boosts, precioCents, porBoostCents: Math.round(precioCents / boosts) };
    })
    .sort((a, b) => a.boosts - b.boosts);

  const masCaroPorBoost = Math.max(...base.map((p) => p.porBoostCents));
  const mejor = base.reduce((a, b) =>
    b.porBoostCents < a.porBoostCents ||
    (b.porBoostCents === a.porBoostCents && b.boosts > a.boosts)
      ? b
      : a,
  );

  return base.map((p) => ({
    ...p,
    ahorroPct: Math.round(((masCaroPorBoost - p.porBoostCents) / masCaroPorBoost) * 100),
    mejorPrecio: p.clave === mejor.clave,
  }));
}
