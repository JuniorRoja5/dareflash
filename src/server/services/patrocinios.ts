import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { comisionCents, totalSponsorCents } from "@/lib/comision";
import { csvDocumento } from "@/lib/csv";
import { codificarCursorTiempo, decodificarCursorTiempo, dondeDesde } from "@/lib/cursor-tiempo";
import { centimosAImporte } from "@/lib/dinero";

/**
 * LA CONTABILIDAD DE LOS PATROCINIOS — para que cobrar sea LEER UNA CIFRA.
 *
 * ┌─ ESTO NO MUEVE DINERO, Y NO PUEDE MOVERLO ───────────────────────────────────────────────────┐
 * │ El sponsor paga POR FUERA (no hay Stripe para esto) y el ganador cobra el premio íntegro por  │
 * │ el rail de siempre. Aquí solo se LEE: qué retos patrocinados hay, cuánto se le factura a cada │
 * │ marca y cuándo. Ni un `update`, ni un apunte, ni un saldo. Si algún día esto escribiera algo, │
 * │ habría dos verdades sobre el mismo dinero.                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA COMISIÓN SE CALCULA, NO SE GUARDA. Lo guardado es el PORCENTAJE del reto (`comisionBps`), y
 * el importe sale de él con `lib/comision` —la misma función que usa el formulario al pactarlo—.
 * Guardar el importe sería un tercer sitio donde el mismo número puede discrepar, y además
 * quedaría obsoleto si el admin corrige el premio antes de que el reto empiece.
 */

/** Tope de la página del panel. Igual de sobrio que el de las otras colas del panel. */
const PANEL_LIMITE = 25;

/** Tope de la exportación. Alto y explícito: lo que importa es que exista y que se diga. */
export const EXPORT_PATROCINIOS_TOPE = 5000;

export interface FilaPatrocinio {
  id: string;
  publicCode: string;
  titulo: string;
  marca: string;
  /** Premio del reto, en céntimos. Es lo que la marca pone para el ganador. */
  premioCents: number;
  comisionBps: number;
  /** Comisión en céntimos, derivada del premio y del % GUARDADO EN EL RETO. */
  comisionCents: number;
  /** Premio + comisión: la cifra que se le factura a la marca por este reto. */
  totalCents: number;
  moneda: string;
  /** Cuándo cierra (o cerró). El cobro se suele ordenar por aquí. */
  deadlineMs: number;
  /** `true` si el reto ya cerró: lo que está cerrado es lo que ya se puede facturar sin sorpresas. */
  cerrado: boolean;
  /** También exclusivo de VIP. Son ejes ortogonales y el panel los enseña por separado. */
  soloVip: boolean;
}

export interface PaginaPatrocinios {
  filas: FilaPatrocinio[];
  /** Cursor de la página siguiente, o `null` si no hay más. Keyset, nunca OFFSET. */
  proximoCursor: string | null;
}

/** Lo mínimo para la tabla y para el CSV. `comisionBps` SOLO sale por aquí: es dato de admin. */
const SELECT = {
  id: true,
  publicCode: true,
  title: true,
  sponsorNombre: true,
  prizeAmountCents: true,
  prizeCurrency: true,
  comisionBps: true,
  deadline: true,
  closedAt: true,
  soloVip: true,
  createdAt: true,
} as const;

type FilaCruda = {
  id: string;
  publicCode: string;
  title: string;
  sponsorNombre: string | null;
  prizeAmountCents: number;
  prizeCurrency: string;
  comisionBps: number;
  deadline: Date;
  closedAt: Date | null;
  soloVip: boolean;
  createdAt: Date;
};

function aFila(f: FilaCruda): FilaPatrocinio {
  return {
    id: f.id,
    publicCode: f.publicCode,
    titulo: f.title,
    // El schema no deja guardar un patrocinio sin marca; el `??` es para una fila vieja tocada a
    // mano, y dice lo que pasa en vez de pintar un hueco.
    marca: f.sponsorNombre ?? "(sin marca)",
    premioCents: f.prizeAmountCents,
    comisionBps: f.comisionBps,
    comisionCents: comisionCents(f.prizeAmountCents, f.comisionBps),
    totalCents: totalSponsorCents(f.prizeAmountCents, f.comisionBps),
    moneda: f.prizeCurrency,
    deadlineMs: f.deadline.getTime(),
    cerrado: f.closedAt !== null,
    soloVip: f.soloVip,
  };
}

/**
 * LOS RETOS PATROCINADOS, por fecha de creación descendente y por KEYSET.
 *
 * Nunca OFFSET: es la regla de paginación del repositorio entera, y aquí además la lista crece
 * sola con el tiempo. El cursor es la tupla `(createdAt, id)` compartida con el resto de colas.
 *
 * SIN FILTRO DE BORRADOS: un reto que el admin borró y que llegó a estar patrocinado SIGUE siendo
 * algo que se le facturó a una marca. Esconderlo aquí sería perder una línea de la contabilidad —
 * justo lo contrario de lo que esta pantalla existe para hacer.
 */
export async function listarPatrocinios(
  db: PrismaClient,
  opts: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaPatrocinios> {
  const limite = Math.min(Math.max(1, Math.floor(opts.limite ?? PANEL_LIMITE)), PANEL_LIMITE);
  const desde = decodificarCursorTiempo(opts.cursor);

  const filas = await db.challenge.findMany({
    where: { esPatrocinado: true, ...dondeDesde(desde) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // Una de más: así se sabe si hay siguiente sin un `count` aparte.
    take: limite + 1,
    select: SELECT,
  });

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  const ultima = pagina.at(-1);

  return {
    filas: pagina.map(aFila),
    proximoCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.createdAt.getTime(), id: ultima.id })
        : null,
  };
}

