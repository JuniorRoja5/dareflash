/**
 * EL COBRO DIARIO DE LA PUBLICIDAD (Fase 9 · P9): el barrido del worker que, al empezar cada día, cobra
 * ese día a cada campaña que lo ocupa. El primitivo (cobrar o devolver UN día) está en
 * `publicidad-consumo.ts`.
 *
 * ┌─ SIN CRON Y SIN «PONERSE AL DÍA» ──────────────────────────────────────────────────────────────┐
 * │ El worker lo llama cada `PUBLICIDAD_COBRO_CADENCIA_MS` y cobra HOY a quien lo ocupe y aún no lo │
 * │ haya pagado. A las 00:00 UTC el primer barrido cobra a todas; los siguientes recogen lo que se  │
 * │ escapó (un worker caído, un reintento agotado). Un día pasado NO se cobra nunca: lo que no se   │
 * │ cobró a tiempo tampoco se sirvió (la entrega exige el cobro del día), así que no hay nada que   │
 * │ recuperar, y cobrarlo sería cobrar un día que no se vio.                                        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SIN SALDO EL DÍA DEL COBRO ───────────────────────────────────────────────────────────────────┐
 * │ Ese día NO se sirve (no se ha pagado), se liberan sus días —HOY incluido: ni una plaza ocupada  │
 * │ sin saldo—, la campaña pasa a PAUSADA y la empresa recibe un correo. No se le descuenta nada.   │
 * │ Al reanudarla recupera esos días, porque un día liberado no es un día que tuvo.                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Solo se cobra lo que se SERVIRÍA (`PUBLICIDAD_SERVIBLE`): una campaña en revisión, retirada, sin
 * imagen o de una empresa suspendida no se cobra ese día. Cada campaña en SU transacción, con el orden
 * único de cerrojos (`publicidad-cerrojos.ts`: Empresa → campaña → ocupación → ledger) y reintento ante
 * 1020/1213; un fallo en una no detiene a las demás (se cuenta y la recoge el barrido siguiente).
 */
import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { claveDia, diaDe } from "@/lib/publicidad";

import { saldoCreditosEmpresa } from "./creditos";
import { avisarEmpresaEnTx } from "./publicidad-moderacion";
import { bloquearEmpresa, conReintentos } from "./publicidad-cerrojos";
import {
  type ResultadoCobroDia,
  cobrarDiaEnTx,
  inicioDelCobro,
  seCobra,
} from "./publicidad-consumo";
import { PUBLICIDAD_SERVIBLE } from "./publicidad-visible";

export interface ResultadoCobroDelDia {
  /** Campañas que ocupaban hoy sin haberlo pagado. */
  revisadas: number;
  cobradas: number;
  /** Pausadas por no llegarles el saldo. */
  pausadas: number;
  /** Las que fallaron (el barrido siguiente las vuelve a intentar). */
  fallos: number;
}

const TX_OPCIONES = { maxWait: 10_000, timeout: 20_000 } as const;

type Desenlace = ResultadoCobroDia | "PAUSADA" | "NADA";

