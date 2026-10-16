import "server-only";

import { claveDia } from "@/lib/racha";
import { avisoToque } from "@/lib/notificaciones";
import type { Db } from "@/server/db/types";

import { emitirAviso } from "./notificaciones";
import { esVipActivoDe } from "./vip";

/**
 * DAR UN TOQUE (Fase 8 · P4) — un VIP saluda a otro perfil y esa persona recibe un aviso.
 *
 * Es la función más pequeña del producto que toca a OTRA persona sin que haya nada de por medio:
 * ni un vídeo, ni un voto, ni un reto. Eso es justo lo que la hace delicada, porque lo que un
 * desconocido puede mandarte sin motivo es, en potencia, acoso. El anti-acoso son DOS capas
 * distintas, y hacen falta las dos porque miden cosas distintas:
 *
 *   1. A -> B, UNA VEZ AL DÍA. La fuerza la CLAVE ÚNICA del aviso (emisor + día; ver `avisoToque`),
 *      no un `if`: dos peticiones a la vez y la segunda no escribe. Un `SELECT` previo sería una
 *      carrera con una ventana pequeña pero real.
 *   2. CUÁNTAS PERSONAS AL DÍA. Eso la clave no lo ve —cada pareja es un hecho distinto—, así que
 *      lo acota el cubo por emisor (`TOQUE_PER_USER`), y vive en la RUTA, que es donde están los
 *      cubos del resto del producto.
 *
 * ┌─ VETO DEL DEADLOCK: AQUÍ NO HAY TRANSACCIÓN, Y ES A PROPÓSITO ──────────────────────────────┐
 * │ La emisión es UNA escritura idempotente (INSERT IGNORE) y no mueve ningún saldo, así que no │
 * │ necesita envolverse en nada. Importa dejarlo dicho porque la tentación futura es juntarla   │
 * │ con algo que SÍ bloquee la fila del `User` —cobrar el toque, contar toques en el perfil—: en │
 * │ cuanto esto entre en una transacción que ya tiene un `FOR UPDATE` sobre `User`, se abre el   │
 * │ ciclo que el veto existe para evitar. Si algún día el toque tiene coste, el cobro va en su   │
 * │ transacción y el aviso FUERA, como ya hacen la racha y la marca VIP del comentario.         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type ResultadoToque =
  /** Escrito ahora: el receptor tiene un aviso nuevo. */
  | { estado: "enviado" }
  /** Ya le había tocado hoy. NO es un error: es el mismo hecho, y responde amable. */
  | { estado: "repetido" }
  /** Quien toca no es VIP activo. */
  | { estado: "no-vip" }
  /** A uno mismo, no. */
  | { estado: "a-ti-mismo" }
  /** El receptor no existe, está borrado o suspendido: el MISMO resultado que si no existiera. */
  | { estado: "no-disponible" };

/**
 * `ahora` se inyecta como en todo lo que depende del reloj: el día de la clave tiene que poder
 * fijarse desde un test, o el caso de "el mismo día" no se puede escribir.
 */
export async function darToque(
  db: Db,
  input: { emisorId: string; receptorId: string; ahora?: Date },
): Promise<ResultadoToque> {
  // PRIMERO lo que no cuesta una consulta. Darse un toque a uno mismo no es un abuso, es un
  // sinsentido, y cortarlo aquí evita además que cuente contra el cubo del emisor.
  if (input.emisorId === input.receptorId) return { estado: "a-ti-mismo" };

  const ahora = input.ahora ?? new Date();

  // EL GATE, por el chokepoint y no por un flag: `esVipActivoDe` mira el periodo, así que una
  // suscripción vencida con el estado todavía en ACTIVA no da acceso. Es la misma puerta que el
  // sello y el color; si esto preguntara por su cuenta habría dos verdades sobre quién es VIP.
  if (!(await esVipActivoDe(db, input.emisorId, ahora))) return { estado: "no-vip" };

  // El receptor tiene que existir y estar visible. MISMA respuesta para "no existe" que para
  // "suspendido": por construcción, quien prueba ids no averigua cuáles corresponden a cuentas.
  const receptor = await db.user.findFirst({
    where: { id: input.receptorId, deletedAt: null, bannedAt: null },
    select: { id: true },
  });
  if (!receptor) return { estado: "no-disponible" };

  // El handle del EMISOR, que es lo que se pinta. Se lee ahora y se guarda en el aviso: el aviso
  // es un registro de lo que pasó, y si alguien cambia su handle después el aviso viejo sigue
  // contando lo que contaba (mismo criterio que el autor de un comentario).
  const emisor = await db.user.findUnique({
    where: { id: input.emisorId },
    select: { username: true },
  });
  if (!emisor) return { estado: "no-disponible" };

  const escrito = await emitirAviso(
    db,
    input.receptorId,
    avisoToque({ emisorId: input.emisorId, autor: emisor.username, dia: claveDia(ahora) }),
  );
  return { estado: escrito ? "enviado" : "repetido" };
}