export interface Exportacion {
  csv: string;
  filas: number;
  /** `true` si se alcanzó el tope: hay más de las que caben, y la ruta tiene que decirlo. */
  truncada: boolean;
}

/**
 * CSV DE PATROCINIOS — lo que hay que facturar, reto a reto.
 *
 * SIN PAGINAR (una exportación partida en páginas no cuadra nada) pero CON TOPE, y el tope se dice.
 * Los importes van en unidades y no en céntimos: esto lo abre una hoja de cálculo y se va a sumar.
 */
export async function exportarPatrocinios(db: PrismaClient): Promise<Exportacion> {
  const crudas = await db.challenge.findMany({
    where: { esPatrocinado: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_PATROCINIOS_TOPE + 1,
    select: SELECT,
  });

  const truncada = crudas.length > EXPORT_PATROCINIOS_TOPE;
  const pagina = (truncada ? crudas.slice(0, EXPORT_PATROCINIOS_TOPE) : crudas).map(aFila);

  const csv = csvDocumento(
    [
      "reto",
      "codigo",
      "marca",
      "premio",
      "comision_pct",
      "comision",
      "total_a_cobrar",
      "moneda",
      "cierre",
      "estado",
      "solo_vip",
    ],
    pagina.map((f) => [
      f.titulo,
      f.publicCode,
      f.marca,
      centimosAImporte(f.premioCents),
      // El porcentaje va como NÚMERO (25, 25.5) para que la hoja pueda usarlo; el importe ya está
      // calculado al lado, así que nadie tiene que volver a multiplicar.
      f.comisionBps / 100,
      centimosAImporte(f.comisionCents),
      centimosAImporte(f.totalCents),
      f.moneda,
      new Date(f.deadlineMs).toISOString(),
      f.cerrado ? "cerrado" : "abierto",
      f.soloVip ? "si" : "no",
    ]),
  );

  return { csv, filas: pagina.length, truncada };
}

/**
 * CSV DE GANADORES — quién ganó qué, cuánto cobró y de qué TIPO era el reto.
 *
 * ┌─ EL IMPORTE SALE DE `ChallengeResult`, NO DEL RETO ──────────────────────────────────────────┐
 * │ Está CONGELADO ahí desde el cierre justamente para esto: si el admin edita el premio después │
 * │ —o la marca renegocia—, lo que se pagó no cambia. Leerlo del `Challenge` daría un CSV que no │
 * │ cuadra con el monedero de la persona.                                                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EL TIPO VA EN COLUMNAS SEPARADAS, NO EN UNA ────────────────────────────────────────────────┐
 * │ Patrocinado, solo-VIP y nivel mínimo son EJES ORTOGONALES: un reto puede ser los tres a la    │
 * │ vez. Colapsarlos en una columna "tipo" obligaría a inventar un orden de prioridad —y a perder │
 * │ los otros dos— justo en el fichero que se usa para cuadrar cuentas y responder preguntas.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * La comisión solo se rellena si el reto era patrocinado: una celda con 0 en los demás se sumaría.
 */
export async function exportarGanadores(db: PrismaClient): Promise<Exportacion> {
  const crudas = await db.challengeResult.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: EXPORT_PATROCINIOS_TOPE + 1,
    select: {
      id: true,
      userId: true,
      rank: true,
      prizeAmountCents: true,
      currency: true,
      createdAt: true,
      challenge: {
        select: {
          publicCode: true,
          title: true,
          esPatrocinado: true,
          sponsorNombre: true,
          comisionBps: true,
          prizeAmountCents: true,
          soloVip: true,
          nivelMinimo: true,
        },
      },
    },
  });

  const truncada = crudas.length > EXPORT_PATROCINIOS_TOPE;
  const pagina = truncada ? crudas.slice(0, EXPORT_PATROCINIOS_TOPE) : crudas;

  // El nombre de quien ganó, en una consulta y no una por fila.
  const usuarios = await db.user.findMany({
    where: { id: { in: [...new Set(pagina.map((f) => f.userId))] } },
    select: { id: true, username: true },
  });
  const porId = new Map(usuarios.map((u) => [u.id, u.username]));

  const csv = csvDocumento(
    [
      "fecha",
      "reto",
      "codigo",
      "puesto",
      "ganador",
      "premio_pagado",
      "moneda",
      "patrocinado",
      "sponsor",
      "comision",
      "solo_vip",
      "nivel_minimo",
    ],
    pagina.map((f) => {
      const c = f.challenge;
      return [
        f.createdAt.toISOString(),
        c.title,
        c.publicCode,
        f.rank,
        porId.get(f.userId) ?? "(cuenta borrada)",
        // CONGELADO: lo que de verdad se le acreditó.
        centimosAImporte(f.prizeAmountCents),
        f.currency,
        c.esPatrocinado ? "si" : "no",
        c.esPatrocinado ? (c.sponsorNombre ?? "(sin marca)") : null,
        // La comisión se calcula sobre el premio DEL RETO (que es lo que la marca puso), no sobre
        // lo que cobró este ganador: con varios premios, la factura de la marca es una, no una por
        // ganador. Vacío —no 0— cuando no hay patrocinio: un 0 en una columna de dinero se suma.
        c.esPatrocinado ? centimosAImporte(comisionCents(c.prizeAmountCents, c.comisionBps)) : null,
        c.soloVip ? "si" : "no",
        c.nivelMinimo,
      ];
    }),
  );

  return { csv, filas: pagina.length, truncada };
}
