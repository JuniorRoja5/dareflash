/**
 * LA PUBLICIDAD DE UNA EMPRESA (Fase 9 · P6): alta, activación o programación con OCUPACIÓN EXACTA,
 * máximo por zona, reserva, pausa, reanudación y fin. Se sirven desde P7 y se cobran por día desde P9
 * (`publicidad-consumo.ts`): activar o reanudar una campaña que empieza HOY cobra hoy en el acto.
 *
 * ┌─ EL ÁMBITO ES UN PARÁMETRO OBLIGATORIO ─────────────────────────────────────────────────────────┐
 * │ Toda función que toca una campaña recibe `empresaId` como segundo argumento, obligatorio, y lo  │
 * │ mete DENTRO del where (se carga la fila con su empresa, no se carga y luego se compara). Una    │
 * │ campaña de otra empresa es exactamente lo mismo que una que no existe: `null`/NO_EXISTE, que la │
 * │ ruta traduce a 404. El id sale siempre del chokepoint (`requireEmpresa`), nunca de la petición. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ LA PLAZA SE OCUPA, NO SE CUENTA ───────────────────────────────────────────────────────────────┐
 * │ `ocuparDias` hace un INSERT IGNORE por posición contra el único (zonaClave, dia, posicion). La   │
 * │ clave duplicada se resuelve contra lo último CONFIRMADO, no contra la instantánea: es lo que     │
 * │ hace que 10 activaciones simultáneas sobre 3 plazas dejen entrar exactamente 3. Contar antes de  │
 * │ insertar es la trampa del cupo de Boost (61 en 60): un SELECT dentro de la transacción devuelve  │
 * │ el mundo de antes de esperar. Y se ocupa SIEMPRE en el mismo orden (zona, posición, día), para   │
 * │ que dos transacciones no se esperen en cruz.                                                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ORDEN DE CERROJOS: el ÚNICO de la publicidad, escrito en `publicidad-cerrojos.ts` (Empresa → denuncias
 * → Publicidad → ocupación → ledger). NUNCA `User`. El saldo se comprueba contra lo DISPONIBLE (saldo
 * menos lo comprometido en sus otras campañas) y no se retiene (ver `MSG_SALDO_NO_RETENIDO`).
 *
 * REINTENTA ante el 1020 de MariaDB (conflicto de instantánea) y el 1213 (deadlock): la transacción
 * fallida se deshace entera y reintentar es repetir la misma intención. Si se agotan, el error sube.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  type AlcancePublicidad,
  type EstadoEmpresa,
  type EstadoPublicidad,
  type EstadoVisiblePublicidad,
  MSG_MOTIVO_RETIRADA_PUBLICIDAD,
  MSG_TIPO_NEGOCIO_DESCONOCIDO,
  PUBLICIDAD_DESTINO_MAX,
  PUBLICIDAD_DIAS_MAX,
  PUBLICIDAD_DIAS_MIN,
  PUBLICIDAD_MAX_POR_ZONA,
  PUBLICIDAD_NOMBRE_MAX,
  PUBLICIDAD_PAGINA,
  PUBLICIDAD_PAISES_MAX,
  PUBLICIDAD_RESERVA_MAX_DIAS,
  PUBLICIDAD_TEXTO_MAX,
  RADIO_PUBLICIDAD_KM,
  type TipoNegocio,
  ZONA_GLOBAL,
} from "@/config/constants";
import { AlcancePublicidadSchema, MotivoRetiradaPublicidadSchema } from "@/config/esquemas";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  codificarCursorTiempo,
  conKeysetTiempo,
  decodificarCursorTiempo,
} from "@/lib/cursor-tiempo";
import { puedeComprarAlcance, puedeOperarEmpresa, tipoNegocioDe } from "@/lib/empresa";
import type { Ubicacion } from "@/lib/geo";
import { nombrePais } from "@/lib/paises";
import {
  type CampanaEnReparto,
  type GrupoEspectadores,
  claveDia,
  costeTotal,
  destinoValido,
  diaDe,
  diasSeguidos,
  accionesPublicidad,
  estadoVisiblePublicidad,
  estimacionDelCalendario,
  nivelesDeRespaldo,
  sumarDias,
  tarifaPorDia,
  zonasDeCampana,
} from "@/lib/publicidad";
import type { Db } from "@/server/db/types";
import { ciudadesEnRadio } from "@/server/geo/ubicacion";

import { aforoEnCascada, medianasAforo } from "./aforo";
import { saldoCreditosEmpresa } from "./creditos";
import { bloquearEmpresa, conReintentos } from "./publicidad-cerrojos";
import { cobrarDiaEnTx, diaDevuelto, inicioDelCobro } from "./publicidad-consumo";

// ---------------------------------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------------------------------

export type CodigoPublicidad =
  | "NO_EXISTE"
  | "EMPRESA_NO_OPERA"
  | "ALCANCE_NO_PERMITIDO"
  | "ZONA_NO_VALIDA"
  | "FECHA_FUERA_DE_PLAZO"
  | "SIN_IMAGEN"
  | "SALDO_INSUFICIENTE"
  | "ESTADO_NO_PERMITE"
  | "TIPO_NEGOCIO_DESCONOCIDO";

/** Un rechazo ESPERABLE, con su frase para la empresa. La ruta lo traduce a 4xx. */
export class PublicidadError extends Error {
  constructor(
    public readonly code: CodigoPublicidad,
    message: string,
  ) {
    super(message);
    this.name = "PublicidadError";
  }
}

const MSG_NO_EXISTE = "Esa campaña no existe.";
const MSG_NO_OPERA = "Tu empresa tiene que estar verificada para crear o activar campañas.";

// ---------------------------------------------------------------------------------------------------
// El alta (borrador)
// ---------------------------------------------------------------------------------------------------

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * LO QUE LLEGA DEL FORMULARIO. Llega como texto (multipart): los números y la lista de países se
 * convierten aquí. El alcance y la zona se validan contra el CATÁLOGO y el tipo de negocio después,
 * en `crearBorrador`, que es quien sabe de qué empresa es.
 */
export const campanaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "Ponle un nombre a la campaña (al menos 3 caracteres).")
    .max(PUBLICIDAD_NOMBRE_MAX),
  alcance: AlcancePublicidadSchema,
  ciudadId: z.coerce.number().int().positive().optional(),
  estadoCodigo: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}\.[A-Z0-9]{1,16}$/)
    .optional(),
  paises: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((p) => p.trim().toUpperCase())
        .filter((p) => /^[A-Z]{2}$/.test(p)),
    ),
  texto: z
    .string()
    .trim()
    .min(3, "Escribe el texto del anuncio (al menos 3 caracteres).")
    .max(PUBLICIDAD_TEXTO_MAX),
  destinoUrl: z
    .string()
    .trim()
    .max(PUBLICIDAD_DESTINO_MAX)
    .refine(destinoValido, "El enlace tiene que ser una dirección web completa (https://…)."),
  fechaInicio: z.string().regex(DIA_ISO, "Elige el día en que empieza."),
  dias: z.coerce
    .number()
    .int()
    .min(PUBLICIDAD_DIAS_MIN)
    .max(PUBLICIDAD_DIAS_MAX, `Como mucho ${PUBLICIDAD_DIAS_MAX} días por campaña.`),
});
export type DatosCampana = z.infer<typeof campanaSchema>;

/** El nombre del fichero de la imagen en el volumen de portadas: derivado del id, sin nada que escapar. */
export function nombreImagenPublicidad(publicidadId: string): string {
  return `publicidad-${publicidadId}.webp`;
}

/** ¿Empieza ese día dentro del plazo? De hoy a hoy + `PUBLICIDAD_RESERVA_MAX_DIAS`. */
function dentroDePlazo(inicio: Date, ahora: Date): boolean {
  const hoy = diaDe(ahora);
  return inicio >= hoy && inicio <= sumarDias(hoy, PUBLICIDAD_RESERVA_MAX_DIAS);
}

