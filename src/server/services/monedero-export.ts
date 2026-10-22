import "server-only";

import { FRASE_RECHAZO, type MotivoRechazo } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { csvDocumento } from "@/lib/csv";
import { centimosAImporte } from "@/lib/dinero";
import type { RangoExport } from "@/lib/rango-export";
import { descifrarDatoDePago } from "@/server/security/cifrado-pagos";

import { ACCION_AJUSTE_SALDO } from "./monedero-admin";

/**
 * EXPORTAR EL DINERO A CSV — para cuadrar contabilidad fuera.
 *
 * ┌─ ESTE FICHERO SACA IBANES Y DIRECCIONES EN CLARO, Y ESO ES LA DECISIÓN ───────────────────────┐
 * │ Un CSV de retiradas sin el destino no sirve para conciliar con el extracto del banco: habría  │
 * │ que volver al panel fila a fila. Así que el destino va COMPLETO, decidido a propósito, y con  │
 * │ las barandillas que corresponden a sacar PII financiera de la base de datos:                  │
 * │                                                                                               │
 * │   · SOLO ADMIN (lo decide la ruta, derivado de `secciones.ts`);                               │
 * │   · CADA EXPORTACIÓN SE AUDITA —quién, qué y cuántas filas—, porque un fichero con cien       │
 * │     IBANes que sale de aquí tiene que poder rastrearse hasta la persona que lo pidió;         │
 * │   · SE DESCIFRA AL VUELO Y SOLO AQUÍ: el texto en claro vive en memoria el tiempo de construir │
 * │     la cadena y no entra en ningún DTO, ningún log ni ningún `AuditLog`;                      │
 * │   · NO SE ESCRIBE EN DISCO: la ruta devuelve la cadena y se acabó. Un CSV olvidado en /tmp es │
 * │     la fuga que nadie recuerda haber creado.                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIN PAGINAR, a diferencia de las vistas: una exportación partida en páginas no cuadra nada. Lleva
 * TOPE, que es otra cosa — un número alto y explícito, para que el día que se alcance se sepa (la
 * ruta lo dice en la respuesta) en vez de truncar en silencio.
 *
 * ┌─ Y LLEVA RANGO DE FECHAS, QUE LO ELIGE QUIEN EXPORTA ───────────────────────────────────────┐
 * │ El rango se aplica EN EL `where`, no recortando después: recortar después ya ha leído las    │
 * │ filas —y aquí leer significa DESCIFRAR IBANes— y además habría gastado el tope en filas que  │
 * │ se iban a tirar. Sacar un año de datos de pago para cuadrar un mes es exactamente lo que un  │
 * │ export auditado no debe obligar a hacer: cuanto menos sale, menos hay que custodiar.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/** Tope de filas por exportación. Alto a propósito; lo que importa es que exista y se diga. */
export const EXPORT_TOPE = 5000;

/**
 * El filtro por fecha, en UN sitio para los dos CSV de este fichero.
 *
 * `createdAt` y no otra columna: es la fecha que el CSV pinta y por la que ordena, así que es la
 * única por la que filtrar no sorprende a nadie. Semiabierto `[desde, hasta)`, como el rango.
 */
const enRango = (rango: RangoExport) => ({
  createdAt: { gte: rango.desde, lt: rango.hasta },
});

export interface Exportacion {
  csv: string;
  filas: number;
  /** `true` si se alcanzó el tope: hay más de las que caben, y la ruta tiene que decirlo. */
  truncada: boolean;
}

/** El destino, en una sola celda y legible por una persona que va a copiarlo a un banco. */
function destinoLegible(datosPago: string): string {
  try {
    const d = JSON.parse(descifrarDatoDePago(datosPago)) as Record<string, string>;
    // Las claves son las que escribió `serializarDestino`: iban+titular, o direccion+red.
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
  } catch {
    // NO se filtra el valor ni el error: lo que hace falta saber es que esa fila hay que mirarla.
    return "(no se ha podido descifrar)";
  }
}