export async function cobrarPublicidadDeHoy(
  db: PrismaClient,
  opciones: { appUrl: string; ahora?: Date; log?: (m: string) => void },
): Promise<ResultadoCobroDelDia> {
  const ahora = opciones.ahora ?? new Date();
  const hoy = diaDe(ahora);
  const inicio = await inicioDelCobro(db);
  const r: ResultadoCobroDelDia = { revisadas: 0, cobradas: 0, pausadas: 0, fallos: 0 };
  if (!seCobra(hoy, inicio)) return r;

  // Las que ocupan hoy, se servirían y no han pagado hoy. Entra por el índice de `ZonaOcupacion(dia)`.
  const pendientes = await db.zonaOcupacion.findMany({
    where: {
      dia: hoy,
      publicidad: {
        ...PUBLICIDAD_SERVIBLE,
        NOT: { movimientos: { some: { dia: hoy, reason: "CONSUMO" } } },
      },
    },
    distinct: ["publicidadId"],
    select: { publicidadId: true, publicidad: { select: { empresaId: true } } },
  });

  for (const p of pendientes) {
    r.revisadas += 1;
    try {
      const d = await cobrarUna(db, p.publicidad.empresaId, p.publicidadId, hoy, inicio, {
        appUrl: opciones.appUrl,
        ahora,
      });
      if (d === "COBRADO") r.cobradas += 1;
      if (d === "PAUSADA") r.pausadas += 1;
    } catch (e) {
      r.fallos += 1;
      opciones.log?.(
        `[cobro] la campaña ${p.publicidadId} no se pudo cobrar el ${claveDia(hoy)}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
  return r;
}

/** Cobra HOY a una campaña, o la pausa si no le llega. Todo vuelve a comprobarse con los cerrojos. */
async function cobrarUna(
  db: PrismaClient,
  empresaId: string,
  publicidadId: string,
  hoy: Date,
  inicio: Date | null,
  o: { appUrl: string; ahora: Date },
): Promise<Desenlace> {
  return conReintentos(() =>
    db.$transaction(async (tx): Promise<Desenlace> => {
      await bloquearEmpresa(tx, empresaId);
      const filas = await tx.$queryRaw<
        { estado: string; ocultoAutoEn: Date | null; creditosPorDia: number | bigint | null }[]
      >`
        SELECT \`estado\`, \`ocultoAutoEn\`, \`creditosPorDia\`
        FROM \`Publicidad\` WHERE \`id\` = ${publicidadId} AND \`empresaId\` = ${empresaId} FOR UPDATE`;
      const c = filas[0];
      // Entre la lista y el cerrojo pudo pausarse, ocultarse o retirarse: entonces hoy no se cobra.
      if (!c || c.estado !== "ACTIVA" || c.ocultoAutoEn !== null) return "NADA";
      const empresa = await tx.empresa.findUnique({
        where: { id: empresaId },
        select: { estado: true },
      });
      if (empresa?.estado !== "VERIFICADA") return "NADA";
      const ocupaHoy = await tx.zonaOcupacion.findFirst({
        where: { publicidadId, dia: hoy },
        select: { id: true },
      });
      if (!ocupaHoy) return "NADA";

      const tarifa = Number(c.creditosPorDia ?? 0);
      const cobro = await cobrarDiaEnTx(tx, { empresaId, publicidadId, dia: hoy, tarifa, inicio });
      if (cobro !== "SIN_SALDO") return cobro;

      // SIN SALDO: hoy no se sirve, se libera desde hoy, se pausa y se avisa. No se descuenta nada.
      await tx.zonaOcupacion.deleteMany({ where: { publicidadId, dia: { gte: hoy } } });
      await tx.publicidad.update({
        where: { id: publicidadId },
        data: { estado: "PAUSADA", pausadaEn: o.ahora },
      });
      // El saldo, por el lector de créditos: este módulo no nombra la columna (solo la escribe el primitivo).
      const quedan = await saldoCreditosEmpresa(tx, empresaId);
      await avisarEmpresaEnTx(tx, publicidadId, o.appUrl, o.ahora, {
        clave: `publicidad-sin-saldo:${publicidadId}:${claveDia(hoy)}`,
        titulo: "Hemos pausado tu campaña: no te quedan créditos",
        cuerpo: (nombre) =>
          `Hoy tocaba mostrar «${nombre}», que cuesta ${tarifa} ${
            tarifa === 1 ? "crédito" : "créditos"
          } de publicidad al día, y te ${quedan === 1 ? "queda" : "quedan"} ${quedan}. La hemos pausado y hemos liberado sus días siguientes; no te hemos descontado nada.`,
        nota: "Cuando vuelvas a tener créditos, puedes reanudarla desde tu portal: recupera los días que le quedan, si hay sitio en su zona.",
      });
      return "PAUSADA";
    }, TX_OPCIONES),
  );
}
