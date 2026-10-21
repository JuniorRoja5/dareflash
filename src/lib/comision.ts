/**
 * LA COMISIÓN DEL SPONSOR — aritmética pura, en CÉNTIMOS ENTEROS.
 *
 * ┌─ QUÉ ES Y QUÉ NO ES ─────────────────────────────────────────────────────────────────────────┐
 * │ Es lo que se le factura A LA MARCA, APARTE del premio. NO se le resta al ganador: el ganador  │
 * │ cobra el premio íntegro por el rail de siempre y nunca ve esta cifra. Vive en el panel de      │
 * │ admin, que es donde alguien cuadra lo que hay que cobrar.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIN FLOAT EN NINGÚN PASO. Se multiplica primero y se divide después (`premio * bps / 10000`), que
 * en enteros es exacto hasta el último céntimo; al revés (`premio * (bps/10000)`) el paréntesis ya
 * es un binario periódico y el error entra antes de empezar. Es la misma regla que el resto del
 * dinero del producto.
 *
 * ┌─ Y SE REDONDEA HACIA ABAJO, QUE NO ES LO MISMO QUE "REDONDEAR" ──────────────────────────────┐
 * │ Un premio de 999 con el 25% son 249,75 céntimos. El cuarto de céntimo no existe, así que hay  │
 * │ que elegir: 249 o 250. Se cobra 249.                                                           │
 * │                                                                                                │
 * │ El motivo es que esto es una FACTURA a un tercero: cobrar de más —aunque sea un céntimo— es un │
 * │ cargo que nadie aceptó, y con cien retos son cien conversaciones. Cobrar de menos es renunciar │
 * │ a una fracción de céntimo. El riesgo no es simétrico, así que la regla tampoco: nunca por      │
 * │ encima de lo pactado. Además es determinista y verificable a mano por quien revise la factura. │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** El divisor de los puntos básicos. 10000 bps = 100%. */
export const BPS = 10_000;

/**
 * La comisión de un reto, en céntimos enteros. Un premio de 0 —o unos bps de 0— dan 0: un reto
 * patrocinado sin premio no genera factura, y eso es un caso real (el sponsor pone el producto).
 *
 * DEFENSIVA CON LA ENTRADA porque los dos números vienen de la base de datos y uno de ellos lo
 * escribió una persona en un formulario: negativos y basura se tratan como 0 en vez de devolver un
 * importe negativo, que en una columna de "a cobrar" es una devolución que nadie pidió.
 */
export function comisionCents(premioCents: number, comisionBps: number): number {
  if (!Number.isFinite(premioCents) || !Number.isFinite(comisionBps)) return 0;
  const premio = Math.max(0, Math.trunc(premioCents));
  const bps = Math.max(0, Math.trunc(comisionBps));
  return Math.floor((premio * bps) / BPS);
}

/**
 * Lo que se le factura a la marca por ese reto: el premio que pone ella MÁS la comisión.
 *
 * EL PREMIO ESTÁ DENTRO, y es lo que hace útil la cifra: la marca paga el premio (que nosotros
 * adelantamos al ganador por el monedero) y encima la comisión. Quien cobra necesita UN número.
 */
export function totalSponsorCents(premioCents: number, comisionBps: number): number {
  const premio = Math.max(0, Math.trunc(premioCents));
  return premio + comisionCents(premioCents, comisionBps);
}

/**
 * EL PORCENTAJE QUE TECLEA EL ADMIN -> BPS ENTEROS. `null` si no es un porcentaje válido (0..100).
 *
 * Existe para que el redondeo ocurra UNA VEZ, en el formulario, y lo que viaje al servidor sea ya
 * el entero que se guarda. Si el formulario mandara "25.5" y el servidor hiciera la conversión,
 * habría dos sitios decidiendo cuántos bps es un porcentaje — y el día que uno trunque y el otro
 * redondee, la comisión guardada no sería la que el admin vio en pantalla.
 *
 * Acepta coma decimal: el teclado numérico de un móvil español escribe "25,5".
 */
export function porcentajeABps(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "" || !/^\d+(\.\d+)?$/.test(limpio)) return null;
  const pct = Number(limpio);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  // `Math.round` y no `floor`: aquí no se está cobrando nada todavía, se está traduciendo lo que
  // alguien escribió. "33.333" son 3333 bps, que es el bps más cercano a lo que quiso decir.
  return Math.round(pct * 100);
}

/**
 * Los bps como porcentaje legible ("25", "25.5"). Solo para PINTAR: no se vuelve a calcular dinero
 * a partir de esto —ahí es donde entraría el float que el resto del fichero evita—.
 */
export function bpsAPorcentaje(comisionBps: number): string {
  const bps = Math.max(0, Math.trunc(comisionBps));
  const entero = Math.floor(bps / 100);
  const resto = bps % 100;
  if (resto === 0) return String(entero);
  // Sin ceros a la derecha: 2550 -> "25.5", no "25.50".
  return `${entero}.${String(resto).padStart(2, "0").replace(/0$/, "")}`;
}
