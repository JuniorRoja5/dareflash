/**
 * QUIÉN SALE EN LA PORTADA EN CADA MOMENTO. Puro: ni base de datos ni reloj propio.
 *
 * ┌─ LO QUE SE PROMETE, Y POR QUÉ ESTO LO CUMPLE ──────────────────────────────────────────────────┐
 * │ Cada activación da una hora en «Perfiles Boost» y AL MENOS 5 MINUTOS en portada dentro de esa  │
 * │ hora. Con 5 huecos y hasta 60 activaciones a la vez, la aritmética no deja margen: en una hora │
 * │ hay 60 ventanas de un minuto × 5 huecos = 300 minutos-hueco, y repartidos entre 60 personas    │
 * │ salen exactamente 5 cada una. O sea que el reparto tiene que ser EXACTO, no aproximado: una    │
 * │ rotación que "más o menos" reparta deja a alguien por debajo de lo prometido.                  │
 * │                                                                                                 │
 * │ Por eso no se rota sobre la lista de vigentes —que cambia cada minuto según quién entra y      │
 * │ sale, y donde la posición de cada uno se mueve bajo sus pies—, sino sobre CARRILES FIJOS.      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ CÓMO FUNCIONA ────────────────────────────────────────────────────────────────────────────────┐
 * │ Al activar, cada aparición recibe un CARRIL (0…11) que ya no cambia. La ventana de reloj `w`   │
 * │ abre por el carril `w mod 12` y va sumando los carriles siguientes hasta llenar los 5 huecos.  │
 * │                                                                                                 │
 * │ La garantía sale de dos hechos que se sostienen solos:                                          │
 * │  1. UN CARRIL NUNCA PASA DE 5 APARICIONES. No hace falta vigilarlo: si el total está capado en │
 * │     60 y cada nueva va al carril MENOS cargado, un carril solo llegaría a 6 si los doce         │
 * │     tuvieran ya 5 — y eso son 60, que es justo cuando no se admite ninguna más.                 │
 * │  2. UNA HORA SON 60 VENTANAS, Y 60 ES MÚLTIPLO DE 12. En 60 ventanas consecutivas, `w mod 12`  │
 * │     cae en un carril dado EXACTAMENTE 5 veces, empiece cuando empiece la hora.                  │
 * │                                                                                                 │
 * │ Juntos: en el peor caso —los otros carriles llenos, así que al llegar al tuyo ya no caben más— │
 * │ sales en tus 5 ventanas y en ninguna otra: 5 minutos. Si hay menos gente, los carriles de       │
 * │ delante no llenan los 5 huecos y sales TAMBIÉN en ventanas que no son la tuya: más de 5. Nunca  │
 * │ menos. Y con 5 o menos vigentes en total, todos caben siempre y nadie rota.                     │
 * │                                                                                                 │
 * │ EL BORDE DE LA VENTANA NO RESTA: una aparición que empieza a mitad de ventana vive 60 ventanas │
 * │ completas más dos trozos, y los dos trozos son del MISMO carril (60 mod 12 = 0), así que suman │
 * │ una ventana entera. Por eso la cuenta sigue dando 5 justas y no 4 y pico.                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MISMA VENTANA, MISMA PORTADA: la selección depende solo del índice de ventana y de la lista de
 * vigentes, no del visitante ni del instante exacto. Eso es lo que permite cachearla por ventana
 * (una clave por índice) sin que dos personas vean cosas distintas.
 */

/** Una aparición vigente, con lo mínimo que la rotación necesita para decidir. */
export interface AparicionRotable {
  id: string;
  userId: string;
  /** El carril que se le asignó al activar. Fijo durante toda su vida. */
  carril: number;
}

/**
 * En qué ventana de reloj cae un instante. Se cuenta desde la época, NO desde el arranque del
 * proceso ni desde la primera visita: dos servidores (o el mismo tras un reinicio) tienen que
 * calcular el mismo número para el mismo segundo, o la portada cambiaría según a quién le toque
 * responder.
 */
export function indiceVentana(ahoraMs: number, ventanaSeg: number): number {
  return Math.floor(ahoraMs / (ventanaSeg * 1000));
}

/**
 * Los que salen en portada en la ventana `indice`, en orden de presentación.
 *
 * `carriles` y `huecos` entran por parámetro (vienen de `constants`) para que esto se pueda simular
 * con otras cifras sin tocar el producto — que es como se comprueba que la garantía no depende de
 * los números concretos sino de la relación entre ellos.
 */
export function portadaDeVentana(
  vigentes: readonly AparicionRotable[],
  indice: number,
  opciones: { carriles: number; huecos: number },
): AparicionRotable[] {
  const { carriles, huecos } = opciones;
  if (huecos <= 0 || carriles <= 0) return [];

  // Agrupar por carril. El `% carriles` protege el caso de que alguien cambie el máximo y queden
  // apariciones vivas con un carril que ya no existe: entran por el carril equivalente en vez de
  // desaparecer de la portada durante una hora.
  const porCarril = new Map<number, AparicionRotable[]>();
  for (const a of vigentes) {
    const c = ((a.carril % carriles) + carriles) % carriles;
    const lista = porCarril.get(c);
    if (lista) lista.push(a);
    else porCarril.set(c, [a]);
  }
  // Orden estable dentro del carril: sin esto, dos consultas con el mismo contenido podrían
  // devolver órdenes distintos y la portada "temblaría" entre visitantes de la misma ventana.
  for (const lista of porCarril.values()) lista.sort((x, y) => (x.id < y.id ? -1 : 1));

  const salida: AparicionRotable[] = [];
  const yaPuesto = new Set<string>();
  const inicio = ((indice % carriles) + carriles) % carriles;

  for (let paso = 0; paso < carriles && salida.length < huecos; paso += 1) {
    const carril = (inicio + paso) % carriles;
    for (const a of porCarril.get(carril) ?? []) {
      if (salida.length >= huecos) break;
      // UNA PERSONA, UN HUECO: quien encadena dos boosts tiene dos apariciones vivas, y sin esto
      // ocuparía dos sitios de los cinco. Se queda la primera que salga por orden de carril.
      if (yaPuesto.has(a.userId)) continue;
      yaPuesto.add(a.userId);
      salida.push(a);
    }
  }
  return salida;
}
