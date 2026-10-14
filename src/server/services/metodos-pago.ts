import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  colaDelDestino,
  serializarDestino,
  validarDestino,
  type DestinoRetirada,
  type RechazoDestino,
} from "@/lib/retirada";
import {
  cifradoDePagosDisponible,
  cifrarDatoDePago,
  pistaDeDestino,
} from "@/server/security/cifrado-pagos";

/**
 * LOS MÉTODOS DE PAGO GUARDADOS — dónde quiere cobrar una persona, configurado una vez.
 *
 * ┌─ POR QUÉ SE GUARDAN Y NO SE TECLEAN EN CADA COBRO ────────────────────────────────────────────┐
 * │ Antes, cada solicitud pedía el IBAN o la dirección otra vez. Eso no es solo incómodo: cada    │
 * │ tecleo es una oportunidad de equivocarse en un número que, si es una dirección de cripto, NO  │
 * │ SE PUEDE RECUPERAR. Guardándolo, el error solo puede ocurrir una vez y en un momento en que   │
 * │ la persona está mirando precisamente eso.                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE GUARDAN CIFRADOS, con la misma clave y el mismo formato que la retirada. Y como allí, falla
 * CERRADA: sin `PAGOS_SECRET` no se cifra, y sin cifrar no se guarda.
 *
 * NO HAY "EDITAR": se añade y se borra. Editar un método que ya se usó en una solicitud pendiente
 * invitaría a creer que esa solicitud cambia de destino, y no cambia —la retirada se queda con una
 * copia—. Añadir y borrar dice la verdad sin tener que explicarla.
 */

export type RechazoMetodo = RechazoDestino | "SIN_CIFRADO" | "DEMASIADOS";

/** Un tope sano. No es una regla de producto: es que una lista de cuentas no es un cajón. */
export const MAX_METODOS_PAGO = 5;

export interface MetodoPagoPropio {
  id: string;
  metodo: string;
  /** Los cuatro últimos caracteres del destino. Lo ÚNICO que se enseña sin descifrar. */
  pista: string;
  red: string | null;
  createdAt: Date;
}

/**
 * Guarda un método. Devuelve el motivo del rechazo, no un booleano: quien llama tiene que poder
 * decirle a la persona QUÉ pasa, y "false" no se le enseña a nadie.
 */
export async function guardarMetodoPago(
  db: PrismaClient,
  input: { userId: string; destino: DestinoRetirada },
): Promise<{ ok: true; id: string } | { ok: false; rechazo: RechazoMetodo }> {
  // LA FORMA ANTES QUE NADA, y aquí es donde de verdad importa: esta es la única pantalla en la que
  // alguien escribe una dirección de cripto. Si pasa de aquí mal escrita, el error se congela en
  // todas las solicitudes futuras. Misma función que valida en el navegador: no pueden discrepar.
  const forma = validarDestino(input.destino);
  if (!forma.ok) return { ok: false, rechazo: forma.motivo };

  if (!cifradoDePagosDisponible()) return { ok: false, rechazo: "SIN_CIFRADO" };

  const cuantos = await db.paymentMethod.count({ where: { userId: input.userId } });
  if (cuantos >= MAX_METODOS_PAGO) return { ok: false, rechazo: "DEMASIADOS" };

  const fila = await db.paymentMethod.create({
    data: {
      userId: input.userId,
      metodo: input.destino.metodo,
      datosPago: cifrarDatoDePago(serializarDestino(input.destino)),
      pista: pistaDeDestino(colaDelDestino(input.destino)),
      red: input.destino.metodo === "CRYPTO" ? input.destino.red : null,
    },
    select: { id: true },
  });
  return { ok: true, id: fila.id };
}

/**
 * LOS MÉTODOS DE UNA PERSONA. Este DTO es la PUERTA: `datosPago` no está, y no por olvido — el
 * cliente no necesita el IBAN para pintar una lista, y cada sitio por el que viaja un dato es un
 * sitio donde puede quedarse. Lo que se enseña es `pista`.
 */
export async function misMetodosPago(
  db: PrismaClient,
  userId: string,
): Promise<MetodoPagoPropio[]> {
  return db.paymentMethod.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, metodo: true, pista: true, red: true, createdAt: true },
  });
}

/**
 * Borra un método. LA AUTORIZACIÓN VA EN EL `where`, no en un `if` después de leer: si la fila no
 * es de quien pide, el `deleteMany` borra cero y se responde lo mismo que si no existiera. Nadie
 * averigua por la respuesta si el método de otra persona existe.
 *
 * NO TOCA LAS SOLICITUDES EN CURSO: cada una guardó su propia copia cifrada al pedirse.
 */
export async function borrarMetodoPago(
  db: PrismaClient,
  input: { userId: string; metodoId: string },
): Promise<{ borrado: boolean }> {
  const r = await db.paymentMethod.deleteMany({
    where: { id: input.metodoId, userId: input.userId },
  });
  return { borrado: r.count > 0 };
}
