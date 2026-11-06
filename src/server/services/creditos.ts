/**
 * CRÉDITOS DE PUBLICIDAD (Fase 9 · P4): el ledger de las empresas. 1 crédito = 1 día de anuncio.
 *
 * LAS MISMAS GARANTÍAS QUE `ledger.ts` (puntos, dinero, Boost), con un cambio de fila:
 *  - solo inserción: una fila de `CreditoLedger` por movimiento, nunca se edita ni se borra;
 *  - el saldo denormalizado (`Empresa.creditosSaldo`) se escribe en la MISMA transacción que la fila,
 *    con el VALOR CALCULADO (no un incremento) y con la fila de la empresa bloqueada (FOR UPDATE);
 *  - `idempotencyKey` ÚNICA: un hecho no se aplica dos veces;
 *  - enteros, y el saldo nunca baja de cero.
 *
 * ┌─ SE BLOQUEA `Empresa`, NUNCA `User` ──────────────────────────────────────────────────────────┐
 * │ `ledger.ts` bloquea la fila del User porque los saldos de puntos, dinero y Boost viven ahí. Los │
 * │ créditos viven en la empresa, y bloquear el User aquí sería anidar un segundo cerrojo en un     │
 * │ orden que ningún otro camino usa: el veto de deadlock del repositorio. Este módulo no menciona  │
 * │ la tabla `User` (lo vigila `tests/creditos`).                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOS FORMAS DEL MISMO PRIMITIVO: `aplicarCreditos` abre su transacción; `aplicarCreditosEnTx` corre
 * dentro de la de quien llama. La segunda existe porque el regalo de Socio Fundador tiene que ir en la
 * transacción de la VERIFICACIÓN (Prisma no anida transacciones): o se verifica y se regala, o nada.
 *
 * Sin `server-only`, como `ledger.ts`: recibe el cliente por parámetro y lo usará también el worker
 * (consumo diario, P9).
 */
import {
  AJUSTE_CREDITOS_DELTA_MAX,
  AJUSTE_NOTA_MAX,
  AJUSTE_NOTA_MIN,
  CREDITOS_PAGINA,
  ETIQUETA_MOVIMIENTO_CREDITO,
  type RazonCredito,
  SOCIO_FUNDADOR_CREDITOS,
  claveRegaloSocioFundador,
} from "@/config/constants";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  codificarCursorTiempo,
  conKeysetTiempo,
  decodificarCursorTiempo,
} from "@/lib/cursor-tiempo";
import { esSocioFundador } from "@/lib/socio-fundador";
import type { Db } from "@/server/db/types";

import { LEDGER_TX_OPTIONS } from "./ledger";

export type CodigoCreditos = "EMPRESA_NO_EXISTE" | "SALDO_INSUFICIENTE";

export class CreditosError extends Error {
  constructor(
    public readonly code: CodigoCreditos,
    message: string,
  ) {
    super(message);
    this.name = "CreditosError";
  }
}

export interface EntradaCreditos {
  empresaId: string;
  /** + al regalar o ajustar a favor; − al ajustar en contra (y, en P9, al consumir). Nunca 0. */
  delta: number;
  reason: RazonCredito;
  refType?: string;
  refId?: string;
  idempotencyKey: string;
  /** El POR QUÉ de un ajuste manual. Para el equipo: no viaja al portal. */
  nota?: string;
  /** P9: el día de campaña que cobra (CONSUMO) o devuelve (DEVOLUCION). Los dos o ninguno. */
  publicidadId?: string;
  dia?: Date;
  /**
   * Efecto EXTRA en la misma transacción, con la empresa AÚN BLOQUEADA y solo si el movimiento se
   * aplicó de verdad (no en el no-op de idempotencia). Lo usa el ajuste del admin para su `AuditLog`.
   * SI LANZA, SE DESHACE TODO.
   */
  trasAplicar?: (tx: Db, antes: number, despues: number, movimientoId: string) => Promise<void>;
}

export interface ResultadoCreditos {
  /** true si se aplicó ahora; false si esa clave ya estaba (no-op). */
  aplicado: boolean;
  /** Saldo resultante. */
  saldo: number;
}

/**
 * EL NÚCLEO, dentro de una transacción ajena. Bloquea, comprueba idempotencia, valida, inserta y
 * escribe el saldo — en ese orden, y el bloqueo SIEMPRE lo primero que toca la fila.
 */
