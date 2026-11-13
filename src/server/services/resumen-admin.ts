/**
 * EL RESUMEN DIARIO DEL ADMIN y EL AVISO DE LA CASA (Fase 9 · P12, §6.5-6.6 del plan).
 *
 * ┌─ LA REGLA DE ARRIBA: UN CORREO QUE NO EXIGE NADA ENTRENA A IGNORAR EL BUZÓN ───────────────────┐
 * │ Lo que pide acción ya avisa al momento, con la pieza que crea el hecho (empresa nueva en P1,   │
 * │ propuesta en P3, campaña en revisión en P8). Lo que es «bueno saberlo» va AQUÍ, en UN correo   │
 * │ al día, y SOLO si hay algo: si no hay nada pendiente ni hubo actividad, no se manda. Un correo │
 * │ diario que casi siempre dice «nada» es el que deja de leerse.                                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * CUÁNDO: a partir de las `HORA_RESUMEN_ADMIN` de Europe/Madrid, una vez por DÍA de Madrid (como el
 * ANALYZE: se compara el día, no un intervalo de 24 h). El día hecho queda en `SystemState`, y el
 * correo se encola con la clave `resumen-admin:{día}`: aunque el worker se reinicie a media pasada, un
 * día da UN resumen. «Ayer» es el día de campaña (UTC), que a esa hora de Madrid ya está completo.
 *
 * QUÉ LLEVA: lo que espera en el panel (las mismas cifras que el contador del menú,
 * `pendientesPanel`), la publicidad denunciada que aún no llega al umbral, y la actividad de ayer
 * (campañas activadas, compras de créditos, veces que se mostró, clics y qué parte de los huecos no
 * tuvo campaña). Nombres y cifras, con enlaces al panel; ni ids, ni correos, ni datos fiscales.
 *
 * EL AVISO DE LA CASA va aparte, con histéresis (`avisarConHisteresis`): uno al cruzar el 80 %, ninguno
 * mientras siga arriba, y se rearma al bajar. Se evalúa en la misma pasada diaria, sobre los huecos de
 * ayer, y solo con volumen suficiente.
 */
import "server-only";

