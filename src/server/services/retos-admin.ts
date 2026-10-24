/**
 * RETOS · creación y publicación por el ADMIN (Fase 2 · M5). SOLO el admin crea retos (decisión de
 * producto, cerrada); los usuarios NUNCA. Aquí viven: el schema de dominio (Zod), la creación (siempre
 * DRAFT, con publicCode único reusando el generador ya testeado) y la publicación (DRAFT -> PUBLISHED,
 * idempotente). El guard de rol lo pone cada ENDPOINT (requireRole); este módulo no confía en la vista.
 */
import "server-only";

import { RETO_GRACIA_BORRADO_MS } from "@/config/constants";
// El calculo del estado vive en `lib` (puro, sin servidor) porque lo necesita TAMBIEN la lista del
// panel, que es un componente de CLIENTE: desde aqui no podria importarlo (este modulo es server-only).
export { type EstadoRetoAdmin, estadoRetoAdmin } from "@/lib/estado-reto";

import { z } from "zod";

import {
  CATEGORIES,
  type CategoryKey,
  COMISION_SPONSOR_BPS_DEFECTO,
  DEFAULT_CURRENCY,
  SPONSOR_NOMBRE_MAX,
} from "@/config/constants";
import { BPS } from "@/lib/comision";
import {
  codificarCursorTiempo,
  conKeysetTiempo,
  decodificarCursorTiempo,
} from "@/lib/cursor-tiempo";
import type { Db } from "@/server/db/types";
import { NIVEL_MINIMO_ABIERTO } from "@/lib/nivel-reto";
import { NIVELES, type ClaveNivel } from "@/lib/niveles";
import { slugDesdeTitulo } from "@/lib/reto-slug";

import { crearRetoConPublicCode } from "./reto-codigo";

/** Claves de las 14 categorías, como tupla para `z.enum`. Fuente única: CATEGORIES. */
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];

/** Claves de los niveles, como tupla para `z.enum`. Fuente unica: NIVELES (`lib/niveles`). */
const NIVEL_KEYS = NIVELES.map((n) => n.clave) as [ClaveNivel, ...ClaveNivel[]];

/**
 * UNA CASILLA DE UN FORMULARIO MULTIPART, leída como booleano.
 *
 * `z.coerce.boolean()` NO vale: `Boolean("false")` y `Boolean("0")` son `true`, así que desmarcar
 * la casilla no desmarcaría nada —el formulario manda "0"—. Se comparan las formas que de verdad
 * significan sí, la de una casilla HTML incluida (`on`). Ausente = `false`: una llamada que no
 * mande el campo no puede activar un candado por accidente.
 *
 * Compartido por las DOS casillas del reto (exclusivo y patrocinado) desde que son dos: escrita en
 * cada una, la segunda copia es la que se queda sin arreglar el día que aparezca otra forma.
 */
function booleanDeFormulario() {
  return z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) =>
      typeof v === "boolean" ? v : ["1", "true", "on", "si", "sí"].includes(v.toLowerCase()),
    );
}

const TITULO_MIN = 3;
const TITULO_MAX = 120;
const DESCRIPCION_MAX = 2000;
const REGLAS_MAX = 4000;

/**
 * Schema de creación de reto. FACTORÍA con `now` para poder testear "el cierre debe estar en el futuro"
 * de forma determinista. Reglas de dominio: título 3-120; categoría ∈ CATEGORIES; premio entero >= 0 en
 * céntimos; apertura < cierre y cierre en el futuro (UTC); ganadores >= 1. El
 * `status` NO viene del cuerpo: la creación es SIEMPRE DRAFT (publicar es una acción aparte).
 */
