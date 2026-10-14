import "server-only";

import { randomUUID } from "node:crypto";

import { DEFAULT_CURRENCY } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { claveRetirada, evaluarImporte, type RechazoImporte } from "@/lib/retirada";

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
 *
 * EL DESTINO YA NO SE TECLEA AQUÍ: se elige un método GUARDADO y la retirada se queda con una COPIA
 * cifrada de sus datos. Por eso este camino ya no cifra nada —solo copia un blob que ya lo está—, y
 * por eso no comprueba `PAGOS_SECRET`: la puerta del cifrado está donde se GUARDA el método, que es
 * donde el dato entra en claro. Ver `metodos-pago`.
 */

export type RechazoRetirada = RechazoImporte | "METODO_NO_EXISTE" | "USUARIO_NO_EXISTE";

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
    /** Un método YA GUARDADO de esta persona. Los datos no se vuelven a teclear. */
    metodoPagoId: string;
    /** Del formulario (uuid). Dos envíos del mismo intento comparten clave y debitan una vez. */
    clave: string;
    /** Inyectable para los tests; en producción lo genera esta función. */
    retiradaId?: string;
  },
): Promise<ResultadoSolicitud> {
  // LA AUTORIZACIÓN VA EN EL `where`, no en un `if` después de leer: un método de otra persona
  // sencillamente no se encuentra, y se responde lo mismo que si no existiera. Nadie averigua por
  // la respuesta si el método de otro existe.
  const metodo = await db.paymentMethod.findFirst({
    where: { id: input.metodoPagoId, userId: input.userId },
    select: { metodo: true, datosPago: true, pista: true, red: true },
  });
  if (!metodo) {
    return {
      ok: false,
      rechazo: "METODO_NO_EXISTE",
      retiradaId: null,
      creada: false,
      saldoCents: 0,
    };
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
            // ┌─ LA COPIA (SNAPSHOT), Y POR QUÉ NO UNA REFERENCIA AL MÉTODO ─────────────────────┐
            // │ La retirada se queda con los datos TAL CUAL estaban al pedirla, ya cifrados: se  │
            // │ copia el blob sin descifrarlo, así que el IBAN no llega a estar en claro ni en   │
            // │ memoria por este camino. Si apuntara al `PaymentMethod`, cambiar o borrar el     │
            // │ método reescribiría —o borraría— a dónde iba un pago YA PEDIDO, y el admin se    │
            // │ encontraría una solicitud pendiente sin destino, o con otro. Lo que se pidió no  │
            // │ se puede editar después.                                                         │
            // └──────────────────────────────────────────────────────────────────────────────────┘
            metodo: metodo.metodo,
            datosPago: metodo.datosPago,
            pista: metodo.pista,
            red: metodo.red,
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
  /**
   * Cuándo se movió por última vez (la aceptó, la puso en camino, la pagó o la rechazó). Es el ÚNICO
   * instante de transición que la fila guarda: no hay una fecha por paso, así que la vista no puede
   * decir "aceptada el 13" y "pagada el 14" — diría dos fechas y solo una es un dato.
   */
  actualizadaEn: Date | null;
}

export interface PaginaRetiradas {
  items: RetiradaPropia[];
  /** Cursor OPACO de la página siguiente; `null` = no hay más. */
  nextCursor: string | null;
}

/** Tope duro por página: el cliente no elige cuánto se le sirve. */
const LIMITE_MAX = 20;

interface PosicionRetirada {
  creadoMs: number;
  id: string;
}

/**
 * El cursor lleva la TUPLA COMPLETA del orden (instante, id), no solo el id: la referencia es un
 * VALOR de orden, no una fila que tenga que seguir existiendo. Mismo codec que la bandeja de avisos.
 */
function codificarCursor(p: PosicionRetirada): string {
  return `${p.creadoMs}.${p.id}`;
}

/** Cursor inválido o manipulado -> primera página. Nunca una excepción por un query param. */
function decodificarCursor(raw: string | null | undefined): PosicionRetirada | null {
  if (!raw) return null;
  const m = /^(\d{1,15})\.([A-Za-z0-9_-]{1,64})$/.exec(raw);
  if (!m?.[1] || !m[2]) return null;
  const creadoMs = Number(m[1]);
  if (!Number.isSafeInteger(creadoMs)) return null;
  return { creadoMs, id: m[2] };
}

/**
 * Una página del historial propio, las más recientes primero.
 *
 * KEYSET, JAMÁS OFFSET. Aquí el motivo es concreto: el histórico se lee de arriba abajo y mientras
 * tanto la persona puede pedir OTRO cobro, que entra por arriba. Con `OFFSET 20`, esa fila nueva
 * desplaza la ventana y la segunda página REPITE la última de la primera. Con `(createdAt, id) <
 * (t, i)` la referencia es un valor de orden y nada se repite ni se salta. Recorre de una pasada el
 * índice [userId, createdAt, id], que ya existía.
 */
/**
 * UN MOVIMIENTO DEL MONEDERO, dicho para su dueño.
 *
 * ┌─ ESTE DTO TIENE UN CAMPO QUE NO EXISTE A PROPÓSITO ───────────────────────────────────────────┐
 * │ `refId`. En un ajuste manual, el `refId` de la fila es el ID DEL ADMIN que lo firmó, y eso no │
 * │ se le enseña al dueño de la cuenta —es la misma regla que mantiene fuera del historial propio │
 * │ la nota y el handle del ajuste de puntos—. Como el concepto se deriva de `refType`, el `refId`│
 * │ no hace falta para nada aquí, así que no se selecciona siquiera.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface MovimientoMonedero {
  id: string;
  /** Con signo: positivo entra, negativo sale. El importe en céntimos, como todo el dinero. */
  amountCents: number;
  currency: string;
  /** Clave del concepto (`refType`). La frase la pone el copy, no la fila. */
  concepto: string | null;
  createdAt: Date;
}