/**
 * CSV DE RETIRADAS. El importe va en unidades (no en céntimos) porque esto lo abre una hoja de
 * cálculo y se va a sumar; los céntimos crudos obligarían a dividir a mano cada columna.
 */
export async function exportarRetiradas(
  db: PrismaClient,
  rango: RangoExport,
): Promise<Exportacion> {
  const filas = await db.withdrawal.findMany({
    where: enRango(rango),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_TOPE + 1,
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
      procesadaEn: true,
      motivoRechazo: true,
      motivoRechazoTexto: true,
    },
  });

  const truncada = filas.length > EXPORT_TOPE;
  const pagina = truncada ? filas.slice(0, EXPORT_TOPE) : filas;

  const usuarios = await db.user.findMany({
    where: { id: { in: pagina.map((f) => f.userId) } },
    select: { id: true, username: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u.username]));

  const csv = csvDocumento(
    [
      "id",
      "usuario",
      "importe",
      "moneda",
      "metodo",
      "red",
      "destino",
      "estado",
      "solicitada",
      "procesada",
      "motivo_rechazo",
    ],
    pagina.map((f) => [
      f.id,
      porId.get(f.userId) ?? "(cuenta borrada)",
      centimosAImporte(f.amountCents),
      f.currency,
      f.metodo,
      f.red,
      destinoLegible(f.datosPago),
      f.status,
      f.createdAt.toISOString(),
      f.procesadaEn?.toISOString() ?? null,
      // El motivo, como lo lee la persona: la clave no le dice nada a quien cuadra las cuentas.
      f.motivoRechazo === "OTRO"
        ? f.motivoRechazoTexto
        : (FRASE_RECHAZO[f.motivoRechazo as MotivoRechazo] ?? f.motivoRechazo),
    ]),
  );

  return { csv, filas: pagina.length, truncada };
}

/** CSV DE AJUSTES MANUALES. Sale del `AuditLog`, que es donde vive el motivo. */
export async function exportarAjustes(db: PrismaClient, rango: RangoExport): Promise<Exportacion> {
  const filas = await db.auditLog.findMany({
    where: { action: ACCION_AJUSTE_SALDO, ...enRango(rango) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_TOPE + 1,
    select: { id: true, actorId: true, targetId: true, metadata: true, createdAt: true },
  });

  const truncada = filas.length > EXPORT_TOPE;
  const pagina = truncada ? filas.slice(0, EXPORT_TOPE) : filas;

  const ids = [...new Set(pagina.flatMap((f) => [f.actorId, f.targetId].filter(Boolean)))];
  const usuarios = await db.user.findMany({
    where: { id: { in: ids as string[] } },
    select: { id: true, username: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u.username]));

  const meta = (m: unknown, k: string): unknown =>
    typeof m === "object" && m !== null ? (m as Record<string, unknown>)[k] : undefined;

  const csv = csvDocumento(
    ["id", "admin", "usuario", "importe", "saldo_antes", "saldo_despues", "motivo", "fecha"],
    pagina.map((f) => {
      const delta = meta(f.metadata, "deltaCents");
      const antes = meta(f.metadata, "antes");
      const despues = meta(f.metadata, "despues");
      const nota = meta(f.metadata, "nota");
      return [
        f.id,
        (f.actorId && porId.get(f.actorId)) ?? "(cuenta borrada)",
        (f.targetId && porId.get(f.targetId)) ?? "(cuenta borrada)",
        // Vacío y no 0 si el dato no está: un 0 en una columna de dinero se suma.
        typeof delta === "number" ? centimosAImporte(delta) : null,
        typeof antes === "number" ? centimosAImporte(antes) : null,
        typeof despues === "number" ? centimosAImporte(despues) : null,
        typeof nota === "string" ? nota : null,
        f.createdAt.toISOString(),
      ];
    }),
  );

  return { csv, filas: pagina.length, truncada };
}
