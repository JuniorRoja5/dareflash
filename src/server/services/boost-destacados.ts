/**
 * LOS PERFILES DESTACADOS, AHORA MISMO — lo que la portada pinta donde antes había una maqueta.
 *
 * ┌─ EL ESTADO SE CALCULA, NO SE DISPARA ─────────────────────────────────────────────────────────┐
 * │ Quién está destacado se resuelve CONSULTANDO `expiresAt > ahora`, no con un job que "activa" y │
 * │ "desactiva" ni con una columna `vigente`. Una ejecución perdida no deja a nadie destacado para │
 * │ siempre ni a nadie fuera: el minuto en que expira, deja de salir en la consulta. Es la misma   │
 * │ regla que cierra los retos (ver la arquitectura).                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ORDEN ES `startsAt` DESCENDENTE: quien acaba de activar entra arriba y empuja al resto hacia
 * abajo. Es lo que hace que pagar AHORA se note ahora, y no dentro de una hora.
 *
 * ┌─ POR QUÉ ESTO ES SQL CRUDO ───────────────────────────────────────────────────────────────────┐
 * │ `BoostActivation` no tiene relación con `User` en el esquema (sólo guarda el `userId`), así    │
 * │ que con el cliente tipado harían falta dos consultas: traer N apariciones y después sus        │
 * │ usuarios. Y hay un filtro que NO se puede aplicar así: una cuenta suspendida o borrada no se   │
 * │ promociona en la portada. Al filtrarlo DESPUÉS, las apariciones de cuentas suspendidas ya      │
 * │ habrían gastado sitio en el `LIMIT` y la fila saldría corta teniendo destacados válidos        │
 * │ esperando. El JOIN lo resuelve en una consulta y con el recuento exacto.                       │
 * │                                                                                               │
 * │ Añadir la relación al esquema sería una FK nueva, o sea una migración, para una lectura.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import "server-only";

import { BOOST_DESTACADOS_PORTADA } from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

export interface PerfilDestacado {
  activacionId: string;
  userId: string;
  username: string;
  displayName: string | null;
  imagen: string | null;
  /** Para derivar el nivel en la vista, como en el resto del producto. */
  puntos: number;
  destacadoDesdeMs: number;
  expiraEnMs: number;
}

/** Lo que devuelve el driver: fechas como `Date` y los enteros posiblemente como `bigint`. */
interface FilaDestacado {
  activacionId: string;
  userId: string;
  username: string;
  displayName: string | null;
  imagen: string | null;
  puntos: number | bigint;
  destacadoDesde: Date;
  expiraEn: Date;
}

/**
 * Los perfiles destacados VIGENTES, del más reciente al más antiguo.
 *
 * `limite` acota la fila de la portada; la sección completa (Pieza 4) pedirá más. Si no hay ninguno
 * vigente devuelve la lista vacía, y eso es información: significa que nadie ha destacado su perfil.
 * Rellenarla con gente para "que no se vea vacía" es justo lo que había antes.
 */
export async function destacadosVigentes(
  db: PrismaClient,
  opciones: { ahora?: Date; limite?: number } = {},
): Promise<PerfilDestacado[]> {
  const ahora = opciones.ahora ?? new Date();
  const limite = Math.min(Math.max(opciones.limite ?? BOOST_DESTACADOS_PORTADA, 1), 100);

  const filas = await db.$queryRaw<FilaDestacado[]>(Prisma.sql`
    SELECT
      a.\`id\`            AS activacionId,
      a.\`userId\`        AS userId,
      u.\`username\`      AS username,
      u.\`displayName\`   AS displayName,
      u.\`image\`         AS imagen,
      u.\`pointsBalance\` AS puntos,
      a.\`startsAt\`      AS destacadoDesde,
      a.\`expiresAt\`     AS expiraEn
    FROM \`BoostActivation\` a
    JOIN \`User\` u ON u.\`id\` = a.\`userId\`
    WHERE a.\`expiresAt\` > ${ahora}
      AND u.\`deletedAt\` IS NULL
      AND u.\`bannedAt\` IS NULL
    ORDER BY a.\`startsAt\` DESC, a.\`id\` DESC
    LIMIT ${limite}
  `);

  return filas.map((f) => ({
    activacionId: f.activacionId,
    userId: f.userId,
    username: f.username,
    displayName: f.displayName,
    imagen: f.imagen,
    puntos: Number(f.puntos),
    destacadoDesdeMs: f.destacadoDesde.getTime(),
    expiraEnMs: f.expiraEn.getTime(),
  }));
}