function diaDeTexto(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

interface EmpresaParaOperar {
  estado: EstadoEmpresa;
  tipoNegocio: TipoNegocio;
  paisIso: string;
  /** Los créditos de publicidad que tiene, LEÍDOS por el módulo de créditos (que es quien los escribe). */
  saldo: number;
}

async function empresaParaOperar(db: Db, empresaId: string): Promise<EmpresaParaOperar> {
  const e = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { estado: true, tipoNegocio: true, paisIso: true },
  });
  if (!e || !puedeOperarEmpresa(e.estado as EstadoEmpresa)) {
    throw new PublicidadError("EMPRESA_NO_OPERA", MSG_NO_OPERA);
  }
  // EL TIPO SE VALIDA (`tipoNegocioDe`), no se convierte con `as`: con un valor fuera del catálogo,
  // `ALCANCES_POR_NEGOCIO[x]` era `undefined` y crear o activar una campaña daba un 500. Ahora es un
  // rechazo claro, con la misma frase que el aviso de «Nueva campaña». Al log, el id; nunca el valor.
  const tipoNegocio = tipoNegocioDe(e.tipoNegocio);
  if (!tipoNegocio) {
    console.warn(`[publicidad] tipo de negocio fuera del catálogo en la empresa ${empresaId}`);
    throw new PublicidadError("TIPO_NEGOCIO_DESCONOCIDO", MSG_TIPO_NEGOCIO_DESCONOCIDO);
  }
  return {
    estado: e.estado as EstadoEmpresa,
    tipoNegocio,
    paisIso: e.paisIso,
    saldo: await saldoCreditosEmpresa(db, empresaId),
  };
}

/**
 * LA ZONA, CONTRA EL CATÁLOGO. Un negocio FÍSICO compra ciudad o estado DE SU PAÍS (decidido en P6:
 * elige del catálogo por campaña, acotado al país de la empresa). Uno ONLINE o de marca, países que
 * existan en el catálogo, o Global.
 */
async function validarZona(
  db: Db,
  empresa: EmpresaParaOperar,
  datos: Pick<DatosCampana, "alcance" | "ciudadId" | "estadoCodigo" | "paises">,
): Promise<{ ciudadId: number | null; estadoCodigo: string | null; paises: string[] }> {
  if (!puedeComprarAlcance(empresa.tipoNegocio, datos.alcance)) {
    throw new PublicidadError(
      "ALCANCE_NO_PERMITIDO",
      "Tu tipo de negocio no puede comprar ese alcance.",
    );
  }
  const malaZona = (m: string) => new PublicidadError("ZONA_NO_VALIDA", m);
  switch (datos.alcance) {
    case "CIUDAD": {
      if (!datos.ciudadId) throw malaZona("Elige la ciudad de la lista.");
      const c = await db.ciudad.findUnique({
        where: { id: datos.ciudadId },
        select: { paisIso: true },
      });
      if (!c || c.paisIso !== empresa.paisIso) throw malaZona("Elige una ciudad de tu país.");
      return { ciudadId: datos.ciudadId, estadoCodigo: null, paises: [] };
    }
    case "ESTADO": {
      const codigo = datos.estadoCodigo;
      if (!codigo || !codigo.startsWith(`${empresa.paisIso}.`)) {
        throw malaZona("Elige una región de tu país.");
      }
      const existe = await db.ciudad.findFirst({
        where: { estadoCodigo: codigo },
        select: { id: true },
      });
      if (!existe) throw malaZona("Elige una región de la lista.");
      return { ciudadId: null, estadoCodigo: codigo, paises: [] };
    }
    case "PAIS": {
      const paises = [...new Set(datos.paises)];
      if (paises.length === 0) throw malaZona("Elige al menos un país.");
      if (paises.length > PUBLICIDAD_PAISES_MAX) {
        throw malaZona(`Como mucho ${PUBLICIDAD_PAISES_MAX} países por campaña.`);
      }
      const conocidos = await db.ciudad.findMany({
        where: { paisIso: { in: paises } },
        distinct: ["paisIso"],
        select: { paisIso: true },
      });
      if (conocidos.length !== paises.length) throw malaZona("Alguno de los países no es válido.");
      return { ciudadId: null, estadoCodigo: null, paises: paises.sort() };
    }
    case "GLOBAL":
      return { ciudadId: null, estadoCodigo: null, paises: [] };
  }
}

/**
 * CREA UNA CAMPAÑA EN BORRADOR. No ocupa ni un día ni mueve un crédito: el borrador es el sitio donde
 * la empresa ve la estimación y el coste ANTES de activar. La imagen se guarda después, con el id.
 */
export async function crearBorrador(
  db: Db,
  empresaId: string,
  datos: DatosCampana,
  ahora: Date = new Date(),
): Promise<{ id: string }> {
  const empresa = await empresaParaOperar(db, empresaId);
  const zona = await validarZona(db, empresa, datos);
  const inicio = diaDeTexto(datos.fechaInicio);
  if (!dentroDePlazo(inicio, ahora)) {
    throw new PublicidadError(
      "FECHA_FUERA_DE_PLAZO",
      `La campaña tiene que empezar entre hoy y dentro de ${PUBLICIDAD_RESERVA_MAX_DIAS} días.`,
    );
  }
  const creada = await db.publicidad.create({
    data: {
      empresaId,
      nombre: datos.nombre,
      alcance: datos.alcance,
      ciudadId: zona.ciudadId,
      estadoCodigo: zona.estadoCodigo,
      texto: datos.texto,
      destinoUrl: datos.destinoUrl,
      fechaInicio: inicio,
      diasContratados: datos.dias,
      paises: { create: zona.paises.map((paisIso) => ({ paisIso })) },
    },
    select: { id: true },
  });
  return creada;
}

/** Apunta la imagen ya guardada. Con el ámbito dentro del where: una campaña ajena no se toca. */
export async function apuntarImagenPublicidad(
  db: Db,
  empresaId: string,
  publicidadId: string,
  url: string,
): Promise<boolean> {
  const r = await db.publicidad.updateMany({
    where: { id: publicidadId, empresaId },
    data: { imagen: url },
  });
  return r.count === 1;
}

/**
 * BORRA UN BORRADOR (y solo un borrador: una campaña que llegó a ocupar días es historia). Devuelve si
 * borró algo; quien llama borra después el fichero de la imagen.
 */
export async function borrarBorrador(
  db: Db,
  empresaId: string,
  publicidadId: string,
): Promise<boolean> {
  const r = await db.publicidad.deleteMany({
    where: { id: publicidadId, empresaId, estado: "BORRADOR" },
  });
  return r.count === 1;
}

// ---------------------------------------------------------------------------------------------------
// La ocupación
// ---------------------------------------------------------------------------------------------------

/** Lleno: el primer día (de la primera zona) en el que no quedó posición. Interno: deshace la tx. */
class ZonaLlena extends Error {
  constructor(public readonly dia: Date) {
    super("ZONA_LLENA");
    this.name = "ZonaLlena";
  }
}

/**
 * OCUPA esos días en esas zonas para la campaña, o lanza `ZonaLlena` (y la transacción de quien llama
 * se deshace entera: nada a medias). Por zona y por posición, un INSERT IGNORE con todos los días aún
 * sin plaza; después se leen los días que ya son suyos (las filas propias se ven dentro de la propia
 * transacción). El único (publicidadId, zonaClave, dia) impide además que una campaña coja dos plazas
 * del mismo día.
 */
