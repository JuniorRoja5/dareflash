/**
 * ¿ESTÁ ABIERTO EL RETO? Regla ÚNICA, pura y compartida por servidor y UI.
 *
 * Existe porque estaba escrita dos veces con dos formas distintas: el servicio de voto exigía
 * `startsAt <= ahora` y la vista del detalle no lo miraba. Un reto PUBLISHED pero aún sin empezar se
 * pintaba abierto y el servidor rechazaba el voto con RETO_CERRADO — un botón que promete algo que la
 * API no cumple. La regla de "qué se puede votar" la fija el servidor, así que la UI tiene que leer
 * EXACTAMENTE la misma, no una parecida.
 *
 * Acepta milisegundos o `Date` porque los dos lados hablan distinto: Prisma devuelve `Date` y los DTO
 * que viajan al cliente serializan a número. Convertir en cada sitio de llamada era justo la clase de
 * detalle donde se cuela un `<` por un `<=`.
 */
type Instante = Date | number;

const ms = (i: Instante): number => (typeof i === "number" ? i : i.getTime());

export function retoEstaAbierto(
  reto: { status: string; startsAt: Instante; deadline: Instante },
  ahora: Instante = Date.now(),
): boolean {
  const t = ms(ahora);
  // `startsAt <= ahora` INCLUSIVO (justo al abrir ya se puede votar) y `deadline > ahora` ESTRICTO
  // (en el instante del cierre ya no). Son los mismos operadores que aplica `destinoVotable`.
  return reto.status === "PUBLISHED" && ms(reto.startsAt) <= t && ms(reto.deadline) > t;
}
