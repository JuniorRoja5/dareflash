/**
 * RETOS PÚBLICOS (Tramo 1) — lo que ve el USUARIO. Solo LECTURA de retos reales:
 *   - Listado de ACTIVOS (PUBLISHED con cierre futuro), orden por cierre más próximo.
 *   - Listado de CERRADOS (cierre pasado o status CLOSED) para la pestaña aparte.
 *   - Detalle por `publicCode` (clave autoritativa) con resolución del canónico (301 si el slug no
 *     coincide) y 404 si no existe o es DRAFT (no público).
 * Sin participación/voto/comentarios (tramo siguiente). El DTO expone solo lo de la doc.
 */
import "server-only";

/**
 * Lo que el PUBLICO no puede ver nunca: un reto borrado, o uno con el borrado ya pedido (en su gracia
 * de 7 dias). La gracia existe para que el ADMIN pueda arrepentirse, no para seguir enseñandolo.
 *
 * Va en una constante y no copiado en cada `where`: son varias consultas publicas y la que se olvide
 * el filtro enseña un reto que el admin dio por borrado — el fallo silencioso tipico.
 */
export const NO_BORRADO = { deletedAt: null, eliminacionProgramadaEn: null } as const;

import type { Prisma } from "@/generated/prisma/client";
import {
  codificarCursorTiempo,
  decodificarCursorTiempo,
  type PosicionTiempo,
} from "@/lib/cursor-tiempo";
import type { Db } from "@/server/db/types";

/** Campos que necesita la TARJETA (doc): título, premio, cierre, categoría + la URL canónica. */
export interface RetoPublicoVista {
  publicCode: string;
  slug: string;
  titulo: string;
  categoria: string;
  premioCents: number;
  /** Cierre ABSOLUTO en ms (deadline.getTime()); el cliente pinta la cuenta atrás. */
  deadlineMs: number;
  /** URL pública de la portada (Caddy) o null (placeholder). */
  coverImage: string | null;
  /**
   * RETO EXCLUSIVO DE VIP MYTHIC. Va en la TARJETA (no solo en el detalle) porque es lo que la
   * distingue en el listado: marco dorado y chapa. Y se expone a TODO EL MUNDO a propósito —el
   * exclusivo se ve, no se esconde— igual que `nivelMinimo`: lo que se bloquea es participar.
   */
  soloVip: boolean;
  /**
   * LA MARCA QUE PATROCINA, resuelta. Nombre y logo van JUNTOS porque se pintan juntos, y porque
   * sin nombre no hay patrocinio que enseñar (el admin no puede guardar uno sin marca).
   *
   * `null` = reto normal: así la tarjeta no mira tres campos y decide, o hay sponsor o no lo hay.
   * LA COMISIÓN NO ESTÁ AQUÍ, y es deliberado: es un trato con la marca y no sale de un DTO
   * público ni en un reto cerrado. Un usuario no tiene por qué saber cuánto se factura por él.
   */
  sponsor: SponsorVista | null;
}

/** Lo que se enseña de una marca: su nombre y, si lo hay, su logo. Ni un dato de dinero. */
export interface SponsorVista {
  nombre: string;
  /** URL pública del logo (Caddy) o `null`: una marca puede no tener logo y se pinta su nombre. */
  logo: string | null;
}

/** Detalle del reto (además de la tarjeta): id (para participar), descripción, reglas, ganadores... */
export interface RetoPublicoDetalle extends RetoPublicoVista {
  /** id interno del reto (challengeId): lo usa "Participar" para la subida; NO va en la tarjeta. */
  id: string;
  descripcion: string | null;
  reglas: string | null;
  winnersCount: number;
  prizeCurrency: string;
  status: string;
  /** APERTURA absoluta en ms. Va SOLO en el detalle (la tarjeta no la necesita): hace falta para
   *  decidir si el reto esta abierto con la MISMA regla que el servidor (`lib/reto-ventana`) — un
   *  reto PUBLISHED pero aun sin empezar no admite votos, y sin este dato la vista no lo sabia. */
  startsAtMs: number;
  /** Clave del nivel MINIMO para participar (`rookie` = todos). Ver `lib/nivel-reto`. La vista lo
   *  usa para pintar el candado con la MISMA regla que aplica el servidor al rechazar. */
  nivelMinimo: string;
}

