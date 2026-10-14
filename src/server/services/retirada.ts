import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_CURRENCY } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  claveRetirada,
  colaDelDestino,
  evaluarImporte,
  serializarDestino,
  validarDestino,
  type DestinoRetirada,
  type RechazoDestino,
  type RechazoImporte,
} from "@/lib/retirada";
import {
  cifradoDePagosDisponible,
  cifrarDatoDePago,
  pistaDeDestino,
} from "@/server/security/cifrado-pagos";

import { applyWallet, LedgerError } from "./ledger";

/**
 * SOLICITAR UNA RETIRADA. El dinero sale del monedero EN ESTE MISMO INSTANTE.
 *
 * ┌─ POR QUÉ SE DEBITA AL PEDIR Y NO AL PAGAR ────────────────────────────────────────────────────┐
 * │ La alternativa —dejar el saldo intacto hasta que el admin transfiera— crea un estado en el    │
 * │ que el dinero está pedido Y disponible a la vez. Ese estado se puede pedir otra vez: dos      │
 * │ solicitudes de 50 € con 50 € de saldo, las dos "válidas", y alguien paga 100 €. Debitar al    │
 * │ pedir cierra esa puerta sin un solo `if`: el segundo intento se queda sin saldo él solo.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LA FILA Y EL DÉBITO VAN JUNTOS O NO VA NINGUNO ──────────────────────────────────────────────┐
 * │ La `Withdrawal` se inserta dentro de `trasAplicar`, o sea en la MISMA transacción del ledger  │
 * │ y con el `User` todavía bloqueado. Si fueran dos pasos, un fallo entre medias dejaría una de  │
 * │ dos ruinas: dinero debitado sin ninguna retirada que lo explique —la persona pierde el saldo  │
 * │ y no hay a qué agarrarse—, o una retirada sin débito, que se paga con dinero que sigue en el  │
 * │ monedero. Las dos son descuadres de dinero, que aquí no son bugs menores.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SALE EL IMPORTE SOLICITADO, NO MENOS. Las comisiones de red o de banco reducen lo que LLEGA, no lo
 * que sale: así los libros cuadran en lo pedido y la comisión queda entre la red y quien cobra. Aquí
 * no se resta nada ni se estima nada — estimar una comisión sería inventar una cifra de dinero.
 */

export type RechazoRetirada = RechazoImporte | RechazoDestino | "SIN_CIFRADO" | "USUARIO_NO_EXISTE";

export interface ResultadoSolicitud {
  ok: boolean;
  /** `null` si salió bien. */
  rechazo: RechazoRetirada | null;
  /** La retirada creada, o la que ya existía si el envío estaba repetido. */
  retiradaId: string | null;
  /** false cuando la clave ya se había usado: el doble envío no cobra dos veces. */
  creada: boolean;
  saldoCents: number;
}