/**
 * LOS ÚLTIMOS MOVIMIENTOS DEL MONEDERO. Existe porque el saldo tenía que poder explicarse: desde que
 * el admin puede ajustarlo, una cuenta puede ver su dinero cambiar sin una sola línea que lo cuente,
 * y un saldo que se mueve solo es indistinguible de un error.
 *
 * ES UN TOPE, NO UNA PÁGINA, y la pantalla lo dice ("últimos movimientos"). No se pagina por dos
 * razones honestas: `WalletLedger` solo tiene índice por `userId` —un keyset por `(createdAt, id)`
 * se apoyaría en una ordenación en memoria, y el índice compuesto es una migración que esta pieza no
 * lleva—, y una lista que no promete ser completa no necesita un "ver más" que lo parezca. El día
 * que haga falta el histórico entero, lo que toca es el índice y el mismo keyset de `misRetiradas`.
 */
export async function misMovimientosMonedero(
  db: PrismaClient,
  userId: string,
  limite = 10,
): Promise<MovimientoMonedero[]> {
  const filas = await db.walletLedger.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(1, Math.floor(limite)), 50),
    // `refId` NO: ver el docblock del DTO. En un ajuste es el id del admin.
    select: { id: true, amountCents: true, currency: true, refType: true, createdAt: true },
  });
  return filas.map(({ refType, ...f }) => ({ ...f, concepto: refType }));
}

export async function misRetiradas(
  db: PrismaClient,
  userId: string,
  opts: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaRetiradas> {
  const limite = Math.min(Math.max(1, Math.floor(opts.limite ?? LIMITE_MAX)), LIMITE_MAX);
  const desde = decodificarCursor(opts.cursor);

  const filas = await db.withdrawal.findMany({
    where: {
      userId,
      ...(desde
        ? {
            OR: [
              { createdAt: { lt: new Date(desde.creadoMs) } },
              { createdAt: new Date(desde.creadoMs), id: { lt: desde.id } },
            ],
          }
        : {}),
    },
    // DESC en las DOS columnas: una sola pasada del índice hacia atrás.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // Una de más: así se sabe si hay página siguiente sin un `count` aparte.
    take: limite + 1,
    select: {
      id: true,
      amountCents: true,
      currency: true,
      status: true,
      metodo: true,
      pista: true,
      red: true,
      createdAt: true,
      procesadaEn: true,
    },
  });

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  const ultima = pagina[pagina.length - 1];

  return {
    items: pagina.map(({ procesadaEn, ...r }) => ({ ...r, actualizadaEn: procesadaEn })),
    nextCursor:
      hayMas && ultima
        ? codificarCursor({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}
