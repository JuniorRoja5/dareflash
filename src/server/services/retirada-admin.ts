import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  claveReembolso,
  devuelveDinero,
  siguientesEstados,
  transicionValida,
  type EstadoRetirada,
} from "@/lib/retirada";
import { descifrarDatoDePago } from "@/server/security/cifrado-pagos";

import { applyWallet } from "./ledger";

/**
 * EL PANEL DE RETIRADAS — ver la cola y moverla de estado.
 *
 * ┌─ EL DINERO YA SALIÓ AL SOLICITAR ─────────────────────────────────────────────────────────────┐
 * │ Aprobar, poner en proceso o finalizar NO mueven saldo: son anotaciones de lo que el admin     │
 * │ está haciendo POR FUERA de DareFlash (la transferencia la hace a mano). La ÚNICA transición   │
 * │ que mueve dinero es RECHAZAR, que lo devuelve. Si aprobar también moviera algo, el importe    │
 * │ saldría dos veces del monedero y nadie lo vería hasta cuadrar los libros.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUÉ UNA MÁQUINA DE ESTADOS Y NO UN `status = loQueDiga` ─────────────────────────────────┐
 * │ `PAID` y `REJECTED` son FINALES. Volver a rechazar una rechazada devolvería el dinero DOS     │
 * │ veces; volver a "pagar" una pagada invita a transferir otra vez. Y saltar de PENDING a PAID   │
 * │ directo se salta el único punto donde alguien mira el IBAN antes de mandar dinero. La tabla   │
 * │ de transiciones vive en `lib/retirada`, es pura y se prueba sola.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type RechazoTransicion = "NO_EXISTE" | "TRANSICION_INVALIDA";

export interface ResultadoTransicion {
  ok: boolean;
  rechazo: RechazoTransicion | null;
  /** El estado en el que ha quedado (el nuevo, o el que ya tenía si se rechazó la transición). */
  estado: EstadoRetirada | null;
  /** Céntimos devueltos al monedero. 0 en todo lo que no sea rechazar. */
  devueltoCents: number;
}

/**
 * Mueve una retirada de estado.
 *
 * EL REEMBOLSO ES IDEMPOTENTE POR CONSTRUCCIÓN: su clave sale de la retirada
 * (`claveReembolso`), no del momento ni de quién pulsa. Aunque dos admins rechacen a la vez, o
 * alguien reintente, el `CREDIT` entra UNA vez. Y aunque la clave fallara, la máquina de estados
 * ya impide volver a salir de `REJECTED` — son dos cierres independientes sobre el mismo error,
 * que en dinero es lo que corresponde.
 *
 * EL ORDEN IMPORTA: primero se devuelve el dinero y DESPUÉS se marca el estado. Al revés, un fallo
 * entre medias dejaría la retirada en `REJECTED` —un estado final, del que ya no se sale— con el
 * dinero fuera del monedero y sin nadie que vuelva a intentarlo. Así, si falla el crédito, la
 * retirada se queda donde estaba y se puede volver a rechazar.
 */