export async function solicitarRetirada(
  db: PrismaClient,
  input: {
    userId: string;
    importeCents: number;
    destino: DestinoRetirada;
    /** Del formulario (uuid). Dos envíos del mismo intento comparten clave y debitan una vez. */
    clave: string;
    /** Inyectable para los tests; en producción lo genera esta función. */
    retiradaId?: string;
  },
): Promise<ResultadoSolicitud> {
  // LA FORMA ANTES QUE EL DINERO: un destino inválido no debe ni llegar a tocar el saldo, y además
  // así el rechazo es el que la persona puede arreglar (su IBAN), no uno genérico.
  const destino = validarDestino(input.destino);
  if (!destino.ok) {
    return { ok: false, rechazo: destino.motivo, retiradaId: null, creada: false, saldoCents: 0 };
  }

  // SIN CIFRADO NO SE PIDEN DATOS DE PAGO. Se comprueba ANTES de tocar el saldo para no debitar a
  // alguien y descubrir después que su IBAN no se puede guardar. Ver `cifrado-pagos`: falla cerrada.
  if (!cifradoDePagosDisponible()) {
    return { ok: false, rechazo: "SIN_CIFRADO", retiradaId: null, creada: false, saldoCents: 0 };
  }

  const usuario = await db.user.findUnique({
    where: { id: input.userId },
    select: { walletBalanceCents: true },
  });
  if (!usuario) {
    return {
      ok: false,
      rechazo: "USUARIO_NO_EXISTE",
      retiradaId: null,
      creada: false,
      saldoCents: 0,
    };
  }

  // Comprobación TEMPRANA del importe, solo para dar un mensaje útil sin debitar nada. La de verdad
  // es la del ledger, que corre con la fila bloqueada: entre esta lectura y el débito puede caber
  // otra solicitud, y quien decide es el `FOR UPDATE`, no este `if`.
  const importe = evaluarImporte(input.importeCents, usuario.walletBalanceCents);
  if (!importe.ok) {
    return {
      ok: false,
      rechazo: importe.motivo,
      retiradaId: null,
      creada: false,
      saldoCents: usuario.walletBalanceCents,
    };
  }

  const retiradaId = input.retiradaId ?? randomUUID();
  const idempotencyKey = claveRetirada(input.userId, input.clave);
  const cifrado = cifrarDatoDePago(serializarDestino(input.destino));
  const pista = pistaDeDestino(colaDelDestino(input.destino));

  try {
    const r = await applyWallet(db, {
      userId: input.userId,
      // NEGATIVO: el ledger lleva el signo. La `Withdrawal` guarda el importe en positivo, que es lo
      // que la persona pidió y lo que se le va a transferir.
      amountCents: -input.importeCents,
      currency: DEFAULT_CURRENCY,
      entryType: "DEBIT",
      refType: "WITHDRAWAL",
      refId: retiradaId,
      idempotencyKey,
      trasAplicar: async (tx) => {
        await tx.withdrawal.create({
          data: {
            id: retiradaId,
            userId: input.userId,
            amountCents: input.importeCents,
            currency: DEFAULT_CURRENCY,
            status: "PENDING",
            metodo: input.destino.metodo,
            datosPago: cifrado,
            pista,
            red: input.destino.metodo === "CRYPTO" ? input.destino.red : null,
            idempotencyKey,
          },
        });
      },
    });

    if (!r.applied) {
      // EL DOBLE ENVÍO. La clave ya se usó, así que no se ha debitado nada esta vez: se devuelve la
      // retirada que ya existe, no una nueva. Que el formulario se envíe dos veces es lo normal
      // (doble clic, reintento del móvil); que cobre dos veces, no.
      const yaExiste = await db.withdrawal.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      return {
        ok: true,
        rechazo: null,
        retiradaId: yaExiste?.id ?? null,
        creada: false,
        saldoCents: r.balance,
      };
    }

    return { ok: true, rechazo: null, retiradaId, creada: true, saldoCents: r.balance };
  } catch (e) {
    // El saldo lo decide la transacción, no la lectura de antes: si otra solicitud se coló en medio,
    // el ledger lo ve y rechaza. Aquí se traduce a algo que la persona entiende.
    if (e instanceof LedgerError && e.code === "INSUFFICIENT_BALANCE") {
      return {
        ok: false,
        rechazo: "SIN_SALDO",
        retiradaId: null,
        creada: false,
        saldoCents: usuario.walletBalanceCents,
      };
    }
    throw e;
  }
}

/**
 * EL HISTORIAL PROPIO. Este DTO es la PUERTA: lo que no esté aquí no sale del servidor.
 *
 * `datosPago` NO está, y no por olvido: es PII financiera cifrada y no tiene nada que hacer en una
 * respuesta de usuario —ni siquiera la suya—, porque el cliente no necesita su IBAN para pintar una
 * lista y cada sitio por el que viaja un dato es un sitio donde puede quedarse. Lo que se enseña es
 * `pista`, que son cuatro caracteres y sirve para reconocer la fila. Es la misma disciplina que la
 * nota del ajuste de Boost: la puerta es el DTO, no el `select`.
 */
export interface RetiradaPropia {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  metodo: string;
  pista: string;
  red: string | null;
  createdAt: Date;
}

export async function misRetiradas(
  db: PrismaClient,
  userId: string,
  limite = 20,
): Promise<RetiradaPropia[]> {
  const filas = await db.withdrawal.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite,
    select: {
      id: true,
      amountCents: true,
      currency: true,
      status: true,
      metodo: true,
      pista: true,
      red: true,
      createdAt: true,
    },
  });
  return filas;
}
