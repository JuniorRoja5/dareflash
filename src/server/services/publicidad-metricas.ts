/**
 * LAS CIFRAS DE UNA CAMPAÑA (Fase 9 · P10): vistas y clics por día.
 *
 *  - UNA VISTA es una vez que la ENTREGAMOS en un hueco de una página (feed o portada): se cuenta en
 *    `elegirPieza`, al elegirla. No es «la vio en pantalla» —para eso haría falta un aviso del navegador
 *    por cada pieza, también de los invitados, que no tienen sesión a la que atar el CSRF—; es lo mismo
 *    que mide el reparto. Una página que se carga y no se baja hasta el hueco cuenta igual.
 *  - UN CLIC es un paso por el redirector `/ir/{id}`, el único enlace que lleva a su web
 *    (`enlaceDeCampana`). Con tope por IP cifrada: por encima, se redirige igual pero no cuenta.
 *
 * SE CUENTAN EN REDIS Y SE MATERIALIZAN AQUÍ, como el aforo: un hash por día (`pub:met:{dia}`, campos
 * `v:{id}` y `c:{id}`), y el worker lo vuelca a `PublicidadMetricaDia` con el RECUENTO ABSOLUTO del día
 * —nunca `increment`: reejecutar escribe lo mismo—. Con una salvedad: `GREATEST`. Si Redis se reinicia a
 * media tarde, el hash vuelve a cero, y escribir ese cero borraría lo que ya se había contado; así que
 * una cifra materializada no baja. Sigue convergiendo: dos pasadas con los mismos datos escriben lo mismo.
 *
 * Contar NUNCA rompe nada: sin Redis, o con Redis caído, la vista o el clic se pierden y la pieza se
 * sirve igual (o el clic llega igual a su web). Y no toca el dinero: el cobro es por día (P9).
 */
import "server-only";

import {
  PUBLICIDAD_METRICAS_PAGINA,
  PUBLICIDAD_METRICAS_TTL_S,
  RATE_LIMITS,
} from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { claveDia, destinoValido, diaDe, sumarDias } from "@/lib/publicidad";
import type { Db } from "@/server/db/types";
import { rateLimit } from "@/server/security/rate-limit";

import { PUBLICIDAD_SERVIBLE } from "./publicidad-visible";

/** Lo mínimo de Redis para CONTAR (inyectable en los tests). */
export interface RedisContarMetricas {
  hincrby(clave: string, campo: string, n: number): Promise<number>;
  expire(clave: string, segundos: number): Promise<unknown>;
}

/** Lo mínimo de Redis para MATERIALIZAR. */
export interface RedisLeerMetricas {
  hgetall(clave: string): Promise<Record<string, string>>;
}

export type TipoMetrica = "v" | "c";

export const claveMetricas = (dia: Date) => `pub:met:${claveDia(dia)}`;

/** Suma una vista (`v`) o un clic (`c`) de HOY a una campaña. Nunca lanza. */
export async function contarMetrica(
  redis: RedisContarMetricas | null,
  tipo: TipoMetrica,
  publicidadId: string,
  ahora: Date = new Date(),
): Promise<void> {
  if (!redis) return;
  try {
    const clave = claveMetricas(diaDe(ahora));
    const n = await redis.hincrby(clave, `${tipo}:${publicidadId}`, 1);
    // La primera cuenta de cada campaña le pone (o le renueva) la caducidad al hash del día.
    if (n === 1) await redis.expire(clave, PUBLICIDAD_METRICAS_TTL_S);
  } catch {
    // Se pierde esta cuenta. Son cifras de un informe: nunca se tumba una página por ellas.
  }
}

/**
 * Vuelca las cifras de HOY y de AYER de Redis a `PublicidadMetricaDia`. Ayer también, porque lo último
 * de ayer solo se ve en la primera pasada de hoy. Solo campañas que existen (un campo con un id que no
 * está se ignora: la clave ajena lo rechazaría). Sin Redis, no hace nada (y lo dice).
 */