export async function aplicarCreditosEnTx(
  tx: Db,
  entrada: EntradaCreditos,
): Promise<ResultadoCreditos> {
  // 1) BLOQUEO de la fila de la EMPRESA. Serializa a los concurrentes sobre esta empresa y devuelve
  //    el saldo actual ya bloqueado.
  const fila = await tx.$queryRaw<Array<{ saldo: number | bigint }>>(
    Prisma.sql`SELECT \`creditosSaldo\` AS saldo FROM \`Empresa\` WHERE \`id\` = ${entrada.empresaId} FOR UPDATE`,
  );
  if (fila.length === 0 || fila[0] === undefined) {
    throw new CreditosError("EMPRESA_NO_EXISTE", "Esa empresa no existe.");
  }
  const antes = Number(fila[0].saldo);

  // 2) IDEMPOTENCIA, después del bloqueo: si ya se aplicó, no-op.
  const ya = await tx.creditoLedger.findUnique({
    where: { idempotencyKey: entrada.idempotencyKey },
    select: { id: true },
  });
  if (ya) return { aplicado: false, saldo: antes };

  // 3) VALIDACIÓN: el saldo de créditos nunca es negativo.
  const despues = antes + entrada.delta;
  if (despues < 0) {
    throw new CreditosError(
      "SALDO_INSUFICIENTE",
      "No se le pueden quitar más créditos de publicidad de los que tiene.",
    );
  }

  // 4) EL MOVIMIENTO (solo inserción).
  const mov = await tx.creditoLedger.create({
    data: {
      empresaId: entrada.empresaId,
      delta: entrada.delta,
      reason: entrada.reason,
      refType: entrada.refType ?? null,
      refId: entrada.refId ?? null,
      idempotencyKey: entrada.idempotencyKey,
      nota: entrada.nota ?? null,
      publicidadId: entrada.publicidadId ?? null,
      dia: entrada.dia ?? null,
    },
    select: { id: true },
  });

  // 5) EL SALDO, con el valor calculado (no un incremento): por eso el FOR UPDATE es imprescindible.
  await tx.$executeRaw(
    Prisma.sql`UPDATE \`Empresa\` SET \`creditosSaldo\` = ${despues} WHERE \`id\` = ${entrada.empresaId}`,
  );

  // 6) Efecto extra (si lo hay), con el saldo de antes y el de después exactos.
  if (entrada.trasAplicar) await entrada.trasAplicar(tx, antes, despues, mov.id);

  return { aplicado: true, saldo: despues };
}

/** El primitivo con su propia transacción (las mismas opciones explícitas que `ledger.ts`). */
export function aplicarCreditos(
  db: PrismaClient,
  entrada: EntradaCreditos,
): Promise<ResultadoCreditos> {
  return db.$transaction((tx) => aplicarCreditosEnTx(tx, entrada), LEDGER_TX_OPTIONS);
}

// ---------------------------------------------------------------------------------------------------
// El regalo de Socio Fundador
// ---------------------------------------------------------------------------------------------------

/**
 * REGALA LOS CRÉDITOS DE SOCIO FUNDADOR, si le tocan. Se llama DENTRO de la transacción de la
 * verificación (`verificarEmpresa`), con el `verificadaEn` que queda sellado.
 *
 * UNA VEZ POR EMPRESA, PARA SIEMPRE: la clave es la de la empresa (`claveRegaloSocioFundador`), no la
 * de la verificación. Rechazarla y volver a verificarla no lo cobra dos veces; y la migración de esta
 * pieza usa LA MISMA clave para las que ya estaban verificadas, así que tampoco se cruzan.
 *
 * Devuelve si lo regaló AHORA (para contárselo en el correo de verificación).
 */
export async function regalarSocioFundador(
  tx: Db,
  entrada: { empresaId: string; verificadaEn: Date },
): Promise<{ regalado: boolean }> {
  if (!esSocioFundador(entrada.verificadaEn)) return { regalado: false };
  const r = await aplicarCreditosEnTx(tx, {
    empresaId: entrada.empresaId,
    delta: SOCIO_FUNDADOR_CREDITOS,
    reason: "SOCIO_FUNDADOR",
    refType: "EMPRESA",
    refId: entrada.empresaId,
    idempotencyKey: claveRegaloSocioFundador(entrada.empresaId),
  });
  return { regalado: r.aplicado };
}