export function crearRetoSchema(now: Date) {
  return (
    z
      .object({
        title: z
          .string()
          .trim()
          .min(TITULO_MIN, `El título debe tener al menos ${TITULO_MIN} caracteres.`)
          .max(TITULO_MAX, `El título no puede pasar de ${TITULO_MAX} caracteres.`),
        description: z
          .string()
          .trim()
          .max(DESCRIPCION_MAX, "La descripción es demasiado larga.")
          .optional()
          .transform((s) => (s ? s : null)),
        category: z.enum(CATEGORY_KEYS, { message: "Elige una categoría de la lista." }),
        rules: z
          .string()
          .trim()
          .max(REGLAS_MAX, "Las reglas son demasiado largas.")
          .optional()
          .transform((s) => (s ? s : null)),
        prizeAmountCents: z.coerce
          .number({ message: "El premio debe ser un número." })
          .int("El premio debe ser un número entero de céntimos.")
          .min(0, "El premio no puede ser negativo."),
        startsAt: z.coerce.date({ message: "La fecha de apertura no es válida." }),
        deadline: z.coerce.date({ message: "La fecha de cierre no es válida." }),
        winnersCount: z.coerce
          .number({ message: "El número de ganadores debe ser un número." })
          .int("El número de ganadores debe ser entero.")
          .min(1, "Debe haber al menos 1 ganador."),
        /**
         * QUIÉN puede participar. Se guarda la CLAVE del nivel, no un número de puntos (ver el
         * comentario de la columna). Ausente = `rookie` = TODOS: así un formulario antiguo, o una
         * llamada que no lo mande, no restringe nada por accidente.
         */
        nivelMinimo: z.enum(NIVEL_KEYS).default(NIVEL_MINIMO_ABIERTO),
        /**
         * ¿RETO EXCLUSIVO PARA VIP MYTHIC? Ausente = `false` = reto normal: un formulario que no mande
         * el campo no puede convertir un reto abierto en exclusivo por accidente.
         *
         * LLEGA COMO TEXTO, no como booleano: el formulario del panel va en `multipart/form-data` y
         * ahí todo es string. `z.coerce.boolean()` NO vale —`Boolean("false")` es `true`, así que un
         * "false" explícito activaría el candado—, por eso se compara contra la lista de formas que
         * de verdad significan sí (la de una casilla HTML incluida: `on`).
         */
        soloVip: booleanDeFormulario(),
        /**
         * ¿RETO PATROCINADO POR UNA MARCA? Mismo tratamiento que `soloVip`: ausente = `false`.
         */
        esPatrocinado: booleanDeFormulario(),
        sponsorNombre: z
          .string()
          .trim()
          .max(
            SPONSOR_NOMBRE_MAX,
            `El nombre de la marca no puede pasar de ${SPONSOR_NOMBRE_MAX} caracteres.`,
          )
          .optional()
          .transform((s) => (s ? s : null)),
        /**
         * LA COMISIÓN DE ESA MARCA, en puntos básicos y GUARDADA EN EL RETO.
         *
         * Entre 0 y 10000: un 0 es legítimo (un reto de favor, o uno en el que la marca solo pone el
         * premio) y 10000 es el tope duro — por encima del 100% se estaría facturando más que el
         * premio entero, que no es una tarifa sino un error de tecleo.
         *
         * El DEFAULT es el del producto, y es solo lo que propone un reto nuevo: lo que cuenta es el
         * valor que acaba en la fila (ver el comentario de la columna).
         */
        comisionBps: z.coerce
          .number({ message: "La comisión debe ser un número." })
          .int("La comisión debe ser un número entero de puntos básicos.")
          .min(0, "La comisión no puede ser negativa.")
          .max(BPS, "La comisión no puede pasar del 100%.")
          .default(COMISION_SPONSOR_BPS_DEFECTO),
      })
      /**
       * UN RETO PATROCINADO SIN MARCA NO ES UN RETO PATROCINADO. Sin esto, marcar la casilla y no
       * escribir el nombre dejaría una tarjeta con "Patrocinado por" y un hueco, y una línea en la
       * contabilidad que no se sabe a quién facturar.
       */
      .refine((d) => !d.esPatrocinado || (d.sponsorNombre?.length ?? 0) > 0, {
        message: "Un reto patrocinado necesita el nombre de la marca.",
        path: ["sponsorNombre"],
      })
      .refine((d) => d.startsAt < d.deadline, {
        message: "El cierre debe ser posterior a la apertura.",
        path: ["deadline"],
      })
      .refine((d) => d.deadline > now, {
        message: "El cierre debe estar en el futuro.",
        path: ["deadline"],
      })
  );
}

export type CrearRetoInput = z.output<ReturnType<typeof crearRetoSchema>>;

export interface RetoCreado {
  id: string;
  publicCode: string;
  slug: string;
  status: string;
}

