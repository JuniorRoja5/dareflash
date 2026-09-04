/**
 * RETOS · creación y publicación por el ADMIN (Fase 2 · M5). SOLO el admin crea retos (decisión de
 * producto, cerrada); los usuarios NUNCA. Aquí viven: el schema de dominio (Zod), la creación (siempre
 * DRAFT, con publicCode único reusando el generador ya testeado) y la publicación (DRAFT -> PUBLISHED,
 * idempotente). El guard de rol lo pone cada ENDPOINT (requireRole); este módulo no confía en la vista.
 */
import "server-only";

import { RETO_GRACIA_BORRADO_MS } from "@/config/constants";

import { z } from "zod";

import { CATEGORIES, type CategoryKey, DEFAULT_CURRENCY } from "@/config/constants";
import type { Db } from "@/server/db/types";
import { slugDesdeTitulo } from "@/lib/reto-slug";

import { crearRetoConPublicCode } from "./reto-codigo";

/** Claves de las 14 categorías, como tupla para `z.enum`. Fuente única: CATEGORIES. */
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];

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
  return z
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
    })
    .refine((d) => d.startsAt < d.deadline, {
      message: "El cierre debe ser posterior a la apertura.",
      path: ["deadline"],
    })
    .refine((d) => d.deadline > now, {
      message: "El cierre debe estar en el futuro.",
      path: ["deadline"],
    });
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

/**
 * Publica un reto: DRAFT -> PUBLISHED. IDEMPOTENTE y seguro: `updateMany` con `status: "DRAFT"` en el
 * WHERE -> si ya estaba PUBLISHED (o no existe) afecta a 0 filas, sin error. Devuelve si cambió algo.
 */
export async function publicarReto(db: Db, id: string): Promise<{ publicado: boolean }> {
  const res = await db.challenge.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "PUBLISHED" },
  });
  return { publicado: res.count > 0 };
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
  coverImage: string | null;
  publicCode: string;
  /** Gracia de borrado en curso (ms) o null. El panel pinta la cuenta atras y ofrece restaurar. */
  eliminaEnMs: number | null;
  /** Ya borrado. Sigue en el panel como registro; fuera de todas las vistas publicas. */
  borradoMs: number | null;
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
  coverImage: true,
  publicCode: true,
  eliminacionProgramadaEn: true,
  deletedAt: true,
} as const;

/** Fila del panel: los ms van planos para cruzar al cliente sin serializar Date. */
type FilaCruda = { [K in keyof typeof SELECT_RETO_ADMIN]: unknown } & {
  prizeAmountCents: number | bigint;
  eliminacionProgramadaEn: Date | null;
  deletedAt: Date | null;
};

function aFila(f: FilaCruda): RetoAdminFila {
  const { eliminacionProgramadaEn, deletedAt, prizeAmountCents, ...resto } = f;
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

/** Lista los retos para el panel (más nuevos primero), con su estado y los campos para editar. */
export async function listarRetosAdmin(db: Db): Promise<RetoAdminFila[]> {
  const filas = await db.challenge.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: SELECT_RETO_ADMIN,
  });
  return filas.map(aFila);
}

/**
 * ESTADO REAL de un reto en el panel. Se CALCULA, no se lee de la columna: `status` dice qué quiso el
 * admin, no en qué punto está el reto AHORA. Un reto PUBLISHED cuyo plazo venció seguía pintándose
 * "Publicado" en la lista, que es lo que el admin veía y no cuadraba con la realidad.
 *
 * "Programado" existe porque un reto puede estar publicado y aún sin abrir (`startsAt` futuro): antes
 * era indistinguible de uno abierto, y son cosas distintas para quien administra.
 */
export type EstadoRetoAdmin =
  "borrador" | "programado" | "abierto" | "cerrado" | "en-borrado" | "borrado";

export function estadoRetoAdmin(
  reto: {
    status: string;
    startsAt: Date;
    deadline: Date;
    eliminacionProgramadaEn: Date | null;
    deletedAt: Date | null;
  },
  ahora: Date = new Date(),
): EstadoRetoAdmin {
  // El borrado manda sobre todo lo demás: un reto en camino de desaparecer no es "abierto".
  if (reto.deletedAt) return "borrado";
  if (reto.eliminacionProgramadaEn) return "en-borrado";
  if (reto.status === "DRAFT") return "borrador";
  if (reto.status === "CLOSED" || reto.deadline <= ahora) return "cerrado";
  if (reto.startsAt > ahora) return "programado";
  return "abierto";
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