async function ocuparDias(
  tx: Db,
  publicidadId: string,
  zonas: readonly string[],
  dias: readonly Date[],
): Promise<void> {
  for (const zona of zonas) {
    let pendientes = [...dias];
    for (
      let posicion = 1;
      posicion <= PUBLICIDAD_MAX_POR_ZONA && pendientes.length > 0;
      posicion += 1
    ) {
      const filas = pendientes.map(
        (dia) =>
          Prisma.sql`(${randomUUID()}, ${zona}, ${dia}, ${posicion}, ${publicidadId}, NOW(3))`,
      );
      await tx.$executeRaw`
        INSERT IGNORE INTO \`ZonaOcupacion\` (\`id\`, \`zonaClave\`, \`dia\`, \`posicion\`, \`publicidadId\`, \`createdAt\`)
        VALUES ${Prisma.join(filas)}`;
      const mias = await tx.zonaOcupacion.findMany({
        where: { publicidadId, zonaClave: zona, dia: { in: pendientes } },
        select: { dia: true },
      });
      const tomados = new Set(mias.map((m) => claveDia(m.dia)));
      pendientes = pendientes.filter((d) => !tomados.has(claveDia(d)));
    }
    if (pendientes.length > 0) throw new ZonaLlena(pendientes[0]!);
  }
}

/**
 * LA PRIMERA FECHA LIBRE para `dias` días seguidos en todas esas zonas, desde `desde` y empezando como
 * tarde dentro del horizonte de reserva. SE LEE SIN CERROJO y es correcto: solo es una SUGERENCIA para
 * la pantalla; quien decide es `ocuparDias` al activar, y si entretanto se llena, lo dirá.
 */