// ---------------------------------------------------------------------------------------------------
// El ajuste manual del admin
// ---------------------------------------------------------------------------------------------------

export type CodigoAjusteCreditos =
  "NOTA_OBLIGATORIA" | "DELTA_INVALIDO" | "EMPRESA_NO_EXISTE" | "SALDO_INSUFICIENTE";

export class AjusteCreditosError extends Error {
  constructor(
    public readonly code: CodigoAjusteCreditos,
    message: string,
  ) {
    super(message);
    this.name = "AjusteCreditosError";
  }
}

/**
 * Clave del ajuste: la que manda el panel por INTENCIÓN (la misma en los reintentos), con espacio de
 * nombres del flujo y del admin, como `claveAjusteBoost`. Una clave del cliente no puede chocar con la
 * del regalo ni con las de otro admin.
 */
export function claveAjusteCreditos(adminId: string, clave: string): string {
  return `creditos:ajuste:${adminId}:${clave}`;
}

/**
 * AJUSTA A MANO los créditos de publicidad de una empresa, con MOTIVO y con `AuditLog`.
 *
 * Como `ajustarCreditosBoost`: el motivo es obligatorio y va EN LA FILA del ledger (es la traza); la
 * cantidad es entera, distinta de 0 y con tope; nunca deja el saldo en negativo; y una misma clave no
 * se aplica dos veces (doble clic). Además, deja su línea en `AuditLog` EN LA MISMA TRANSACCIÓN —quién,
 * cuánto y qué movimiento—, que es lo que el panel lee para saber quién tocó el saldo de una empresa.
 *
 * NUNCA UN UPDATE DE `creditosSaldo`: el saldo se mueve por el ledger o no se mueve.
 */
export async function ajustarCreditosEmpresa(
  db: PrismaClient,
  entrada: { adminId: string; empresaId: string; delta: number; nota: string; clave: string },
): Promise<ResultadoCreditos> {
  const nota = entrada.nota.trim();
  if (nota.length < AJUSTE_NOTA_MIN || nota.length > AJUSTE_NOTA_MAX) {
    throw new AjusteCreditosError(
      "NOTA_OBLIGATORIA",
      `El motivo es obligatorio (entre ${AJUSTE_NOTA_MIN} y ${AJUSTE_NOTA_MAX} caracteres).`,
    );
  }
  const { delta } = entrada;
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > AJUSTE_CREDITOS_DELTA_MAX) {
    throw new AjusteCreditosError(
      "DELTA_INVALIDO",
      `La cantidad tiene que ser un número entero distinto de 0 (como mucho ${AJUSTE_CREDITOS_DELTA_MAX}).`,
    );
  }
  try {
    return await aplicarCreditos(db, {
      empresaId: entrada.empresaId,
      delta,
      reason: "AJUSTE_ADMIN",
      refType: "ADMIN",
      refId: entrada.adminId,
      nota,
      idempotencyKey: claveAjusteCreditos(entrada.adminId, entrada.clave),
      trasAplicar: async (tx, antes, despues, movimientoId) => {
        await tx.auditLog.create({
          data: {
            actorId: entrada.adminId,
            action: "EMPRESA_CREDITOS_AJUSTE",
            targetType: "EMPRESA",
            targetId: entrada.empresaId,
            // El motivo NO se duplica aquí: vive en la fila del ledger, que es su sitio.
            metadata: { delta, antes, despues, movimientoId },
          },
        });
      },
    });
  } catch (e) {
    if (e instanceof CreditosError && e.code === "EMPRESA_NO_EXISTE") {
      throw new AjusteCreditosError("EMPRESA_NO_EXISTE", e.message);
    }
    if (e instanceof CreditosError && e.code === "SALDO_INSUFICIENTE") {
      throw new AjusteCreditosError("SALDO_INSUFICIENTE", e.message);
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------
// Leer: el portal y el panel
// ---------------------------------------------------------------------------------------------------

/**
 * UN MOVIMIENTO, VISTO POR LA EMPRESA. Por su MOTIVO, en humano. Lo que NO trae: la nota del ajuste
 * (es del equipo) ni quién lo hizo (el id del admin no es cosa de la empresa). El test lo fija con
 * igualdad exacta de claves.
 */
export interface MovimientoCreditoEmpresa {
  id: string;
  delta: number;
  concepto: string;
  creadoMs: number;
}

export interface CreditosDeEmpresa {
  saldo: number;
  movimientos: MovimientoCreditoEmpresa[];
  nextCursor: string | null;
}

/**
 * EL SALDO de una empresa, solo para LEERLO (comprobarlo antes de activar una campaña, enseñarlo). Vive
 * aquí para que este módulo siga siendo el único que nombra la columna: escribirla es del primitivo, y
 * leerla desde cualquier sitio invitaría a escribirla también desde cualquier sitio.
 */
export async function saldoCreditosEmpresa(db: Db, empresaId: string): Promise<number> {
  const e = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { creditosSaldo: true },
  });
  return e?.creditosSaldo ?? 0;
}