/**
 * Crea el reto como DRAFT. `publicCode` único con reintento (generador ya testeado); `slug` cosmético
 * del título (si el título no deja slug —p.ej. solo emojis— cae al publicCode). `createdById` = el admin
 * de la sesión (nunca del cuerpo). Moneda = DEFAULT_CURRENCY (Sergio no ha fijado la real; no editable).
 */
export async function crearRetoAdmin(
  db: Db,
  adminId: string,
  datos: CrearRetoInput,
): Promise<RetoCreado> {
  return crearRetoConPublicCode((publicCode) =>
    db.challenge.create({
      data: {
        title: datos.title,
        slug: slugDesdeTitulo(datos.title) || publicCode,
        publicCode,
        description: datos.description,
        rules: datos.rules,
        category: datos.category,
        status: "DRAFT",
        prizeAmountCents: datos.prizeAmountCents,
        prizeCurrency: DEFAULT_CURRENCY,
        startsAt: datos.startsAt,
        deadline: datos.deadline,
        winnersCount: datos.winnersCount,
        nivelMinimo: datos.nivelMinimo,
        soloVip: datos.soloVip,
        // LOS CAMPOS DE LA MARCA SOLO SI ES PATROCINADO. Desmarcar la casilla y dejar el nombre
        // escrito en el formulario no puede guardar media marca: lo que no es patrocinado no tiene
        // sponsor, y así la fila nunca contradice al flag. El LOGO lo escribe la ruta después (es
        // un fichero, como la portada).
        esPatrocinado: datos.esPatrocinado,
        sponsorNombre: datos.esPatrocinado ? datos.sponsorNombre : null,
        comisionBps: datos.comisionBps,
        createdById: adminId,
      },
      select: { id: true, publicCode: true, slug: true, status: true },
    }),
  );
}

export interface RetoEditado {
  id: string;
  publicCode: string;
  slug: string;
  status: string;
}

/**
 * EDITA un reto ya creado (DRAFT o PUBLISHED). Reglas duras:
 *  - `publicCode` NUNCA cambia (clave estable): NO va en `data`; se recibe para recomputar el slug.
 *  - `status` NUNCA cambia aquí (editar ≠ publicar/despublicar): NO va en `data`.
 *  - `coverImage` NO se toca aquí (la portada la gestiona el endpoint, igual que en crear).
 *  - Si cambia el título, el slug se regenera; las URLs viejas hacen 308 al canónico -> sin enlaces rotos.
 * Devuelve `null` si el reto no existe (el endpoint traduce a 404). El caller pasa el `publicCode` que ya
 * cargó (para el 404 y para nombrar la portada), evitando una segunda consulta.
 */
export async function editarRetoAdmin(
  db: Db,
  id: string,
  publicCode: string,
  datos: CrearRetoInput,
): Promise<RetoEditado | null> {
  const res = await db.challenge.updateMany({
    where: { id },
    data: {
      title: datos.title,
      slug: slugDesdeTitulo(datos.title) || publicCode, // mismo fallback que crear
      description: datos.description,
      rules: datos.rules,
      category: datos.category,
      prizeAmountCents: datos.prizeAmountCents,
      startsAt: datos.startsAt,
      deadline: datos.deadline,
      winnersCount: datos.winnersCount,
      nivelMinimo: datos.nivelMinimo,
      soloVip: datos.soloVip,
      esPatrocinado: datos.esPatrocinado,
      sponsorNombre: datos.esPatrocinado ? datos.sponsorNombre : null,
      comisionBps: datos.comisionBps,
      // QUITAR EL PATROCINIO LIMPIA LA MARCA pero NO borra el logo del disco: el fichero se queda
      // huérfano en el volumen, como pasa con una portada reemplazada. Es la misma decisión de
      // siempre —no destruir ficheros desde una edición— y `sponsorLogo` se pone a null abajo.
      ...(datos.esPatrocinado ? {} : { sponsorLogo: null }),
      // publicCode, status y coverImage AUSENTES a propósito (invariantes de la edición).
    },
  });
  if (res.count === 0) return null; // no existe
  const fila = await db.challenge.findUnique({
    where: { id },
    select: { id: true, publicCode: true, slug: true, status: true },
  });
  return fila;
}

