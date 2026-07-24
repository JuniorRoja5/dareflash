/**
 * Rate limiting por VENTANA FIJA en MySQL/MariaDB (sin Redis).
 *
 * El incremento es ATOMICO: `INSERT ... ON DUPLICATE KEY UPDATE count = count + 1`
 * via consulta cruda. NO se usa el `upsert` de Prisma (read-then-write, con ventana
 * de carrera). Dos peticiones simultaneas incrementan sin perder cuentas.
 *
 * La ventana se calcula truncando el instante actual al tamano de ventana, asi la
 * clave (key, windowStart) es estable dentro de la ventana. Un job periodico
 * (RETENTION_PURGE) limpia ventanas antiguas.
 *
 * Recibe el PrismaClient por parametro (testeable), como el resto de servicios.
 */
import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

export interface RateLimitInput {
  /** Identificador del cubo, p.ej. "login:ip:<hash>" o "register:ip:<hash>". */
  key: string;
  /** Numero maximo de operaciones permitidas dentro de la ventana. */
  limit: number;
  /** Tamano de la ventana en milisegundos. */
  windowMs: number;
  /** "ahora" (inyectable para tests). Por defecto, el reloj del servidor (UTC). */
  now?: Date;
}

export interface RateLimitResult {
  /** true si esta operacion esta permitida (count <= limit). */
  allowed: boolean;
  /** Operaciones restantes en la ventana (nunca negativo). */
  remaining: number;
  /** Recuento tras contar esta operacion. */
  count: number;
  /** Inicio de la ventana actual (UTC). */
  windowStart: Date;
}

/**
 * Cuenta esta operacion contra el limite y dice si se permite. SIEMPRE cuenta
 * (incluso cuando bloquea), de modo que una rafaga no "resetea" el contador.
 */
export async function rateLimit(
  db: PrismaClient,
  { key, limit, windowMs, now }: RateLimitInput,
): Promise<RateLimitResult> {
  const nowMs = (now ?? new Date()).getTime();
  const windowStart = new Date(Math.floor(nowMs / windowMs) * windowMs);

  // Incremento atomico. `id` se genera aqui (la columna es PK sin default de BD);
  // en el camino de UPDATE se ignora.
  await db.$executeRaw(Prisma.sql`
    INSERT INTO \`RateLimit\` (\`id\`, \`key\`, \`windowStart\`, \`count\`)
    VALUES (${randomUUID()}, ${key}, ${windowStart}, 1)
    ON DUPLICATE KEY UPDATE \`count\` = \`count\` + 1
  `);

  const rows = await db.$queryRaw<Array<{ count: number | bigint }>>(Prisma.sql`
    SELECT \`count\` FROM \`RateLimit\` WHERE \`key\` = ${key} AND \`windowStart\` = ${windowStart}
  `);
  const count = Number(rows[0]?.count ?? 0);

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    count,
    windowStart,
  };
}