/**
 * EL CONCEPTO DE UN MOVIMIENTO: por su MOTIVO (nunca por la nota, que es del equipo) y, si es el cobro o
 * la devolución de un día (P9), con el nombre de SU campaña: con varias en marcha, «Un día de campaña»
 * a secas no le dice a la empresa cuál le ha costado ese día.
 */
function conceptoDe(
  reason: string,
  campana: string | null | undefined,
  sinEtiqueta: string,
): string {
  const etiqueta = ETIQUETA_MOVIMIENTO_CREDITO[reason as RazonCredito] ?? sinEtiqueta;
  return campana ? `${etiqueta} · «${campana}»` : etiqueta;
}

/** SUS créditos: el saldo y su historial por KEYSET. El `empresaId` sale del chokepoint. */
export async function misCreditos(
  db: Db,
  empresaId: string,
  opciones: { cursor?: string | null } = {},
): Promise<CreditosDeEmpresa> {
  const [empresa, filas] = await Promise.all([
    db.empresa.findUnique({ where: { id: empresaId }, select: { creditosSaldo: true } }),
    db.creditoLedger.findMany({
      where: conKeysetTiempo({ empresaId }, decodificarCursorTiempo(opciones.cursor)),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CREDITOS_PAGINA + 1,
      select: {
        id: true,
        delta: true,
        reason: true,
        createdAt: true,
        publicidad: { select: { nombre: true } },
      },
    }),
  ]);
  const hayMas = filas.length > CREDITOS_PAGINA;
  const pagina = hayMas ? filas.slice(0, CREDITOS_PAGINA) : filas;
  const ultima = pagina.at(-1);
  return {
    saldo: empresa?.creditosSaldo ?? 0,
    movimientos: pagina.map((f) => ({
      id: f.id,
      delta: f.delta,
      concepto: conceptoDe(f.reason, f.publicidad?.nombre, "Movimiento"),
      creadoMs: f.createdAt.getTime(),
    })),
    nextCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

/** Un movimiento en el PANEL: aquí SÍ va la nota (el equipo la escribió para el equipo). */
export interface MovimientoCreditoPanel {
  id: string;
  delta: number;
  concepto: string;
  nota: string | null;
  creadoMs: number;
}

/**
 * Los créditos de una empresa para la FICHA DEL PANEL: saldo y los últimos movimientos con su nota.
 * Del panel: recibe el id de la ficha que el admin está mirando (solo ADMIN entra a esa sección).
 */
export async function creditosDeFicha(
  db: Db,
  empresaId: string,
): Promise<{ saldo: number; movimientos: MovimientoCreditoPanel[] }> {
  const [empresa, filas] = await Promise.all([
    db.empresa.findUnique({ where: { id: empresaId }, select: { creditosSaldo: true } }),
    db.creditoLedger.findMany({
      where: { empresaId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        delta: true,
        reason: true,
        nota: true,
        createdAt: true,
        publicidad: { select: { nombre: true } },
      },
    }),
  ]);
  return {
    saldo: empresa?.creditosSaldo ?? 0,
    movimientos: filas.map((f) => ({
      id: f.id,
      delta: f.delta,
      concepto: conceptoDe(f.reason, f.publicidad?.nombre, f.reason),
      nota: f.nota,
      creadoMs: f.createdAt.getTime(),
    })),
  };
}