import {
  CLAVE_AVISO_CASA,
  CLAVE_RESUMEN_ADMIN,
  HORA_RESUMEN_ADMIN,
  HUECOS_MIN_AVISO_CASA,
  UMBRAL_AVISO_CASA,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { diaDe, sumarDias } from "@/lib/publicidad";
import type { Db } from "@/server/db/types";
import type { EmailAdapter } from "@/server/email/adapter";
import { avisarConHisteresis } from "@/server/jobs/aviso-histeresis";
import { diaYHoraEnMadrid } from "@/server/jobs/analizar-tablas";

import { pendientesPanel } from "./pendientes-panel";
import { type HuecosDeEspacio, type RedisLeerMetricas, huecosDelDia } from "./publicidad-metricas";
import { PUBLICIDAD_SIN_REVISION } from "./publicidad-visible";
import { escribirEstado, leerEstado } from "./system-state";
import { formatearDiaClave, formatearNumero, IDIOMA_DEL_EQUIPO } from "@/lib/formato";

// ---------------------------------------------------------------------------------------------------
// Puro: cuándo toca y qué se dice
// ---------------------------------------------------------------------------------------------------

/** ¿Toca el resumen? A partir de la hora, y si hoy (en Madrid) no se ha hecho. */
export function tocaResumen(ahora: Date, ultimoDiaHecho: string | null): boolean {
  const { dia, hora } = diaYHoraEnMadrid(ahora);
  return hora >= HORA_RESUMEN_ADMIN && dia !== ultimoDiaHecho;
}

export interface DatosResumen {
  /** Lo que espera ahora en el panel. */
  pendientes: { empresas: number; propuestas: number; enRevision: number };
  /** Campañas con denuncias abiertas que aún no llegan al umbral, y cuántas denuncias suman. */
  denunciadas: { campanas: number; denuncias: number };
  /** Lo que pasó ayer (día de campaña). */
  ayer: {
    activadas: number;
    compras: number;
    creditosComprados: number;
    vecesMostrada: number;
    clics: number;
  };
  /** Los huecos de ayer por espacio, o `null` si no se sabe (sin Redis). */
  huecos: Record<string, HuecosDeEspacio> | null;
}

/** ¿Hay ALGO que contar? Los huecos solos no: sin campañas, la casa los cubre todos cada día. */
export function hayAlgoQueContar(d: DatosResumen): boolean {
  const p = d.pendientes;
  const a = d.ayer;
  return (
    p.empresas + p.propuestas + p.enRevision > 0 ||
    d.denunciadas.campanas > 0 ||
    a.activadas + a.compras + a.vecesMostrada + a.clics > 0
  );
}

/** La parte de los huecos SIN campaña (la casa o vacíos), de 0 a 1; `null` si no hubo huecos. */
export function parteSinCampana(h: HuecosDeEspacio): number | null {
  return h.total > 0 ? (h.total - h.conCampana) / h.total : null;
}

const NOMBRE_ESPACIO: Record<string, string> = { LOCAL: "local", GLOBAL: "global" };
const cifra = (n: number) => formatearNumero(n, IDIOMA_DEL_EQUIPO);
const plural = (n: number, uno: string, varios: string) => `${cifra(n)} ${n === 1 ? uno : varios}`;
const porCiento = (x: number) => `${Math.round(x * 100)} %`;

/**
 * EL CORREO, compuesto de las cifras: asunto, líneas y enlaces. Puro, para atar el copy con tests. Cada
 * línea lleva su pantalla del panel; nada de ids.
 */
export function componerResumen(
  d: DatosResumen,
  appUrl: string,
  ayer: Date,
): { asunto: string; intro: string; lineas: string[]; enlacePanel: string } {
  const url = (ruta: string) => new URL(ruta, appUrl).toString();
  const fecha = formatearDiaClave(ayer, IDIOMA_DEL_EQUIPO, "diaMesLargo");
  const lineas: string[] = [];
  const p = d.pendientes;
  if (p.empresas > 0) {
    lineas.push(
      `${plural(p.empresas, "empresa espera", "empresas esperan")} verificación: ${url("/panel/empresas?estado=PENDIENTE")}`,
    );
  }
  if (p.propuestas > 0) {
    lineas.push(
      `${plural(p.propuestas, "propuesta de reto sin", "propuestas de reto sin")} contestar: ${url("/panel/propuestas")}`,
    );
  }
  if (p.enRevision > 0) {
    lineas.push(
      `${plural(p.enRevision, "campaña en revisión", "campañas en revisión")} por denuncias: ${url("/panel/publicidad?filtro=REVISION")}`,
    );
  }
  if (d.denunciadas.campanas > 0) {
    lineas.push(
      `${plural(d.denunciadas.campanas, "campaña tiene", "campañas tienen")} denuncias sin llegar al umbral (${plural(d.denunciadas.denuncias, "denuncia", "denuncias")}): ${url("/panel/publicidad?filtro=DENUNCIADAS")}`,
    );
  }
  const a = d.ayer;
  lineas.push(
    `Ayer: ${plural(a.activadas, "campaña activada", "campañas activadas")}, ${plural(a.compras, "compra", "compras")} de créditos${a.compras > 0 ? ` (${plural(a.creditosComprados, "crédito", "créditos")})` : ""}.`,
  );
  lineas.push(
    `La publicidad se mostró ${plural(a.vecesMostrada, "vez", "veces")}, con ${plural(a.clics, "clic", "clics")}.`,
  );
  if (d.huecos) {
    const partes = Object.entries(d.huecos)
      .filter(([, h]) => h.total > 0)
      .map(([espacio, h]) => {
        const sin = parteSinCampana(h)!;
        return `${NOMBRE_ESPACIO[espacio] ?? espacio.toLowerCase()} ${porCiento(sin)} de ${cifra(h.total)}`;
      });
    if (partes.length > 0) {
      lineas.push(
        `Huecos sin ninguna campaña (los cubrió la casa o quedaron vacíos): ${partes.join("; ")}.`,
      );
    }
  }
  return {
    asunto: `DareFlash: resumen del ${fecha}`,
    intro: `Lo que pasó el ${fecha} y lo que está esperando en el panel.`,
    lineas,
    enlacePanel: url("/panel"),
  };
}

// ---------------------------------------------------------------------------------------------------
// Los datos
// ---------------------------------------------------------------------------------------------------

/** Las cifras del resumen. «Ayer» = el día de campaña UTC anterior a `ahora`. */
export async function datosDelResumen(
  db: Db,
  redis: RedisLeerMetricas | null,
  ahora: Date,
): Promise<DatosResumen> {
  const hoy = diaDe(ahora);
  const ayer = sumarDias(hoy, -1);
  const ventana = { gte: ayer, lt: hoy };

  const abiertas = await db.report.groupBy({
    by: ["targetId"],
    where: { targetType: "PUBLICIDAD", status: "OPEN" },
    _count: { _all: true },
  });
  // Por debajo del umbral = la campaña aún NO está en revisión (esas ya cuentan en `enRevision`).
  const bajoUmbral = abiertas.length
    ? await db.publicidad.findMany({
        where: { id: { in: abiertas.map((a) => a.targetId) }, ...PUBLICIDAD_SIN_REVISION },
        select: { id: true },
      })
    : [];
  const idsBajo = new Set(bajoUmbral.map((p) => p.id));

  const [pend, activadas, compras, metricas, huecos] = await Promise.all([
    pendientesPanel(db, "ADMIN"),
    db.publicidad.count({ where: { activadaEn: ventana } }),
    db.creditoLedger.aggregate({
      where: { reason: "COMPRA", createdAt: ventana },
      _count: { _all: true },
      _sum: { delta: true },
    }),
    db.publicidadMetricaDia.aggregate({
      where: { dia: ayer },
      _sum: { vistas: true, clics: true },
    }),
    huecosDelDia(redis, ayer),
  ]);

  return {
    pendientes: {
      empresas: pend.empresas,
      propuestas: pend.propuestas,
      enRevision: pend.publicidad,
    },
    denunciadas: {
      campanas: idsBajo.size,
      denuncias: abiertas
        .filter((a) => idsBajo.has(a.targetId))
        .reduce((s, a) => s + a._count._all, 0),
    },
    ayer: {
      activadas,
      compras: compras._count._all,
      creditosComprados: compras._sum.delta ?? 0,
      vecesMostrada: metricas._sum.vistas ?? 0,
      clics: metricas._sum.clics ?? 0,
    },
    huecos,
  };
}

// ---------------------------------------------------------------------------------------------------
// La pasada diaria
// ---------------------------------------------------------------------------------------------------

export type ResultadoResumen =
  | { estado: "no_toca" }
  /** Se hizo hoy: `enviado` si se encoló el correo; si no, por qué no. */
  | {
      estado: "hecho";
      enviado: boolean;
      motivo: "ENCOLADO" | "NADA_QUE_CONTAR" | "SIN_DESTINATARIO";
      avisoCasa: boolean;
    };

/**
 * LA PASADA DIARIA: si toca, calcula, evalúa el aviso de la casa y, si hay algo, encola el resumen. El
 * día queda marcado en la MISMA transacción que el encolado (y la clave del correo es la del día), así
 * que dos pasadas el mismo día dan un correo.
 *
 * Sin `ADMIN_EMAIL` el día se marca igual y se deja una línea en el log: es un resumen informativo, y
 * no marcarlo haría que cada vuelta del worker lo recalculara y volviera a escribir el log. (El aviso
 * de la casa, que sí pide acción, sigue la regla contraria —no se marca sin destinatario—, y la aplica
 * `avisarConHisteresis`.)
 */
export async function hacerResumenDiario(
  db: PrismaClient,
  o: {
    redis: RedisLeerMetricas | null;
    adapter: EmailAdapter;
    adminEmail?: string;
    appUrl: string;
    ahora?: Date;
    log?: (m: string) => void;
  },
): Promise<ResultadoResumen> {
  const ahora = o.ahora ?? new Date();
  if (!tocaResumen(ahora, await leerEstado(db, CLAVE_RESUMEN_ADMIN))) return { estado: "no_toca" };
  const { dia } = diaYHoraEnMadrid(ahora);
  const ayer = sumarDias(diaDe(ahora), -1);
  const datos = await datosDelResumen(db, o.redis, ahora);

  const avisoCasa = await evaluarAvisoCasa(db, datos.huecos, ayer, o);

  if (!hayAlgoQueContar(datos)) {
    await escribirEstado(db, CLAVE_RESUMEN_ADMIN, dia);
    return { estado: "hecho", enviado: false, motivo: "NADA_QUE_CONTAR", avisoCasa };
  }
  if (!o.adminEmail) {
    o.log?.("[worker] resumen diario: hay novedades, pero no hay ADMIN_EMAIL; no se envía.");
    await escribirEstado(db, CLAVE_RESUMEN_ADMIN, dia);
    return { estado: "hecho", enviado: false, motivo: "SIN_DESTINATARIO", avisoCasa };
  }

  const c = componerResumen(datos, o.appUrl, ayer);
  const { enqueueEmail } = await import("@/server/email/send");
  const { renderCorreoHtml } = await import("@/server/email/plantilla");
  const adminEmail = o.adminEmail;
  await db.$transaction(async (tx) => {
    await enqueueEmail(
      tx,
      {
        to: adminEmail,
        subject: c.asunto,
        text: [c.intro, "", ...c.lineas.map((l) => `- ${l}`), "", `Panel: ${c.enlacePanel}`].join(
          "\n",
        ),
        html: renderCorreoHtml({
          preheader: c.intro,
          titulo: c.asunto.replace(/^DareFlash: /, ""),
          intro: c.intro,
          cta: { texto: "Abrir el panel", href: c.enlacePanel },
          notas: c.lineas,
        }),
      },
      { idempotencyKey: `resumen-admin:${dia}`, runAt: ahora },
    );
    await escribirEstado(tx, CLAVE_RESUMEN_ADMIN, dia);
  });
  return { estado: "hecho", enviado: true, motivo: "ENCOLADO", avisoCasa };
}

/**
 * EL AVISO DE LA CASA: con histéresis, sobre los huecos de AYER sumando los espacios. Sin datos (sin
 * Redis) o con pocos huecos, no se evalúa: ni avisa ni rearma, porque «no se sabe» no es «ha bajado».
 */
async function evaluarAvisoCasa(
  db: PrismaClient,
  huecos: Record<string, HuecosDeEspacio> | null,
  ayer: Date,
  o: { adapter: EmailAdapter; adminEmail?: string; appUrl: string; log?: (m: string) => void },
): Promise<boolean> {
  if (!huecos) return false;
  const total = Object.values(huecos).reduce((s, h) => s + h.total, 0);
  if (total < HUECOS_MIN_AVISO_CASA) return false;
  const con = Object.values(huecos).reduce((s, h) => s + h.conCampana, 0);
  const sin = (total - con) / total;
  const fecha = formatearDiaClave(ayer, IDIOMA_DEL_EQUIPO, "diaMesLargo");
  const enlace = new URL("/panel/publicidad?filtro=ACTIVAS", o.appUrl).toString();
  return avisarConHisteresis(db, {
    clave: CLAVE_AVISO_CASA,
    superado: sin > UMBRAL_AVISO_CASA,
    mensaje: () => ({
      to: "",
      subject: "DareFlash: casi ningún hueco de publicidad tiene campaña",
      text:
        `El ${fecha}, el ${porCiento(sin)} de los ${cifra(total)} huecos de publicidad no tuvo ninguna campaña: ` +
        "los cubrió el anuncio de la casa o quedaron vacíos. Al principio es lo esperable —hay pocas " +
        "campañas y el espacio local solo lo compran negocios físicos—; no es una avería. Te avisamos una " +
        "vez al cruzar el 80 %, y otra solo si baja y vuelve a subir.\n\n" +
        `Campañas activas: ${enlace}`,
    }),
    sinDestinatario:
      "[worker] AVISO publicidad: la casa cubre más del 80 % de los huecos, pero no hay ADMIN_EMAIL.",
    enviado: "[worker] AVISO publicidad (casa > 80 %) enviado al admin.",
    adapter: o.adapter,
    adminEmail: o.adminEmail,
    log: o.log,
  });
}