export async function materializarMetricasPublicidad(
  db: Db,
  redis: RedisLeerMetricas | null,
  ahora: Date = new Date(),
): Promise<{ filas: number; sinRedis: boolean }> {
  if (!redis) return { filas: 0, sinRedis: true };
  let filas = 0;
  const hoy = diaDe(ahora);
  for (const dia of [hoy, sumarDias(hoy, -1)]) {
    const hash = await redis.hgetall(claveMetricas(dia));
    const cifras = new Map<string, { vistas: number; clics: number }>();
    for (const [campo, valor] of Object.entries(hash ?? {})) {
      const [tipo, id] = [campo.slice(0, 1), campo.slice(2)];
      const n = Number.parseInt(valor, 10);
      if (!id || campo[1] !== ":" || !Number.isFinite(n) || n < 0) continue;
      const c = cifras.get(id) ?? { vistas: 0, clics: 0 };
      if (tipo === "v") c.vistas = n;
      else if (tipo === "c") c.clics = n;
      else continue;
      cifras.set(id, c);
    }
    if (cifras.size === 0) continue;
    const existen = await db.publicidad.findMany({
      where: { id: { in: [...cifras.keys()] } },
      select: { id: true },
    });
    for (const { id } of existen) {
      const c = cifras.get(id)!;
      // Recuento ABSOLUTO del día; `GREATEST` para que un Redis reiniciado no borre lo ya contado.
      await db.$executeRaw`
        INSERT INTO \`PublicidadMetricaDia\` (\`publicidadId\`, \`dia\`, \`vistas\`, \`clics\`, \`updatedAt\`)
        VALUES (${id}, ${dia}, ${c.vistas}, ${c.clics}, NOW(3))
        ON DUPLICATE KEY UPDATE
          \`vistas\` = GREATEST(\`vistas\`, VALUES(\`vistas\`)),
          \`clics\` = GREATEST(\`clics\`, VALUES(\`clics\`)),
          \`updatedAt\` = NOW(3)`;
      filas += 1;
    }
  }
  return { filas, sinRedis: false };
}

// ---------------------------------------------------------------------------------------------------
// Los huecos (P12): cuántos hubo y cuántos llenó una campaña
// ---------------------------------------------------------------------------------------------------

/**
 * LOS HUECOS DE UN DÍA, por espacio (Fase 9 · P12): cuántos se decidieron (`t`) y en cuántos salió una
 * CAMPAÑA (`c`). El resto los cubrió la casa o quedaron vacíos (en el feed la casa sale una vez por
 * sesión). Es lo que mide «¿se está vendiendo?»: el aviso de la casa por encima del 80 % y la línea del
 * resumen diario. Un hash por día UTC (`pub:huecos:{dia}`), como las vistas; no necesita tabla: solo se
 * lee el de ayer, y vive tres días.
 */
export const claveHuecos = (dia: Date) => `pub:huecos:${claveDia(dia)}`;

/** Cuenta un hueco decidido de `espacio`, con campaña o sin ella. Nunca lanza. */
export async function contarHueco(
  redis: RedisContarMetricas | null,
  espacio: string,
  conCampana: boolean,
  ahora: Date = new Date(),
): Promise<void> {
  if (!redis) return;
  try {
    const clave = claveHuecos(diaDe(ahora));
    const n = await redis.hincrby(clave, `${espacio}:t`, 1);
    if (n === 1) await redis.expire(clave, PUBLICIDAD_METRICAS_TTL_S);
    if (conCampana) await redis.hincrby(clave, `${espacio}:c`, 1);
  } catch {
    // Se pierde esta cuenta: es una cifra de un resumen.
  }
}

export interface HuecosDeEspacio {
  total: number;
  conCampana: number;
}