export async function transicionarRetirada(
  db: PrismaClient,
  input: { retiradaId: string; adminId: string; hasta: EstadoRetirada },
): Promise<ResultadoTransicion> {
  const fila = await db.withdrawal.findUnique({
    where: { id: input.retiradaId },
    select: { id: true, userId: true, amountCents: true, currency: true, status: true },
  });
  if (!fila) return { ok: false, rechazo: "NO_EXISTE", estado: null, devueltoCents: 0 };

  const desde = fila.status as EstadoRetirada;
  if (!transicionValida(desde, input.hasta)) {
    return { ok: false, rechazo: "TRANSICION_INVALIDA", estado: desde, devueltoCents: 0 };
  }

  let devueltoCents = 0;
  if (devuelveDinero(input.hasta)) {
    const r = await applyWallet(db, {
      userId: fila.userId,
      // EL IMPORTE EXACTO de la retirada, ni más ni menos: devolver "lo que quedaba" o un redondeo
      // sería inventar una cifra. Lo que salió es lo que vuelve.
      amountCents: fila.amountCents,
      currency: fila.currency,
      entryType: "CREDIT",
      refType: "WITHDRAWAL_REFUND",
      refId: fila.id,
      idempotencyKey: claveReembolso(fila.id),
    });
    if (r.applied) devueltoCents = fila.amountCents;
  }

  // La guarda de la carrera: solo gana quien encuentra la fila TODAVÍA en el estado de partida. Dos
  // admins pulsando a la vez — uno "aprobar", otro "rechazar" — y solo uno escribe.
  const movida = await db.withdrawal.updateMany({
    where: { id: fila.id, status: desde },
    data: {
      status: input.hasta,
      procesadaPorId: input.adminId,
      procesadaEn: new Date(),
    },
  });
  if (movida.count === 0) {
    return { ok: false, rechazo: "TRANSICION_INVALIDA", estado: desde, devueltoCents };
  }

  // LA TRAZA. Es dinero: quién, cuándo y de qué estado a cuál. Los DATOS DE PAGO no entran aquí —
  // un `AuditLog` se lee, se exporta y se copia; un IBAN dentro sería una fuga por la puerta de
  // atrás, y además no hace falta para auditar una transición.
  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      action: "WITHDRAWAL_TRANSITION",
      targetType: "WITHDRAWAL",
      targetId: fila.id,
      metadata: {
        desde,
        hasta: input.hasta,
        userId: fila.userId,
        amountCents: fila.amountCents,
        devueltoCents,
      },
    },
  });

  return { ok: true, rechazo: null, estado: input.hasta, devueltoCents };
}

export interface RetiradaPanel {
  id: string;
  userId: string;
  username: string;
  displayName: string | null;
  amountCents: number;
  currency: string;
  estado: EstadoRetirada;
  metodo: string;
  red: string | null;
  createdAt: Date;
  /** Los datos de pago YA DESCIFRADOS. Solo salen de aquí hacia el panel del admin. */
  destino: Record<string, string>;
  /** A dónde se puede ir desde aquí, para pintar SOLO los botones que existen. */
  siguientes: readonly EstadoRetirada[];
}

/**
 * LA COLA DEL PANEL, con los datos de pago DESCIFRADOS.
 *
 * Es el único sitio del producto donde un IBAN vuelve a estar en claro, y es a propósito: el admin
 * no puede hacer la transferencia sin verlo. Lo que NO ocurre en ningún punto es que se escriban en
 * un log — ni aquí, ni en el `AuditLog`, ni en el error si el descifrado falla.
 *
 * UN DATO QUE NO SE PUEDE DESCIFRAR NO TUMBA LA LISTA. Puede pasar si el secreto rota mal: se marca
 * la fila y se sigue, porque el admin necesita ver el RESTO de la cola igual. Lo que no se hace es
 * enseñar un hueco silencioso.
 */
export async function listarRetiradas(
  db: PrismaClient,
  opts: { estado?: EstadoRetirada; limite?: number } = {},
): Promise<RetiradaPanel[]> {
  const filas = await db.withdrawal.findMany({
    where: opts.estado ? { status: opts.estado } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limite ?? 100,
    select: {
      id: true,
      userId: true,
      amountCents: true,
      currency: true,
      status: true,
      metodo: true,
      red: true,
      datosPago: true,
      createdAt: true,
    },
  });

  const usuarios = await db.user.findMany({
    where: { id: { in: filas.map((f) => f.userId) } },
    select: { id: true, username: true, displayName: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u]));

  return filas.map((f) => {
    let destino: Record<string, string>;
    try {
      destino = JSON.parse(descifrarDatoDePago(f.datosPago)) as Record<string, string>;
    } catch {
      // Sin detalle del error y sin el valor: lo que falló ya se sabe por el marcador.
      destino = { error: "No se ha podido descifrar. Revisa la clave de pagos." };
    }
    const u = porId.get(f.userId);
    return {
      id: f.id,
      userId: f.userId,
      username: u?.username ?? "(cuenta borrada)",
      displayName: u?.displayName ?? null,
      amountCents: f.amountCents,
      currency: f.currency,
      estado: f.status as EstadoRetirada,
      metodo: f.metodo,
      red: f.red,
      createdAt: f.createdAt,
      destino,
      siguientes: siguientesEstados(f.status as EstadoRetirada),
    };
  });
}