export type ResultadoPublicar =
  /** Cambió de DRAFT a PUBLISHED. */
  | { estado: "publicado" }
  /** Ya estaba publicado, o no existe. No es un error: el doble clic acaba aquí. */
  | { estado: "sin_cambios" }
  /** El cierre ya pasó: publicarlo sería crear un reto muerto. Ver abajo. */
  | { estado: "rechazado"; motivo: "CIERRE_PASADO" };

/**
 * Publica un reto: DRAFT -> PUBLISHED. IDEMPOTENTE y seguro: `updateMany` con `status: "DRAFT"` en el
 * WHERE -> si ya estaba PUBLISHED (o no existe) afecta a 0 filas, sin error.
 *
 * ┌─ NO SE PUBLICA UN RETO CUYO CIERRE YA PASÓ, Y ESTE ES EL CANDADO QUE FALTABA ──────────────┐
 * │ Crear VALIDA que el cierre esté en el futuro, pero esa comprobación es de un INSTANTE y     │
 * │ caduca: el reto se queda en borrador, pasa el rato —o el admin calculó mal la hora— y al    │
 * │ publicarlo nadie volvía a mirar el reloj. El reto nacía vencido y el barrido de cierre lo   │
 * │ cerraba en el siguiente tick, escribiéndole `closedAt`, `status = CLOSED` y `motivoCierre`.  │
 * │                                                                                               │
 * │ Y eso no tenía vuelta atrás: editar las fechas NO reabre (ver `editarRetoAdmin`), así que el │
 * │ reto quedaba muerto y había que borrarlo y rehacerlo. Un fallo de un minuto que costaba      │
 * │ rellenar el formulario entero otra vez.                                                       │
 * │                                                                                               │
 * │ SE COMPRUEBA AQUÍ Y NO EN LA RUTA porque esto es la regla, no la presentación: cualquier     │
 * │ camino que publique —hoy uno, mañana el que sea— tiene que pasar por el mismo sitio.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NO COMPRUEBA LA APERTURA a propósito: publicar un reto cuya apertura ya pasó es legítimo —abre al
 * instante— y es el caso normal de "publícalo ya". Lo que no puede estar en el pasado es el CIERRE.
 */
export async function publicarReto(
  db: Db,
  id: string,
  ahora: Date = new Date(),
): Promise<ResultadoPublicar> {
  // Se lee ANTES de escribir: hay que saber el deadline para decidir. No abre una carrera que
  // importe —el peor caso es publicar un reto que vence en el mismo milisegundo, y de ese ya se
  // encarga el barrido— y evita un `updateMany` con la condición de fecha dentro, que no podría
  // distinguir "ya estaba publicado" de "lo rechacé por la fecha".
  const reto = await db.challenge.findUnique({
    where: { id },
    select: { status: true, deadline: true },
  });
  if (!reto) return { estado: "sin_cambios" };
  if (reto.status === "DRAFT" && reto.deadline <= ahora) {
    return { estado: "rechazado", motivo: "CIERRE_PASADO" };
  }

  const res = await db.challenge.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "PUBLISHED" },
  });
  return res.count > 0 ? { estado: "publicado" } : { estado: "sin_cambios" };
}

/**
 * Fila de la lista de retos del panel (todos los estados). Incluye los campos EDITABLES (descripción,
 * reglas, apertura, ganadores, portada) para poder PRECARGAR el formulario de edición en el
 * cliente sin una segunda petición. La tabla del panel muestra solo un subconjunto; la edición usa todo.
 */
