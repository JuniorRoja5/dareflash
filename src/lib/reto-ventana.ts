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

/**
 * EN QUÉ PUNTO ESTÁ EL RETO PARA EL PÚBLICO. Tres fases, no dos.
 *
 * ┌─ EL FALLO QUE ESTO ARREGLA ────────────────────────────────────────────────────────────────┐
 * │ El lado público solo sabía "abierto" o "no abierto", así que un reto que AÚN NO HA EMPEZADO │
 * │ caía en el mismo saco que uno vencido: el detalle le ponía "Reto cerrado" y la tarjeta       │
 * │ contaba atrás hacia su cierre. Las dos cosas son datos FALSOS sobre un reto que ni siquiera  │
 * │ ha abierto, y en una pantalla que existe para que la gente participe.                         │
 * │                                                                                               │
 * │ El panel ya distinguía "programado" (`estadoRetoAdmin`); el público no. El dato estaba, la    │
 * │ fase no.                                                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE DERIVA DE `retoEstaAbierto`, no en paralelo: "abierto" es exactamente lo que diga esa función
 * —la misma que aplica el servidor al aceptar un voto— y las otras dos fases solo reparten lo que
 * queda. Calcularlo por separado volvería a abrir la puerta a que la UI prometa lo que la API
 * rechaza, que es justo lo que `retoEstaAbierto` nació para cerrar.
 */
export type FaseReto = "proximamente" | "abierto" | "cerrado";

export function faseDelReto(
  reto: { status: string; startsAt: Instante; deadline: Instante },
  ahora: Instante = Date.now(),
): FaseReto {
  if (retoEstaAbierto(reto, ahora)) return "abierto";
  // PUBLICADO y con la apertura por delante: aún no empieza. El orden importa — un reto cuyo
  // cierre ya pasó NO es "próximamente" aunque alguien le pusiera una apertura futura (sería una
  // fila incoherente, y en la duda se dice lo conservador: cerrado).
  const t = ms(ahora);
  if (reto.status === "PUBLISHED" && ms(reto.startsAt) > t && ms(reto.deadline) > t) {
    return "proximamente";
  }
  return "cerrado";
}

/**
 * A QUÉ INSTANTE APUNTA LA CUENTA ATRÁS de un reto: a su APERTURA mientras no ha empezado, y a su
 * CIERRE una vez abierto. `null` cuando ya cerró y no hay nada que contar.
 *
 * Vive aquí, con la fase, porque es la misma decisión vista desde la UI: separarlas sería tener dos
 * sitios que pueden discrepar sobre si el reto ya empezó.
 */
export function instanteDeCuenta(
  reto: { status: string; startsAt: Instante; deadline: Instante },
  ahora: Instante = Date.now(),
): { fase: FaseReto; objetivoMs: number | null } {
  const fase = faseDelReto(reto, ahora);
  if (fase === "proximamente") return { fase, objetivoMs: ms(reto.startsAt) };
  if (fase === "abierto") return { fase, objetivoMs: ms(reto.deadline) };
  return { fase, objetivoMs: null };
}
