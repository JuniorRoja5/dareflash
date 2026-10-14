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
 * REEMPLAZA un método: borra el viejo y guarda el nuevo, en UNA transacción.
 *
 * ┌─ POR QUÉ "REEMPLAZAR" Y NO "EDITAR" ──────────────────────────────────────────────────────────┐
 * │ Un editor de verdad tendría que RELLENAR el formulario con el IBAN guardado, y ese dato no     │
 * │ vuelve del servidor ni para su dueño: el DTO no lo lleva (es la puerta que impide que la PII   │
 * │ financiera ande suelta). Así que "editar" es inevitablemente volver a escribirlo entero. Lo    │
 * │ que la pantalla llama Editar es esto, y lo dice: se teclea de nuevo y sustituye al anterior.   │
 * │                                                                                                │
 * │ EN UNA TRANSACCIÓN, y no borrar-y-luego-crear desde el cliente, por dos motivos: un fallo      │
 * │ entre medias dejaría a la persona SIN método (y con el IBAN ya escrito, perdido), y el TOPE se │
 * │ cuenta después del borrado, así que quien tiene los cinco puede cambiar uno sin que le salte   │
 * │ "ya tienes todos los que caben".                                                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NO TOCA LAS SOLICITUDES EN CURSO, igual que borrar: cada retirada se quedó con su propia copia
 * cifrada al pedirse. Cambiar dónde quieres cobrar MAÑANA no reescribe a dónde iba un pago de AYER.
 */
export async function reemplazarMetodoPago(
  db: PrismaClient,
  input: { userId: string; metodoId: string; destino: DestinoRetirada },
): Promise<{ ok: true; id: string } | { ok: false; rechazo: RechazoMetodo }> {
  const forma = validarDestino(input.destino);
  if (!forma.ok) return { ok: false, rechazo: forma.motivo };
  if (!cifradoDePagosDisponible()) return { ok: false, rechazo: "SIN_CIFRADO" };

  // Se cifra ANTES de abrir la transacción: así la transacción solo contiene las dos escrituras y no
  // se queda esperando a una operación de CPU con filas tomadas.
  const datosPago = cifrarDatoDePago(serializarDestino(input.destino));
  const pista = pistaDeDestino(colaDelDestino(input.destino));

  return db.$transaction(async (tx) => {
    // ┌─ EL TOPE SE DECIDE ANTES DE BORRAR, y esto es un fallo que casi escribo ────────────────────┐
    // │ La primera versión borraba, contaba y devolvía `DEMASIADOS` si no cabía. Pero una           │
    // │ transacción interactiva de Prisma solo revierte si el callback LANZA: devolver un valor la  │
    // │ CONFIRMA. O sea que ese rechazo habría dejado a la persona sin su método y con el IBAN      │
    // │ recién tecleado perdido — un "no se ha podido" que sí hizo algo, que es la peor clase.      │
    // │ Decidiendo antes, el único camino que borra es el que también crea.                         │
    // └─────────────────────────────────────────────────────────────────────────────────────────────┘
    // La autorización, en el `where`: el método de otra persona no cuenta como "el que sustituyo",
    // así que la operación se trata como un alta normal y el tope decide.
    const sustituye = await tx.paymentMethod.count({
      where: { id: input.metodoId, userId: input.userId },
    });
    const cuantos = await tx.paymentMethod.count({ where: { userId: input.userId } });
    if (cuantos - sustituye >= MAX_METODOS_PAGO) {
      return { ok: false as const, rechazo: "DEMASIADOS" as const };
    }

    if (sustituye > 0) {
      await tx.paymentMethod.deleteMany({ where: { id: input.metodoId, userId: input.userId } });
    }

    const fila = await tx.paymentMethod.create({
      data: {
        userId: input.userId,
        metodo: input.destino.metodo,
        datosPago,
        pista,
        red: input.destino.metodo === "CRYPTO" ? input.destino.red : null,
      },
      select: { id: true },
    });
    return { ok: true as const, id: fila.id };
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