const SELECT_VISTA = {
  publicCode: true,
  slug: true,
  title: true,
  category: true,
  prizeAmountCents: true,
  deadline: true,
  coverImage: true,
  soloVip: true,
  esPatrocinado: true,
  sponsorNombre: true,
  sponsorLogo: true,
  // `comisionBps` NO se selecciona: lo que no se trae no se puede filtrar por descuido en un DTO.
  // Es la misma puerta de fuera que usa el historial de boosts con la nota del admin.
} as const;

type FilaVista = {
  publicCode: string;
  slug: string;
  title: string;
  category: string;
  prizeAmountCents: number;
  deadline: Date;
  coverImage: string | null;
  soloVip: boolean;
  esPatrocinado: boolean;
  sponsorNombre: string | null;
  sponsorLogo: string | null;
};

function aVista(f: FilaVista): RetoPublicoVista {
  return {
    publicCode: f.publicCode,
    slug: f.slug,
    titulo: f.title,
    categoria: f.category,
    premioCents: f.prizeAmountCents,
    deadlineMs: f.deadline.getTime(),
    coverImage: f.coverImage,
    soloVip: f.soloVip,
    // LAS DOS CONDICIONES, y no solo el flag: un reto marcado como patrocinado al que le falte el
    // nombre (una fila vieja, un arreglo a mano en la base de datos) pintaría "Patrocinado por" y
    // un hueco. Sin nombre, no hay sponsor que enseñar.
    sponsor:
      f.esPatrocinado && f.sponsorNombre ? { nombre: f.sponsorNombre, logo: f.sponsorLogo } : null,
  };
}

/**
 * NINGUNA DE ESTAS CONSULTAS FILTRA POR `soloVip`, Y ES LA DECISIÓN DE LA PIEZA.
 *
 * Un reto exclusivo SE VE para todo el mundo —con su marco dorado, que es medio gancho— y lo único
 * que se bloquea es PARTICIPAR, exactamente como `nivelMinimo`. Esconderlo a quien no es VIP
 * convertiría la función en invisible justo para el público al que quiere convencer, y además
 * dejaría un reto con premio del que nadie sabría nada. `tests/retos-vip` lo fija.
 */

/**
 * ACTIVOS: PUBLISHED con cierre futuro, orden por cierre ASC (el que cierra antes, primero).
 *
 * SIN PAGINAR, Y A PROPÓSITO: la lista está acotada por una VENTANA (`deadline > ahora`), así que no
 * crece con el uso —cada reto sale solo de ella al cerrar— sino con cuántos tenga el admin abiertos
 * a la vez, que es una decisión suya y del orden de la decena. El `limite` es el techo duro por si
 * esa suposición deja de ser cierta. La que sí crece para siempre es la de CERRADOS, aquí debajo, y
 * esa va por keyset.
 */
export async function listarRetosPublicos(
  db: Db,
  ahora: Date,
  limite = 100,
): Promise<RetoPublicoVista[]> {
  const filas = await db.challenge.findMany({
    where: { ...NO_BORRADO, status: "PUBLISHED", deadline: { gt: ahora } },
    orderBy: [{ deadline: "asc" }, { id: "asc" }],
    take: limite,
    select: SELECT_VISTA,
  });
  return filas.map(aVista);
}

/** Tope de una página de cerrados. Es una rejilla de dos columnas: 24 son 12 filas en móvil. */
export const CERRADOS_LIMITE = 24;

export interface PaginaRetosCerrados {
  items: RetoPublicoVista[];
  /** Cursor de la página siguiente, o `null` si no hay más. */
  nextCursor: string | null;
}

/**
 * EL KEYSET DE CERRADOS, sobre `deadline` y no sobre `createdAt`.
 *
 * Por eso no usa `dondeDesde` de `lib/cursor-tiempo`: el CODEC del cursor sí se reutiliza (es la
 * misma tupla `<ms>.<id>` y la misma validación), pero la columna de orden es otra. Escribir aquí
 * el `where` es más honesto que generalizar el helper con un nombre de columna en una cadena, que
 * es como se pierde la comprobación de tipos justo en el sitio donde más duele.
 */
function despuesDeCierre(desde: PosicionTiempo | null): Prisma.ChallengeWhereInput {
  if (!desde) return {};
  const en = new Date(desde.creadoMs);
  // Las DOS ramas: sin la del desempate, dos retos cerrados por el mismo barrido —que comparten
  // `deadline` al milisegundo más a menudo de lo que parece— se saltan o se repiten.
  return { OR: [{ deadline: { lt: en } }, { deadline: en, id: { lt: desde.id } }] };
}