export async function primeraFechaLibre(
  db: Db,
  zonas: readonly string[],
  dias: number,
  desde: Date,
  ahora: Date = new Date(),
): Promise<Date | null> {
  const limite = sumarDias(diaDe(ahora), PUBLICIDAD_RESERVA_MAX_DIAS);
  if (desde > limite) return null;
  const hasta = sumarDias(limite, dias);
  const filas = await db.zonaOcupacion.groupBy({
    by: ["zonaClave", "dia"],
    where: { zonaClave: { in: [...zonas] }, dia: { gte: desde, lt: hasta } },
    _count: { _all: true },
  });
  const llenos = new Set(
    filas
      .filter((f) => f._count._all >= PUBLICIDAD_MAX_POR_ZONA)
      .map((f) => `${f.zonaClave}|${claveDia(f.dia)}`),
  );
  for (let s = desde; s <= limite; s = sumarDias(s, 1)) {
    const cabe = diasSeguidos(s, dias).every((d) =>
      zonas.every((z) => !llenos.has(`${z}|${claveDia(d)}`)),
    );
    if (cabe) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Las acciones (activar, pausar, reanudar, terminar)
// ---------------------------------------------------------------------------------------------------

const TX_OPCIONES = { maxWait: 10_000, timeout: 20_000 } as const;

interface FilaBloqueada {
  id: string;
  estado: EstadoPublicidad;
  alcance: AlcancePublicidad;
  ciudadId: number | null;
  estadoCodigo: string | null;
  imagen: string | null;
  fechaInicio: Date;
  diasContratados: number;
  creditosPorDia: number | null;
  /** P8: si la pausó el umbral de denuncias (EN REVISIÓN). */
  ocultoAutoEn: Date | null;
}

/** BLOQUEA la campaña (FOR UPDATE) CON SU ÁMBITO DENTRO, y la devuelve con sus países. */
async function bloquear(
  tx: Db,
  empresaId: string,
  publicidadId: string,
): Promise<FilaBloqueada & { paises: string[] }> {
  const filas = await tx.$queryRaw<FilaBloqueada[]>`
    SELECT \`id\`, \`estado\`, \`alcance\`, \`ciudadId\`, \`estadoCodigo\`, \`imagen\`, \`fechaInicio\`,
           \`diasContratados\`, \`creditosPorDia\`, \`ocultoAutoEn\`
    FROM \`Publicidad\` WHERE \`id\` = ${publicidadId} AND \`empresaId\` = ${empresaId} FOR UPDATE`;
  const f = filas[0];
  if (!f) throw new PublicidadError("NO_EXISTE", MSG_NO_EXISTE);
  const paises = await tx.publicidadPais.findMany({
    where: { publicidadId },
    select: { paisIso: true },
  });
  return {
    ...f,
    diasContratados: Number(f.diasContratados),
    creditosPorDia: f.creditosPorDia === null ? null : Number(f.creditosPorDia),
    ciudadId: f.ciudadId === null ? null : Number(f.ciudadId),
    paises: paises.map((p) => p.paisIso),
  };
}

/** El calendario que ya tiene una campaña: si ocupa hoy y si ocupa algo después. */
async function calendarioDe(
  tx: Db,
  publicidadId: string,
  ahora: Date,
): Promise<{ ocupaHoy: boolean; ocupaDespues: boolean; diasTenidos: number }> {
  const hoy = diaDe(ahora);
  const filas = await tx.zonaOcupacion.findMany({
    where: { publicidadId },
    distinct: ["dia"],
    select: { dia: true },
  });
  return {
    ocupaHoy: filas.some((f) => f.dia.getTime() === hoy.getTime()),
    ocupaDespues: filas.some((f) => f.dia > hoy),
    diasTenidos: filas.length,
  };
}

export type ResultadoOcupar =
  | { ok: true; inicio: Date; dias: number }
  | { ok: false; code: "ZONA_LLENA"; diaLleno: Date; primeraLibre: Date | null };

/**
 * LO COMPROMETIDO: lo que costarán los días que sus OTRAS campañas con intención de salir (ACTIVA:
 * activas y programadas) tienen ocupados y TODAVÍA NO HAN PAGADO, cada una con SU tarifa congelada. Las
 * pausadas y terminadas no comprometen nada: sus días por venir ya se liberaron.
 *
 * P9: el día que ya se cobró está DESCONTADO del saldo; contarlo también aquí lo restaría dos veces. Por
 * eso cuenta el día y no la fecha: HOY deja de contar en cuanto se cobra (al empezar el día), y no antes
 * —entre las 00:00 y el barrido todavía no está en el saldo—. Y no cuentan los días anteriores al inicio
 * del cobro (`inicioDelCobro`): esos no se cobran nunca. Días distintos (una campaña de varios países
 * ocupa una fila por país y día, y paga una vez por día).
 */
export async function compromisoDeEmpresa(
  db: Db,
  empresaId: string,
  ahora: Date = new Date(),
  excluirPublicidadId: string | null = null,
): Promise<number> {
  const inicio = await inicioDelCobro(db);
  const hoy = diaDe(ahora);
  const desde = inicio && inicio > hoy ? inicio : hoy;
  const filas = await db.$queryRaw<{ tarifa: number | bigint | null; dias: number | bigint }[]>`
    SELECT p.\`creditosPorDia\` AS tarifa, COUNT(DISTINCT z.\`dia\`) AS dias
    FROM \`ZonaOcupacion\` z JOIN \`Publicidad\` p ON p.\`id\` = z.\`publicidadId\`
    WHERE p.\`empresaId\` = ${empresaId} AND p.\`estado\` = 'ACTIVA'
      AND p.\`id\` <> ${excluirPublicidadId ?? ""} AND z.\`dia\` >= ${desde}
      AND NOT EXISTS (
        SELECT 1 FROM \`CreditoLedger\` c
        WHERE c.\`publicidadId\` = p.\`id\` AND c.\`dia\` = z.\`dia\` AND c.\`reason\` = 'CONSUMO'
      )
    GROUP BY p.\`id\`, p.\`creditosPorDia\``;
  return filas.reduce((s, f) => s + Number(f.tarifa ?? 0) * Number(f.dias), 0);
}

/**
 * COBRA HOY si el tramo que se acaba de ocupar EMPIEZA hoy (activar, reanudar, la reanudación al
 * absolver). Dentro de la transacción que ya bloqueó la Empresa, después de ocupar: el ledger va el
 * último en el orden de cerrojos. Si no alcanza el saldo es que algo se saltó `exigirSaldo`: se lanza
 * y se deshace todo, antes que ocupar una plaza sin pagarla.
 */
async function cobrarHoySiEmpieza(
  tx: Db,
  empresaId: string,
  publicidadId: string,
  inicio: Date,
  tarifa: number,
  ahora: Date,
): Promise<void> {
  const hoy = diaDe(ahora);
  if (inicio.getTime() !== hoy.getTime()) return;
  const r = await cobrarDiaEnTx(tx, {
    empresaId,
    publicidadId,
    dia: hoy,
    tarifa,
    inicio: await inicioDelCobro(tx),
  });
  if (r === "SIN_SALDO") {
    throw new PublicidadError(
      "SALDO_INSUFICIENTE",
      "No te quedan créditos de publicidad para el día de hoy.",
    );
  }
}

/**
 * EL CALENDARIO NUEVO TIENE QUE CABER EN LO DISPONIBLE: el saldo menos lo que ya está comprometido en
 * sus otras campañas. Comparar solo con el saldo dejaba a una empresa con 90 créditos activar varias
 * campañas de 60 días en zonas distintas y ocupar plazas que nunca podría pagar —y con tres plazas por
 * zona, eso bloquea zonas enteras con muy poco dinero—.
 */
function exigirSaldo(empresa: EmpresaParaOperar, coste: number, comprometido: number): void {
  const disponible = empresa.saldo - comprometido;
  if (disponible < coste) {
    throw new PublicidadError(
      "SALDO_INSUFICIENTE",
      comprometido > 0
        ? `Esta campaña necesita ${coste} créditos de publicidad. Tienes ${empresa.saldo}, pero ${comprometido} ya están comprometidos en tus otras campañas: te quedan ${Math.max(0, disponible)}.`
        : `Esta campaña necesita ${coste} créditos de publicidad y tienes ${empresa.saldo}.`,
    );
  }
}

/**
 * ACTIVA O PROGRAMA un borrador: congela la tarifa de hoy, comprueba el saldo del calendario ENTERO
 * (sin retenerlo), ocupa sus días y, si es de ciudad, despliega su radio de 100 km. Activa si empieza
 * hoy —y entonces cobra hoy en el acto—; queda PROGRAMADA (la reserva) si empieza después, y cada día
 * lo cobra el barrido al empezar el día (P9).
 *
 * `fechaInicio` permite aceptar la primera fecha libre que se ofreció; sin ella, la del borrador. Si la
 * zona está llena, no hace nada y devuelve el primer día lleno y la primera fecha libre.
 */
export async function activarPublicidad(
  db: PrismaClient,
  empresaId: string,
  publicidadId: string,
  opciones: { fechaInicio?: string; ahora?: Date } = {},
): Promise<ResultadoOcupar> {
  const ahora = opciones.ahora ?? new Date();
  let zonas: string[] = [];
  let inicio = diaDe(ahora);
  let dias = 0;
  try {
    return await conReintentos(() =>
      db.$transaction(async (tx) => {
        await bloquearEmpresa(tx, empresaId);
        const c = await bloquear(tx, empresaId, publicidadId);
        if (c.estado !== "BORRADOR") {
          throw new PublicidadError("ESTADO_NO_PERMITE", "Esa campaña ya no es un borrador.");
        }
        if (!c.imagen) {
          throw new PublicidadError(
            "SIN_IMAGEN",
            "La campaña no tiene imagen. Bórrala y créala de nuevo.",
          );
        }
        const empresa = await empresaParaOperar(tx, empresaId);
        // El alcance se vuelve a comprobar: la empresa pudo cambiar de tipo de negocio desde el borrador.
        await validarZona(tx, empresa, {
          ...c,
          ciudadId: c.ciudadId ?? undefined,
          estadoCodigo: c.estadoCodigo ?? undefined,
        });
        inicio = opciones.fechaInicio ? diaDeTexto(opciones.fechaInicio) : c.fechaInicio;
        if (!dentroDePlazo(inicio, ahora)) {
          throw new PublicidadError(
            "FECHA_FUERA_DE_PLAZO",
            `La campaña tiene que empezar entre hoy y dentro de ${PUBLICIDAD_RESERVA_MAX_DIAS} días.`,
          );
        }
        dias = c.diasContratados;
        const tarifa = tarifaPorDia(c.alcance, c.paises.length);
        exigirSaldo(
          empresa,
          costeTotal(tarifa, dias),
          await compromisoDeEmpresa(tx, empresaId, ahora, publicidadId),
        );
        zonas = zonasDeCampana(c);
        await ocuparDias(tx, publicidadId, zonas, diasSeguidos(inicio, dias));
        if (c.alcance === "CIUDAD" && c.ciudadId !== null) {
          const radio = await ciudadesEnRadio(tx, c.ciudadId, RADIO_PUBLICIDAD_KM);
          await tx.publicidadCiudad.createMany({
            data: radio.map((ciudadId) => ({ publicidadId, ciudadId })),
            skipDuplicates: true,
          });
        }
        await tx.publicidad.update({
          where: { id: publicidadId },
          data: {
            estado: "ACTIVA",
            fechaInicio: inicio,
            creditosPorDia: tarifa,
            activadaEn: ahora,
          },
        });
        // Si empieza HOY, HOY se cobra en el acto (P9): el barrido de la mañana ya pasó, y sin el cobro
        // del día no se sirve. El saldo alcanza: se acaba de exigir para el calendario entero.
        await cobrarHoySiEmpieza(tx, empresaId, publicidadId, inicio, tarifa, ahora);
        return { ok: true as const, inicio, dias };
      }, TX_OPCIONES),
    );
  } catch (e) {
    if (!(e instanceof ZonaLlena)) throw e;
    return {
      ok: false,
      code: "ZONA_LLENA",
      diaLleno: e.dia,
      primeraLibre: await primeraFechaLibre(db, zonas, dias, inicio, ahora),
    };
  }
}

/** Libera los días POR VENIR (los de después de hoy). Hoy se queda: es el día que ya está en curso. */
async function liberarFuturo(tx: Db, publicidadId: string, ahora: Date): Promise<number> {
  const r = await tx.zonaOcupacion.deleteMany({
    where: { publicidadId, dia: { gt: diaDe(ahora) } },
  });
  return r.count;
}

/**
 * PAUSA una campaña activa o programada: libera sus días por venir —si no, una campaña parada seguiría
 * bloqueando una de las plazas de la zona— y queda PAUSADA. Reanudar vuelve a ocupar lo que le falte.
 */
export async function pausarPublicidad(
  db: PrismaClient,
  empresaId: string,
  publicidadId: string,
  ahora: Date = new Date(),
): Promise<void> {
  await conReintentos(() =>
    db.$transaction(async (tx) => {
      const c = await bloquear(tx, empresaId, publicidadId);
      const visible = estadoVisiblePublicidad(
        c.estado,
        await calendarioDe(tx, publicidadId, ahora),
        c.ocultoAutoEn !== null,
      );
      if (!accionesPublicidad(visible).includes("PAUSAR")) {
        throw new PublicidadError(
          "ESTADO_NO_PERMITE",
          "Solo se puede pausar una campaña activa o programada.",
        );
      }
      await liberarFuturo(tx, publicidadId, ahora);
      await tx.publicidad.update({
        where: { id: publicidadId },
        data: { estado: "PAUSADA", pausadaEn: ahora },
      });
    }, TX_OPCIONES),
  );
}

/**
 * REANUDA una campaña pausada: vuelve a ocupar los días que le FALTAN (los contratados menos los que
 * ya tuvo) desde `fechaInicio` o desde el primer día que pueda —hoy, o mañana si hoy ya es suyo—, con
 * su tarifa CONGELADA (lo vendido no cambia de precio). Puede no caber: la plaza es de quien la ocupa,
 * y entretanto otra campaña pudo llenar la zona. Entonces devuelve la primera fecha libre.
 */
export async function reanudarPublicidad(
  db: PrismaClient,
  empresaId: string,
  publicidadId: string,
  opciones: { fechaInicio?: string; ahora?: Date } = {},
): Promise<ResultadoOcupar> {
  const ahora = opciones.ahora ?? new Date();
  const intento: IntentoReanudar = { zonas: [], inicio: diaDe(ahora), dias: 0 };
  try {
    return await conReintentos(() =>
      db.$transaction(async (tx) => {
        await bloquearEmpresa(tx, empresaId);
        return reanudarEnTx(tx, empresaId, publicidadId, ahora, opciones.fechaInicio, intento);
      }, TX_OPCIONES),
    );
  } catch (e) {
    if (!(e instanceof ZonaLlena)) throw e;
    return {
      ok: false,
      code: "ZONA_LLENA",
      diaLleno: e.dia,
      primeraLibre: await primeraFechaLibre(db, intento.zonas, intento.dias, intento.inicio, ahora),
    };
  }
}

/** Lo que intentó ocupar el último reanudar: con ello se busca la primera fecha libre si no cupo. */
interface IntentoReanudar {
  zonas: string[];
  inicio: Date;
  dias: number;
}

/**
 * EL CUERPO DE REANUDAR, el MISMO para la empresa (`reanudarPublicidad`) y para el admin al absolver
 * (`reanudarTrasAbsolverEnTx`): los días que le faltan, la tarifa congelada y lo comprometido. Corre
 * DENTRO de una transacción que YA bloqueó la Empresa como primera sentencia (orden Empresa →
 * Publicidad → ocupación). Si la zona está llena lanza `ZonaLlena` y deja apuntado en `intento` lo que
 * buscaba, para ofrecer la primera fecha libre.
 */
async function reanudarEnTx(
  tx: Db,
  empresaId: string,
  publicidadId: string,
  ahora: Date,
  fechaInicio: string | undefined,
  intento: IntentoReanudar,
): Promise<{ ok: true; inicio: Date; dias: number }> {
  const c = await bloquear(tx, empresaId, publicidadId);
  if (c.estado !== "PAUSADA") {
    throw new PublicidadError("ESTADO_NO_PERMITE", "Solo se puede reanudar una campaña pausada.");
  }
  // EN REVISIÓN (la pausó el umbral de denuncias): reanudarla sería saltarse la revisión. Lo comprueba
  // el SERVIDOR, no solo el botón: la puerta de verdad es esta. La absolución pasa porque levanta el
  // auto-oculto ANTES, por su única puerta (`levantarAutoOcultoEnTx`): no hay atajo que la salte.
  if (c.ocultoAutoEn !== null) {
    throw new PublicidadError(
      "ESTADO_NO_PERMITE",
      "La estamos revisando por unas denuncias. Podrás reanudarla cuando terminemos.",
    );
  }
  const empresa = await empresaParaOperar(tx, empresaId);
  const cal = await calendarioDe(tx, publicidadId, ahora);
  intento.dias = Math.max(0, c.diasContratados - cal.diasTenidos);
  // Mañana si hoy ya es suyo, o si HOY SE LE DEVOLVIÓ (P9): el umbral o la retirada le devolvieron el
  // día, y servirle el resto sería servirlo gratis. Vuelve al siguiente, con ese día recuperado.
  const hoyNo = cal.ocupaHoy || (await diaDevuelto(tx, publicidadId, diaDe(ahora)));
  const primerPosible = hoyNo ? sumarDias(diaDe(ahora), 1) : diaDe(ahora);
  intento.inicio = fechaInicio ? diaDeTexto(fechaInicio) : primerPosible;
  if (intento.inicio < primerPosible || !dentroDePlazo(intento.inicio, ahora)) {
    throw new PublicidadError(
      "FECHA_FUERA_DE_PLAZO",
      `Puede volver a empezar entre el ${claveDia(primerPosible)} y dentro de ${PUBLICIDAD_RESERVA_MAX_DIAS} días.`,
    );
  }
  if (intento.dias > 0) {
    // La tarifa CONGELADA al activar; un borrador nunca llega aquí, así que siempre la hay.
    exigirSaldo(
      empresa,
      costeTotal(c.creditosPorDia ?? 0, intento.dias),
      await compromisoDeEmpresa(tx, empresaId, ahora, publicidadId),
    );
    intento.zonas = zonasDeCampana(c);
    await ocuparDias(tx, publicidadId, intento.zonas, diasSeguidos(intento.inicio, intento.dias));
  }
  await tx.publicidad.update({
    where: { id: publicidadId },
    data: { estado: "ACTIVA", pausadaEn: null },
  });
  if (intento.dias > 0) {
    await cobrarHoySiEmpieza(
      tx,
      empresaId,
      publicidadId,
      intento.inicio,
      c.creditosPorDia ?? 0,
      ahora,
    );
  }
  return { ok: true as const, inicio: intento.inicio, dias: intento.dias };
}

/** Lo que pasó al intentar reanudar una campaña absuelta. El correo de la absolución dice cuál. */
export type ReanudacionTrasAbsolver =
  | { tipo: "REANUDADA"; inicio: Date; dias: number }
  /** Ya había tenido todos sus días: vuelve a ACTIVA, pero no le queda nada por mostrar. */
  | { tipo: "SIN_DIAS" }
  | { tipo: "ZONA_LLENA"; primeraLibre: Date | null }
  | { tipo: "SIN_SALDO" }
  | { tipo: "EMPRESA_NO_OPERA" };

/**
 * AL ABSOLVER, LA CAMPAÑA SE REANUDA SOLA (revisión de P8): absolver es decir que no hizo nada malo, y
 * obligar a la empresa a entrar a reanudarla, después de perder días por unas denuncias injustas, era
 * cargarle a ella el coste de nuestra revisión. Usa el MISMO cuerpo que su botón de reanudar.
 *
 * Dentro de la transacción del admin, que tiene que haber bloqueado la Empresa como PRIMERA sentencia
 * (`bloquearEmpresa`). Si no puede —zona llena, sin saldo para lo que le queda, empresa que ya no
 * opera— la absolución se confirma IGUAL y la campaña queda pausada: el intento se deshace con un
 * SAVEPOINT, porque `ocuparDias` deja filas escritas antes de saber que no cabe, y aquí no se puede
 * deshacer la transacción entera como hace el botón de la empresa. Los 1020/1213 NO se atrapan: suben y
 * reintentan la transacción entera, que es lo que toca.
 */
export async function reanudarTrasAbsolverEnTx(
  tx: Db,
  empresaId: string,
  publicidadId: string,
  ahora: Date,
): Promise<ReanudacionTrasAbsolver> {
  const intento: IntentoReanudar = { zonas: [], inicio: diaDe(ahora), dias: 0 };
  await tx.$executeRaw`SAVEPOINT reanudar_tras_absolver`;
  const deshacer = () => tx.$executeRaw`ROLLBACK TO SAVEPOINT reanudar_tras_absolver`;
  try {
    const r = await reanudarEnTx(tx, empresaId, publicidadId, ahora, undefined, intento);
    return r.dias > 0
      ? { tipo: "REANUDADA", inicio: r.inicio, dias: r.dias }
      : { tipo: "SIN_DIAS" };
  } catch (e) {
    if (e instanceof ZonaLlena) {
      await deshacer();
      return {
        tipo: "ZONA_LLENA",
        primeraLibre: await primeraFechaLibre(
          tx,
          intento.zonas,
          intento.dias,
          intento.inicio,
          ahora,
        ),
      };
    }
    if (e instanceof PublicidadError && e.code === "SALDO_INSUFICIENTE") {
      await deshacer();
      return { tipo: "SIN_SALDO" };
    }
    if (e instanceof PublicidadError && e.code === "EMPRESA_NO_OPERA") {
      await deshacer();
      return { tipo: "EMPRESA_NO_OPERA" };
    }
    throw e;
  }
}

/**
 * TERMINA una campaña antes de tiempo: libera sus días por venir y queda TERMINADA, para siempre. Lo
 * que ya tuvo se queda en su calendario (es lo que se le cobró, P9).
 */
export async function terminarPublicidad(
  db: PrismaClient,
  empresaId: string,
  publicidadId: string,
  ahora: Date = new Date(),
): Promise<void> {
  await conReintentos(() =>
    db.$transaction(async (tx) => {
      const c = await bloquear(tx, empresaId, publicidadId);
      const visible = estadoVisiblePublicidad(
        c.estado,
        await calendarioDe(tx, publicidadId, ahora),
        c.ocultoAutoEn !== null,
      );
      // EN REVISIÓN también se puede terminar: es suya y no esquiva nada (las denuncias siguen ahí).
      if (!accionesPublicidad(visible).includes("TERMINAR")) {
        throw new PublicidadError("ESTADO_NO_PERMITE", "Esa campaña ya no se puede terminar.");
      }
      await liberarFuturo(tx, publicidadId, ahora);
      await tx.publicidad.update({
        where: { id: publicidadId },
        data: { estado: "TERMINADA", terminadaEn: ahora },
      });
    }, TX_OPCIONES),
  );
}

// ---------------------------------------------------------------------------------------------------
// Lectura (el portal)
// ---------------------------------------------------------------------------------------------------

/** Lo que el portal enseña de una campaña. Sin nada interno: es de la propia empresa. */
export interface CampanaDeEmpresa {
  id: string;
  nombre: string;
  estado: EstadoVisiblePublicidad;
  alcance: AlcancePublicidad;
  zona: string;
  texto: string;
  destinoUrl: string;
  imagen: string | null;
  /** El calendario PEDIDO (borrador) o el primer día que tiene / tuvo. */
  inicioMs: number;
  /** El último día que tiene o tuvo. Null en un borrador o si ya no le queda ninguno. */
  finMs: number | null;
  diasContratados: number;
  /** Días que tiene o tuvo ocupados. */
  diasTenidos: number;
  /** La tarifa: la congelada si ya se vendió; la de hoy si es un borrador. */
  creditosPorDia: number;
  creadaMs: number;
  /**
   * P8: POR QUÉ LA RETIRÓ EL EQUIPO, ya en humano (de la lista cerrada); `null` si no está retirada. La
   * NOTA interna y QUIÉN la firmó no salen nunca de aquí: el select ni siquiera las pide.
   */
  motivoRetirada: string | null;
}

const SELECT_CAMPANA = {
  id: true,
  nombre: true,
  estado: true,
  alcance: true,
  ciudadId: true,
  estadoCodigo: true,
  texto: true,
  destinoUrl: true,
  imagen: true,
  fechaInicio: true,
  diasContratados: true,
  creditosPorDia: true,
  createdAt: true,
  ocultoAutoEn: true,
  retiradaMotivo: true,
  ciudad: { select: { nombre: true, estadoNombre: true } },
  paises: { select: { paisIso: true } },
} as const;

type FilaCampana = Prisma.PublicidadGetPayload<{ select: typeof SELECT_CAMPANA }>;

export interface ResumenCalendario {
  min: Date | null;
  max: Date | null;
  dias: number;
  ocupaHoy: boolean;
  ocupaDespues: boolean;
}

export async function calendarios(
  db: Db,
  ids: readonly string[],
  ahora: Date,
): Promise<Map<string, ResumenCalendario>> {
  const mapa = new Map<string, ResumenCalendario>();
  if (ids.length === 0) return mapa;
  const hoy = diaDe(ahora);
  const filas = await db.zonaOcupacion.findMany({
    where: { publicidadId: { in: [...ids] } },
    distinct: ["publicidadId", "dia"],
    select: { publicidadId: true, dia: true },
  });
  for (const f of filas) {
    const r = mapa.get(f.publicidadId) ?? {
      min: null,
      max: null,
      dias: 0,
      ocupaHoy: false,
      ocupaDespues: false,
    };
    r.min = r.min === null || f.dia < r.min ? f.dia : r.min;
    r.max = r.max === null || f.dia > r.max ? f.dia : r.max;
    r.dias += 1;
    if (f.dia.getTime() === hoy.getTime()) r.ocupaHoy = true;
    if (f.dia > hoy) r.ocupaDespues = true;
    mapa.set(f.publicidadId, r);
  }
  return mapa;
}

export async function nombresDeEstados(
  db: Db,
  codigos: readonly string[],
): Promise<Map<string, string>> {
  if (codigos.length === 0) return new Map();
  const filas = await db.ciudad.findMany({
    where: { estadoCodigo: { in: [...codigos] } },
    distinct: ["estadoCodigo"],
    select: { estadoCodigo: true, estadoNombre: true },
  });
  return new Map(filas.map((f) => [f.estadoCodigo ?? "", f.estadoNombre ?? f.estadoCodigo ?? ""]));
}

/**
 * LA ZONA EN HUMANO, sin ambigüedad: en GeoNames la ciudad y su región se llaman a menudo igual
 * («Valencia», «Valencia»), y una lista que dice «Valencia» en dos campañas distintas obliga a abrir las
 * dos para saber cuál es la región. Por eso cada alcance lleva su apellido.
 */
export function zonaLegible(
  f: Pick<FilaCampana, "alcance" | "estadoCodigo" | "ciudad" | "paises">,
  estados: Map<string, string>,
): string {
  switch (f.alcance as AlcancePublicidad) {
    case "CIUDAD":
      return `${f.ciudad?.nombre ?? "Ciudad"} y 100 km alrededor`;
    case "ESTADO":
      return `${estados.get(f.estadoCodigo ?? "") ?? f.estadoCodigo ?? ""} (toda la región)`;
    case "PAIS":
      return f.paises.map((p) => nombrePais(p.paisIso)).join(", ");
    case "GLOBAL":
      return "Todo el mundo";
  }
}

function aDto(
  f: FilaCampana,
  cal: ResumenCalendario | undefined,
  estados: Map<string, string>,
): CampanaDeEmpresa {
  const estado = f.estado as EstadoPublicidad;
  return {
    id: f.id,
    nombre: f.nombre,
    estado: estadoVisiblePublicidad(
      estado,
      { ocupaHoy: cal?.ocupaHoy ?? false, ocupaDespues: cal?.ocupaDespues ?? false },
      f.ocultoAutoEn !== null,
    ),
    alcance: f.alcance as AlcancePublicidad,
    zona: zonaLegible(f, estados),
    texto: f.texto,
    destinoUrl: f.destinoUrl,
    imagen: f.imagen,
    inicioMs: (cal?.min ?? f.fechaInicio).getTime(),
    finMs: cal?.max ? cal.max.getTime() : null,
    diasContratados: f.diasContratados,
    diasTenidos: cal?.dias ?? 0,
    creditosPorDia:
      f.creditosPorDia ??
      tarifaPorDia(f.alcance as AlcancePublicidad, Math.max(1, f.paises.length)),
    creadaMs: f.createdAt.getTime(),
    motivoRetirada: (() => {
      const m = MotivoRetiradaPublicidadSchema.safeParse(f.retiradaMotivo);
      return estado === "RETIRADA" && m.success ? MSG_MOTIVO_RETIRADA_PUBLICIDAD[m.data] : null;
    })(),
  };
}

/** LA LISTA DEL PORTAL, por KEYSET sobre (createdAt, id), con el ámbito compuesto con AND. */
export async function misPublicidades(
  db: Db,
  empresaId: string,
  opciones: { cursor?: string | null; ahora?: Date } = {},
): Promise<{ items: CampanaDeEmpresa[]; nextCursor: string | null }> {
  const ahora = opciones.ahora ?? new Date();
  const filas = await db.publicidad.findMany({
    where: conKeysetTiempo({ empresaId }, decodificarCursorTiempo(opciones.cursor)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PUBLICIDAD_PAGINA + 1,
    select: SELECT_CAMPANA,
  });
  const hayMas = filas.length > PUBLICIDAD_PAGINA;
  const pagina = hayMas ? filas.slice(0, PUBLICIDAD_PAGINA) : filas;
  const [cals, estados] = await Promise.all([
    calendarios(
      db,
      pagina.map((f) => f.id),
      ahora,
    ),
    nombresDeEstados(
      db,
      pagina.flatMap((f) => (f.estadoCodigo ? [f.estadoCodigo] : [])),
    ),
  ]);
  const ultima = pagina.at(-1);
  return {
    items: pagina.map((f) => aDto(f, cals.get(f.id), estados)),
    nextCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

/** UNA campaña de la empresa, o `null` (inexistente o ajena: lo mismo). */
export async function miPublicidad(
  db: Db,
  empresaId: string,
  publicidadId: string,
  ahora: Date = new Date(),
): Promise<CampanaDeEmpresa | null> {
  const f = await db.publicidad.findFirst({
    where: { id: publicidadId, empresaId },
    select: SELECT_CAMPANA,
  });
  if (!f) return null;
  const [cals, estados] = await Promise.all([
    calendarios(db, [f.id], ahora),
    nombresDeEstados(db, f.estadoCodigo ? [f.estadoCodigo] : []),
  ]);
  return aDto(f, cals.get(f.id), estados);
}

/** Los países que tiene el catálogo (los únicos que `validarZona` acepta), para el formulario. */
export async function paisesDelCatalogo(db: Db): Promise<Set<string>> {
  const filas = await db.ciudad.findMany({ distinct: ["paisIso"], select: { paisIso: true } });
  return new Set(filas.map((f) => f.paisIso));
}

/** Las regiones de un país, para el formulario (código y nombre), por nombre. */
export async function regionesDePais(
  db: Db,
  paisIso: string,
): Promise<{ codigo: string; nombre: string }[]> {
  const filas = await db.ciudad.findMany({
    where: { paisIso, estadoCodigo: { not: null } },
    distinct: ["estadoCodigo"],
    select: { estadoCodigo: true, estadoNombre: true },
  });
  return filas
    .map((f) => ({
      codigo: f.estadoCodigo as string,
      nombre: f.estadoNombre ?? (f.estadoCodigo as string),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// ---------------------------------------------------------------------------------------------------
// La estimación (§3.5 bis)
// ---------------------------------------------------------------------------------------------------

export type Estimacion =
  /** Hay tráfico medido en la zona: «unas N personas al día» (N puede ser 0 = menos de una). */
  | { tipo: "zona"; personas: number }
  /** La zona no tiene tráfico medido: la cifra de un nivel más amplio DE SU ESPACIO, diciendo cuál. */
  | { tipo: "respaldo"; zonaSinDatos: string; nivelNombre: string; personas: number }
  /** Ni la zona ni sus niveles: se dice, y no se ofrece la compra como si hubiera datos. */
  | { tipo: "sin-datos"; zonaSinDatos: string };

interface CampanaParaEstimar {
  id: string;
  alcance: AlcancePublicidad;
  ciudadId: number | null;
  estadoCodigo: string | null;
  paises: readonly string[];
}

const ALCANCES_DEL_ESPACIO: Record<"LOCAL" | "GLOBAL", AlcancePublicidad[]> = {
  LOCAL: ["CIUDAD", "ESTADO"],
  GLOBAL: ["PAIS", "GLOBAL"],
};

/**
 * LAS PERSONAS DE LA ZONA, PARTIDAS POR DÓNDE ESTÁN: los grupos con los que el repartidor decide. Cada
 * grupo es el nivel más fino que se conoce, para que la cascada se aplique bien (quien está en una
 * ciudad con campañas de ciudad no ve las de estado; quien está en un país con campañas de país no ve
 * las globales). El resto de un nivel (quien está en la región pero en ninguna ciudad medida) va en un
 * grupo propio, sin ciudad.
 */
async function gruposDeEspectadores(
  db: Db,
  c: CampanaParaEstimar,
  radio: readonly number[],
  ahora: Date,
): Promise<GrupoEspectadores[]> {
  const sinNada: Ubicacion = { paisIso: null, estadoCodigo: null, ciudadId: null };
  switch (c.alcance) {
    case "CIUDAD": {
      const ciudades = await db.ciudad.findMany({
        where: { id: { in: [...radio] } },
        select: { id: true, paisIso: true, estadoCodigo: true },
      });
      const med = await medianasAforo(
        db,
        "CIUDAD",
        ciudades.map((x) => String(x.id)),
        ahora,
      );
      return ciudades.map((x) => ({
        ubicacion: { paisIso: x.paisIso, estadoCodigo: x.estadoCodigo, ciudadId: x.id },
        personas: med.get(String(x.id)) ?? 0,
      }));
    }
    case "ESTADO": {
      const codigo = c.estadoCodigo as string;
      const pais = codigo.split(".")[0] ?? null;
      const ciudades = await db.ciudad.findMany({
        where: { estadoCodigo: codigo },
        select: { id: true },
      });
      const [medCiudades, medEstado] = await Promise.all([
        medianasAforo(
          db,
          "CIUDAD",
          ciudades.map((x) => String(x.id)),
          ahora,
        ),
        medianasAforo(db, "ESTADO", [codigo], ahora),
      ]);
      const porCiudad = ciudades.map((x) => ({
        ubicacion: { paisIso: pais, estadoCodigo: codigo, ciudadId: x.id },
        personas: medCiudades.get(String(x.id)) ?? 0,
      }));
      const enCiudades = porCiudad.reduce((s, g) => s + g.personas, 0);
      const resto = Math.max(0, (medEstado.get(codigo) ?? 0) - enCiudades);
      return [
        ...porCiudad,
        { ubicacion: { paisIso: pais, estadoCodigo: codigo, ciudadId: null }, personas: resto },
      ];
    }
    case "PAIS": {
      const med = await medianasAforo(db, "PAIS", c.paises, ahora);
      return c.paises.map((p) => ({
        ubicacion: { ...sinNada, paisIso: p },
        personas: med.get(p) ?? 0,
      }));
    }
    case "GLOBAL": {
      const paises = await db.aforoZonaDia.findMany({
        where: { alcance: "PAIS" },
        distinct: ["zona"],
        select: { zona: true },
      });
      const codigos = paises.map((p) => p.zona);
      const [med, medGlobal] = await Promise.all([
        medianasAforo(db, "PAIS", codigos, ahora),
        medianasAforo(db, "GLOBAL", [ZONA_GLOBAL], ahora),
      ]);
      const porPais = codigos.map((p) => ({
        ubicacion: { ...sinNada, paisIso: p },
        personas: med.get(p) ?? 0,
      }));
      const enPaises = porPais.reduce((s, g) => s + g.personas, 0);
      const resto = Math.max(0, (medGlobal.get(ZONA_GLOBAL) ?? 0) - enPaises);
      return [...porPais, { ubicacion: sinNada, personas: resto }];
    }
  }
}

/**
 * LAS OTRAS CAMPAÑAS DE SU ESPACIO día a día, en el rango del calendario: las que ocupan ese día, de
 * empresas verificadas y con intención de salir (ACTIVA). La competencia que el repartidor tendrá.
 */
async function competenciaPorDia(
  db: Db,
  propiaId: string,
  espacio: "LOCAL" | "GLOBAL",
  dias: readonly Date[],
): Promise<(dia: Date) => CampanaEnReparto[]> {
  if (dias.length === 0) return () => [];
  const filas = await db.zonaOcupacion.findMany({
    where: {
      dia: { gte: dias[0]!, lte: dias.at(-1)! },
      publicidadId: { not: propiaId },
      publicidad: {
        estado: "ACTIVA",
        alcance: { in: ALCANCES_DEL_ESPACIO[espacio] },
        empresa: { estado: "VERIFICADA" },
      },
    },
    distinct: ["publicidadId", "dia"],
    select: { publicidadId: true, dia: true },
  });
  const ids = [...new Set(filas.map((f) => f.publicidadId))];
  const detalles = ids.length
    ? await db.publicidad.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          alcance: true,
          estadoCodigo: true,
          paises: { select: { paisIso: true } },
          ciudades: { select: { ciudadId: true } },
        },
      })
    : [];
  const porId = new Map<string, CampanaEnReparto>(
    detalles.map((d) => [
      d.id,
      {
        id: d.id,
        alcance: d.alcance as AlcancePublicidad,
        estadoCodigo: d.estadoCodigo,
        paises: d.paises.map((p) => p.paisIso),
        ciudades: d.ciudades.map((x) => x.ciudadId),
      },
    ]),
  );
  const porDia = new Map<string, CampanaEnReparto[]>();
  for (const f of filas) {
    const c = porId.get(f.publicidadId);
    if (!c) continue;
    const k = claveDia(f.dia);
    porDia.set(k, [...(porDia.get(k) ?? []), c]);
  }
  return (dia) => porDia.get(claveDia(dia)) ?? [];
}

/** El nombre de la zona comprada y la cascada de respaldo de su espacio. */
async function respaldoDe(
  db: Db,
  c: CampanaParaEstimar,
): Promise<{
  zonaNombre: string;
  cascada: { nivel: "ESTADO" | "PAIS" | "GLOBAL"; zona: string; nombre: string }[];
}> {
  let zonaNombre = "esta zona";
  let pais: string | null = null;
  let estado: { codigo: string; nombre: string } | null = null;
  if (c.alcance === "CIUDAD" && c.ciudadId !== null) {
    const x = await db.ciudad.findUnique({
      where: { id: c.ciudadId },
      select: { nombre: true, paisIso: true, estadoCodigo: true, estadoNombre: true },
    });
    zonaNombre = x?.nombre ?? zonaNombre;
    pais = x?.paisIso ?? null;
    estado = x?.estadoCodigo
      ? { codigo: x.estadoCodigo, nombre: x.estadoNombre ?? x.estadoCodigo }
      : null;
  } else if (c.alcance === "ESTADO" && c.estadoCodigo) {
    const nombres = await nombresDeEstados(db, [c.estadoCodigo]);
    zonaNombre = nombres.get(c.estadoCodigo) ?? c.estadoCodigo;
    pais = c.estadoCodigo.split(".")[0] ?? null;
  } else if (c.alcance === "PAIS") {
    zonaNombre = c.paises.map((p) => nombrePais(p)).join(", ");
  } else {
    zonaNombre = "todo el mundo";
  }
  type Nivel = { nivel: "ESTADO" | "PAIS" | "GLOBAL"; zona: string; nombre: string };
  const cascada = nivelesDeRespaldo(c.alcance).flatMap((nivel): Nivel[] => {
    if (nivel === "ESTADO")
      return estado ? [{ nivel, zona: estado.codigo, nombre: estado.nombre }] : [];
    if (nivel === "PAIS") return pais ? [{ nivel, zona: pais, nombre: nombrePais(pais) }] : [];
    return [{ nivel, zona: ZONA_GLOBAL, nombre: "todo el mundo" }];
  });
  return { zonaNombre, cascada };
}

/**
 * LA ESTIMACIÓN QUE SE ENSEÑA ANTES DE PAGAR: cuántas personas al día le tocarían a esta campaña con
 * ese calendario. Sale del aforo medido (la mediana de los días medidos) y del MISMO código que
 * reparte (`estimacionDelCalendario` → `elegiblesEnHueco`), con la competencia real de cada día. El
 * peor día, redondeado a la baja.
 *
 * Si la zona no tiene tráfico medido, se sube un nivel de SU espacio y se dice de cuál es la cifra; si
 * tampoco, se dice que no hay datos. Nunca un 0 sin explicar ni una media inventada.
 */
export async function estimarPublicidad(
  db: Db,
  c: CampanaParaEstimar,
  dias: readonly Date[],
  ahora: Date = new Date(),
): Promise<Estimacion> {
  const radio =
    c.alcance === "CIUDAD" && c.ciudadId !== null
      ? await ciudadesEnRadio(db, c.ciudadId, RADIO_PUBLICIDAD_KM)
      : [];
  const grupos = await gruposDeEspectadores(db, c, radio, ahora);
  const total = grupos.reduce((s, g) => s + g.personas, 0);
  if (total > 0) {
    const propia: CampanaEnReparto = {
      id: c.id,
      alcance: c.alcance,
      ciudades: radio,
      estadoCodigo: c.estadoCodigo,
      paises: c.paises,
    };
    const espacio = c.alcance === "CIUDAD" || c.alcance === "ESTADO" ? "LOCAL" : "GLOBAL";
    const otras = await competenciaPorDia(db, c.id, espacio, dias);
    return { tipo: "zona", personas: estimacionDelCalendario(propia, grupos, dias, otras) };
  }
  const { zonaNombre, cascada } = await respaldoDe(db, c);
  const encontrado = await aforoEnCascada(
    db,
    cascada.map((z) => ({ nivel: z.nivel, zona: z.zona })),
    ahora,
  );
  if (!encontrado) return { tipo: "sin-datos", zonaSinDatos: zonaNombre };
  const nombre = cascada.find((z) => z.nivel === encontrado.nivel)?.nombre ?? "";
  return {
    tipo: "respaldo",
    zonaSinDatos: zonaNombre,
    nivelNombre: nombre,
    personas: encontrado.personas,
  };
}

/**
 * LA ESTIMACIÓN DE UNA CAMPAÑA DE LA EMPRESA, con su calendario: el pedido si es un borrador, lo que le
 * falta desde el primer día posible si está pausada. `null` en los demás estados (ya está vendida) o
 * si no es suya.
 */
export async function estimacionDeMiPublicidad(
  db: Db,
  empresaId: string,
  publicidadId: string,
  ahora: Date = new Date(),
): Promise<Estimacion | null> {
  const f = await db.publicidad.findFirst({
    where: { id: publicidadId, empresaId },
    select: {
      id: true,
      estado: true,
      alcance: true,
      ciudadId: true,
      estadoCodigo: true,
      fechaInicio: true,
      diasContratados: true,
      paises: { select: { paisIso: true } },
    },
  });
  if (!f || (f.estado !== "BORRADOR" && f.estado !== "PAUSADA")) return null;
  let dias: Date[];
  if (f.estado === "BORRADOR") {
    dias = diasSeguidos(f.fechaInicio, f.diasContratados);
  } else {
    const cal = await calendarioDe(db, f.id, ahora);
    const faltan = Math.max(0, f.diasContratados - cal.diasTenidos);
    if (faltan === 0) return null;
    dias = diasSeguidos(cal.ocupaHoy ? sumarDias(diaDe(ahora), 1) : diaDe(ahora), faltan);
  }
  return estimarPublicidad(
    db,
    {
      id: f.id,
      alcance: f.alcance as AlcancePublicidad,
      ciudadId: f.ciudadId,
      estadoCodigo: f.estadoCodigo,
      paises: f.paises.map((p) => p.paisIso),
    },
    dias,
    ahora,
  );
}

/** El saldo de créditos de la empresa (para las pantallas), por el lector del módulo de créditos. */
export async function saldoCreditosDe(
  db: Db,
  empresaId: string,
  opciones: { ahora?: Date; excluirPublicidadId?: string } = {},
): Promise<{ saldo: number; comprometido: number }> {
  const [saldo, comprometido] = await Promise.all([
    saldoCreditosEmpresa(db, empresaId),
    compromisoDeEmpresa(
      db,
      empresaId,
      opciones.ahora ?? new Date(),
      opciones.excluirPublicidadId ?? null,
    ),
  ]);
  return { saldo, comprometido };
}