export interface RetoAdminFila {
  id: string;
  title: string;
  description: string | null;
  rules: string | null;
  category: string;
  status: string;
  prizeAmountCents: number;
  prizeCurrency: string;
  startsAt: Date;
  deadline: Date;
  winnersCount: number;
  /** Clave del nivel minimo para participar (`rookie` = todos). Ver `lib/nivel-reto`. */
  nivelMinimo: string;
  /** Reto EXCLUSIVO de VIP Mythic: se ve igual, pero solo participa quien tenga la suscripcion. */
  soloVip: boolean;
  /** Reto PATROCINADO por una marca (Fase 9). Los tres campos de abajo solo significan algo si es cierto. */
  esPatrocinado: boolean;
  sponsorNombre: string | null;
  sponsorLogo: string | null;
  /** Comision pactada con esa marca, en puntos basicos. Se guarda por reto (ver la columna). */
  comisionBps: number;
  coverImage: string | null;
  publicCode: string;
  /** Gracia de borrado en curso (ms) o null. El panel pinta la cuenta atras y ofrece restaurar. */
  eliminaEnMs: number | null;
  /** Ya borrado. Sigue en el panel como registro; fuera de todas las vistas publicas. */
  borradoMs: number | null;
  /** Motivo del cierre (Fase 4). El panel lo necesita para distinguir un cierre normal de uno que
   *  ESPERA decision del admin; sin el, un reto empatado se pinta "Cerrado" y se queda atascado. */
  motivoCierre: string | null;
}

/** Campos que se piden en las dos consultas del panel (lista y ficha de uno). Fuente única. */
const SELECT_RETO_ADMIN = {
  id: true,
  title: true,
  description: true,
  rules: true,
  category: true,
  status: true,
  prizeAmountCents: true,
  prizeCurrency: true,
  startsAt: true,
  deadline: true,
  winnersCount: true,
  nivelMinimo: true,
  soloVip: true,
  esPatrocinado: true,
  sponsorNombre: true,
  sponsorLogo: true,
  comisionBps: true,
  coverImage: true,
  publicCode: true,
  eliminacionProgramadaEn: true,
  deletedAt: true,
  motivoCierre: true,
} as const;

/** Fila del panel: los ms van planos para cruzar al cliente sin serializar Date. */
type FilaCruda = { [K in keyof typeof SELECT_RETO_ADMIN]: unknown } & {
  prizeAmountCents: number | bigint;
  eliminacionProgramadaEn: Date | null;
  deletedAt: Date | null;
  /** Solo lo trae la LISTA, y solo para construir el cursor: ver `listarRetosAdmin`. */
  createdAt?: Date;
};

function aFila(f: FilaCruda): RetoAdminFila {
  const { eliminacionProgramadaEn, deletedAt, prizeAmountCents, ...resto } = f;
  // `createdAt` SE QUEDA FUERA aunque la lista lo pida: es la mitad del cursor, no un campo del
  // DTO. Sin quitarlo, el `...resto` de abajo lo llevaría al cliente como un `Date`.
  delete (resto as { createdAt?: Date }).createdAt;
  return {
    ...(resto as unknown as Omit<RetoAdminFila, "prizeAmountCents" | "eliminaEnMs" | "borradoMs">),
    prizeAmountCents: Number(prizeAmountCents),
    eliminaEnMs: eliminacionProgramadaEn ? eliminacionProgramadaEn.getTime() : null,
    borradoMs: deletedAt ? deletedAt.getTime() : null,
  };
}

/**
 * UN reto por su id, para la pantalla de gestión del panel. Devuelve `null` si no existe (la página
 * responde 404). A diferencia de la vista pública, aquí SÍ se sirven los DRAFT: el panel es justo
 * donde el admin gestiona un borrador antes de publicarlo.
 */
export async function retoAdminPorId(db: Db, id: string): Promise<RetoAdminFila | null> {
  const f = await db.challenge.findUnique({ where: { id }, select: SELECT_RETO_ADMIN });
  return f ? aFila(f) : null;
}

/** Tope de la página del panel. El mismo que el resto de colas del admin. */
export const RETOS_ADMIN_LIMITE = 25;

export interface PaginaRetosAdmin {
  filas: RetoAdminFila[];
  /** Cursor de la página siguiente, o `null` si no hay más. Keyset, nunca OFFSET. */
  proximoCursor: string | null;
}

