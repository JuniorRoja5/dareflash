/**
 * RETOS · creación y publicación por el ADMIN (Fase 2 · M5). SOLO el admin crea retos (decisión de
 * producto, cerrada); los usuarios NUNCA. Aquí viven: el schema de dominio (Zod), la creación (siempre
 * DRAFT, con publicCode único reusando el generador ya testeado) y la publicación (DRAFT -> PUBLISHED,
 * idempotente). El guard de rol lo pone cada ENDPOINT (requireRole); este módulo no confía en la vista.
 */
import "server-only";

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
 * céntimos; apertura < cierre y cierre en el futuro (UTC); ganadores >= 1; votos/usuario >= 0. El
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
      maxVotesPerUser: z.coerce
        .number({ message: "Los votos por usuario deben ser un número." })
        .int("Los votos por usuario deben ser un número entero.")
        .min(0, "Los votos por usuario no pueden ser negativos."),
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
        maxVotesPerUser: datos.maxVotesPerUser,
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
      maxVotesPerUser: datos.maxVotesPerUser,
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
 * reglas, apertura, ganadores, votos, portada) para poder PRECARGAR el formulario de edición en el
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
  maxVotesPerUser: number;
  coverImage: string | null;
  publicCode: string;
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
  maxVotesPerUser: true,
  coverImage: true,
  publicCode: true,
} as const;

/**
 * UN reto por su id, para la pantalla de gestión del panel. Devuelve `null` si no existe (la página
 * responde 404). A diferencia de la vista pública, aquí SÍ se sirven los DRAFT: el panel es justo
 * donde el admin gestiona un borrador antes de publicarlo.
 */
export async function retoAdminPorId(db: Db, id: string): Promise<RetoAdminFila | null> {
  const f = await db.challenge.findUnique({ where: { id }, select: SELECT_RETO_ADMIN });
  return f ? { ...f, prizeAmountCents: Number(f.prizeAmountCents) } : null;
}

/** Lista los retos para el panel (más nuevos primero), con su estado y los campos para editar. */
export async function listarRetosAdmin(db: Db): Promise<RetoAdminFila[]> {
  const filas = await db.challenge.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: SELECT_RETO_ADMIN,
  });
  return filas.map((f) => ({ ...f, prizeAmountCents: Number(f.prizeAmountCents) }));
}