/** Los huecos de un día, por espacio. Sin Redis (o caído), `null`: no se sabe, que no es «cero». */
export async function huecosDelDia(
  redis: RedisLeerMetricas | null,
  dia: Date,
): Promise<Record<string, HuecosDeEspacio> | null> {
  if (!redis) return null;
  try {
    const hash = await redis.hgetall(claveHuecos(dia));
    const r: Record<string, HuecosDeEspacio> = {};
    for (const [campo, valor] of Object.entries(hash ?? {})) {
      const [espacio, tipo] = campo.split(":");
      const n = Number.parseInt(valor, 10);
      if (!espacio || !Number.isFinite(n)) continue;
      const e = (r[espacio] ??= { total: 0, conCampana: 0 });
      if (tipo === "t") e.total = n;
      else if (tipo === "c") e.conCampana = n;
    }
    return r;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// El clic
// ---------------------------------------------------------------------------------------------------

/**
 * UN CLIC EN UNA CAMPAÑA (`/ir/{id}`): devuelve a dónde llevar a quien hizo clic, o `null` si esa
 * campaña ya no se sirve (retirada, en revisión, pausada, de una empresa suspendida…) —un enlace viejo
 * en una pestaña abierta no puede seguir llevando a una web que retiramos por peligrosa—. El destino se
 * vuelve a validar (`destinoValido`): nunca se redirige a algo que no sea http(s) público.
 *
 * El clic CUENTA si la IP cifrada no pasa de `CLIC_PUBLICIDAD_PER_IP`; por encima, se redirige igual (no
 * se castiga a nadie por hacer clic) pero no se suma. Sin IP (no debería pasar detrás de Caddy) tampoco
 * se suma: no habría con qué acotarlo. Nunca lanza por las cifras: un fallo al contar no impide llegar.
 */
export async function clicEnCampana(
  db: PrismaClient,
  entrada: {
    publicidadId: string;
    /** La IP cifrada (HMAC), o `null` si la petición no la trae. */
    ipKey: string | null;
    redis: RedisContarMetricas | null;
    ahora?: Date;
  },
): Promise<string | null> {
  const c = await db.publicidad.findFirst({
    where: { id: entrada.publicidadId, ...PUBLICIDAD_SERVIBLE },
    select: { id: true, destinoUrl: true },
  });
  if (!c || !destinoValido(c.destinoUrl)) return null;
  if (entrada.ipKey) {
    try {
      const r = await rateLimit(db, {
        key: `clic-publicidad:ip:${entrada.ipKey}`,
        ...RATE_LIMITS.CLIC_PUBLICIDAD_PER_IP,
        now: entrada.ahora,
      });
      if (r.allowed) await contarMetrica(entrada.redis, "c", c.id, entrada.ahora);
    } catch {
      // Sin contar esta vez: quien hizo clic llega igual a su web.
    }
  }
  return c.destinoUrl;
}

// ---------------------------------------------------------------------------------------------------
// El informe del portal
// ---------------------------------------------------------------------------------------------------

export interface DiaDeMetricas {
  /** AAAA-MM-DD (el día de campaña, UTC). */
  dia: string;
  vistas: number;
  clics: number;
}

export interface InformeDeCampana {
  totales: { vistas: number; clics: number };
  dias: DiaDeMetricas[];
  /** El cursor de la página siguiente (el último día de esta), o `null` si no hay más. */
  nextCursor: string | null;
}

const CURSOR_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * EL INFORME DE SU CAMPAÑA: los totales y los días, del más reciente al más antiguo, por KEYSET sobre
 * `dia` (el cursor es el último día de la página anterior). El ÁMBITO va dentro: una campaña de otra
 * empresa da `null`, como una que no existe.
 */
export async function informeDeMiCampana(
  db: Db,
  empresaId: string,
  publicidadId: string,
  cursor: string | null = null,
): Promise<InformeDeCampana | null> {
  const suya = await db.publicidad.findFirst({
    where: { id: publicidadId, empresaId },
    select: { id: true },
  });
  if (!suya) return null;
  const antesDe = cursor && CURSOR_DIA.test(cursor) ? new Date(`${cursor}T00:00:00.000Z`) : null;
  const [suma, filas] = await Promise.all([
    db.publicidadMetricaDia.aggregate({
      where: { publicidadId },
      _sum: { vistas: true, clics: true },
    }),
    db.publicidadMetricaDia.findMany({
      where: { publicidadId, ...(antesDe ? { dia: { lt: antesDe } } : {}) },
      orderBy: { dia: "desc" },
      take: PUBLICIDAD_METRICAS_PAGINA + 1,
      select: { dia: true, vistas: true, clics: true },
    }),
  ]);
  const hayMas = filas.length > PUBLICIDAD_METRICAS_PAGINA;
  const pagina = hayMas ? filas.slice(0, PUBLICIDAD_METRICAS_PAGINA) : filas;
  const dias = pagina.map((f) => ({ dia: claveDia(f.dia), vistas: f.vistas, clics: f.clics }));
  return {
    totales: { vistas: suma._sum.vistas ?? 0, clics: suma._sum.clics ?? 0 },
    dias,
    nextCursor: hayMas ? (dias.at(-1)?.dia ?? null) : null,
  };
}