/**
 * Lista los retos para el panel (más nuevos primero), con su estado y los campos para editar.
 *
 * ┌─ PAGINADA, Y ESTO NO ES COSMÉTICO ──────────────────────────────────────────────────────────┐
 * │ Antes traía LA TABLA ENTERA sin `take`: todos los retos que se hayan creado nunca, borrados  │
 * │ incluidos (que siguen aquí a propósito, como registro). Con una docena no se nota; con mil,  │
 * │ el panel se trae mil filas con su descripción y sus reglas en cada carga. Una lista que      │
 * │ crece con el uso y no está acotada no falla: se degrada, y el día que duele ya es tarde.     │
 * │                                                                                               │
 * │ KEYSET por `(createdAt, id)`, nunca OFFSET —la regla del repositorio— y con el desempate por │
 * │ id, que antes tampoco estaba: dos retos creados en el mismo milisegundo (una siembra, un     │
 * │ script) bailaban de sitio entre dos cargas de la misma página.                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export async function listarRetosAdmin(
  db: Db,
  opts: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaRetosAdmin> {
  const limite = Math.min(
    Math.max(1, Math.floor(opts.limite ?? RETOS_ADMIN_LIMITE)),
    RETOS_ADMIN_LIMITE,
  );
  const desde = decodificarCursorTiempo(opts.cursor);

  const filas = await db.challenge.findMany({
    where: conKeysetTiempo({}, desde),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // Una de más: así se sabe si hay siguiente sin un `count` aparte.
    take: limite + 1,
    select: { ...SELECT_RETO_ADMIN, createdAt: true },
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

/**
 * BORRAR un reto (ADMIN), en dos modos y sin destruir nada de nadie.
 *
 *  - PROGRAMADO (por defecto): marca `eliminacionProgramadaEn = ahora + gracia`. El reto sale del
 *    público YA, pero sigue en el panel con su cuenta atrás y se puede RESTAURAR. Es la red contra
 *    el borrado por error y contra destruir algo que había que conservar.
 *  - FORZADO: el admin sabe lo que hace y lo quiere fuera ahora. Marca `deletedAt`.
 *
 * En los DOS casos es un borrado LÓGICO. El físico ni se plantea: la FK de Submission es
 * `onDelete: Restrict`, así que un reto con participaciones no se podría borrar sin destruir antes
 * los vídeos de sus usuarios — que es exactamente el daño que la gracia pretende evitar. Los vídeos
 * siguen siendo de sus autores y siguen en su perfil; lo que desaparece es el RETO.
 *
 * Idempotente: borrar dos veces no falla.
 */
export async function borrarReto(
  db: Db,
  id: string,
  opts: { forzar?: boolean; ahora?: Date } = {},
): Promise<{ borrado: boolean; eliminaEn: Date | null }> {
  const ahora = opts.ahora ?? new Date();
  const reto = await db.challenge.findUnique({ where: { id }, select: { deletedAt: true } });
  if (!reto || reto.deletedAt) return { borrado: false, eliminaEn: null };

  if (opts.forzar) {
    await db.challenge.update({
      where: { id },
      data: { deletedAt: ahora, eliminacionProgramadaEn: null },
    });
    return { borrado: true, eliminaEn: null };
  }
  const eliminaEn = new Date(ahora.getTime() + RETO_GRACIA_BORRADO_MS);
  await db.challenge.update({ where: { id }, data: { eliminacionProgramadaEn: eliminaEn } });
  return { borrado: true, eliminaEn };
}

/**
 * RESTAURAR un reto que estaba en su gracia de borrado. Solo mientras la gracia corre: una vez
 * consumada (`deletedAt`), el admin ya tuvo sus 7 días y deshacerlo sería otra decisión.
 */
export async function restaurarReto(db: Db, id: string): Promise<{ restaurado: boolean }> {
  const r = await db.challenge.updateMany({
    where: { id, deletedAt: null, eliminacionProgramadaEn: { not: null } },
    data: { eliminacionProgramadaEn: null },
  });
  return { restaurado: r.count === 1 };
}

/**
 * BARRIDO: consuma los borrados cuya gracia ya venció. Lo llama el worker. Es la única pieza que
 * convierte un borrado programado en definitivo, y lo hace por LOTES: un reto que sigue en gracia no
 * se toca, y uno ya borrado tampoco (idempotente).
 */
export async function consumarBorradosVencidos(
  db: Db,
  ahora: Date = new Date(),
): Promise<{ borrados: number }> {
  const r = await db.challenge.updateMany({
    where: { deletedAt: null, eliminacionProgramadaEn: { lte: ahora } },
    data: { deletedAt: ahora, eliminacionProgramadaEn: null },
  });
  return { borrados: r.count };
}