/**
 * CERRADOS: cierre pasado (aunque sigan PUBLISHED) o status CLOSED. Orden por cierre más reciente.
 *
 * ┌─ ESTA SÍ CRECE PARA SIEMPRE ────────────────────────────────────────────────────────────────┐
 * │ Un reto cerrado no vuelve a salir de aquí nunca. Antes la consulta traía las 100 primeras y  │
 * │ no había más: a partir del reto 101, el histórico simplemente no existía para el público, y  │
 * │ nada lo decía. Ahora va por KEYSET con "Ver más".                                            │
 * │                                                                                               │
 * │ EL ORDEN DESEMPATA HACIA EL MISMO LADO (`deadline desc, id desc`). Antes era `deadline desc, │
 * │ id asc`: mezclar direcciones da un orden estable pero que NO se puede expresar como un solo  │
 * │ "lo que viene después de aquí", y el keyset se habría construido sobre arena.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export async function listarRetosCerrados(
  db: Db,
  ahora: Date,
  opts: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaRetosCerrados> {
  const limite = Math.min(Math.max(1, Math.floor(opts.limite ?? CERRADOS_LIMITE)), CERRADOS_LIMITE);
  const desde = decodificarCursorTiempo(opts.cursor);

  const filas = await db.challenge.findMany({
    // CON `AND`: el filtro ya trae su propio `OR` (CLOSED o vencido) y el keyset es otro. Fundirlos
    // con `...` dejaría solo uno, y la página 2 empezaría a servir retos abiertos.
    where: {
      AND: [
        {
          ...NO_BORRADO,
          OR: [{ status: "CLOSED" }, { status: "PUBLISHED", deadline: { lte: ahora } }],
        },
        despuesDeCierre(desde),
      ],
    },
    orderBy: [{ deadline: "desc" }, { id: "desc" }],
    // Una de más: así se sabe si hay siguiente sin un `count` aparte.
    take: limite + 1,
    select: { ...SELECT_VISTA, id: true },
  });

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  const ultima = pagina.at(-1);

  return {
    items: pagina.map(aVista),
    nextCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.deadline.getTime(), id: ultima.id })
        : null,
  };
}

/** Detalle por `publicCode`. DRAFT (no público) o inexistente -> null (el route hace 404). */
export async function retoPublicoPorCode(
  db: Db,
  publicCode: string,
): Promise<RetoPublicoDetalle | null> {
  const f = await db.challenge.findFirst({
    where: { ...NO_BORRADO, publicCode, status: { not: "DRAFT" } },
    select: {
      ...SELECT_VISTA,
      id: true,
      prizeCurrency: true,
      description: true,
      rules: true,
      winnersCount: true,
      status: true,
      startsAt: true,
      nivelMinimo: true,
    },
  });
  if (!f) return null;
  return {
    ...aVista(f),
    id: f.id,
    descripcion: f.description,
    reglas: f.rules,
    winnersCount: f.winnersCount,
    prizeCurrency: f.prizeCurrency,
    status: f.status,
    startsAtMs: f.startsAt.getTime(),
    nivelMinimo: f.nivelMinimo,
  };
}

/** Resolución del detalle a partir del segmento `{publicCode}-{slug}`: 404, 301 al canónico, u OK. */
export type ResolucionDetalle =
  | { tipo: "ok"; reto: RetoPublicoDetalle }
  | { tipo: "redirect"; a: string }
  | { tipo: "noEncontrado" };

/** publicCode = lo anterior al PRIMER guion (los codes base32 no llevan guion; el slug sí puede). */
export function extraerPublicCode(codigo: string): string {
  const i = codigo.indexOf("-");
  return i === -1 ? codigo : codigo.slice(0, i);
}

export async function resolverRetoDetalle(db: Db, codigo: string): Promise<ResolucionDetalle> {
  const reto = await retoPublicoPorCode(db, extraerPublicCode(codigo));
  if (!reto) return { tipo: "noEncontrado" };
  const canonico = `${reto.publicCode}-${reto.slug}`;
  if (codigo !== canonico) return { tipo: "redirect", a: `/retos/${canonico}` };
  return { tipo: "ok", reto };
}
