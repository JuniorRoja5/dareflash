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
  /**
   * Cuándo empezó LA APARICIÓN que le da este sitio en la fila (la más reciente suya). No es cuándo
   * empezó a estar destacado: quien reactiva vuelve a encabezar, y eso es lo que esta fecha ordena.
   */
  destacadoDesdeMs: number;
  /**
   * Cuándo deja de estar destacado DE VERDAD: el final más lejano de todas sus apariciones vigentes,
   * no el de la fila elegida. Con la duración fija de hoy son el mismo instante; si alguna vez
   * convive más de una duración, encadenar dos boosts alarga la presencia y este campo lo dice.
   */
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
 * Los perfiles destacados VIGENTES, UNO POR PERSONA, del más reciente al más antiguo.
 *
 * ┌─ UNA PERSONA, UNA PLAZA ──────────────────────────────────────────────────────────────────────┐
 * │ Activar un Boost estando ya destacado está PERMITIDO (las reglas son el saldo y el límite      │
 * │ diario, no "uno a la vez") y sirve para volver a encabezar la fila. Pero sin deduplicar, esa   │
 * │ segunda aparición vigente salía como una SEGUNDA tarjeta: la misma persona ocupando dos de     │
 * │ cinco plazas, y hasta tres con el límite diario. Eso no es pagar por re-encabezar, es          │
 * │ acaparar la vitrina y desplazar a los demás.                                                  │
 * │                                                                                               │
 * │ Se corta EN LA LECTURA y no bloqueando la activación, y las tres consecuencias importan:       │
 * │   - el modelo no se toca: una fila por boost gastado, así que el límite por recuento de filas  │
 * │     y la idempotencia siguen exactamente igual;                                               │
 * │   - reactivar sigue valiendo para lo que vale (vuelves arriba y alargas tu presencia), pero    │
 * │     ocupando UNA plaza;                                                                        │
 * │   - bloquear habría matado el re-encabezar, y "reiniciar la aparición en el sitio" habría      │
 * │     roto el límite, que cuenta filas.                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL `LIMIT` CUENTA PERSONAS, NO FILAS. Por eso el dedup va DENTRO, en una subconsulta con
 * `ROW_NUMBER()`: filtrando después en JavaScript, un usuario con dos apariciones se habría llevado
 * dos de las cinco plazas del `LIMIT` y la vitrina saldría corta teniendo destacados esperando — el
 * mismo error que ya se evitó con las cuentas suspendidas.
 *
 * `limite` acota la fila de la portada; la sección completa (Pieza 4) pedirá más, y hereda este
 * dedup. Si no hay ninguno vigente devuelve la lista vacía, y eso es información: significa que
 * nadie ha destacado su perfil. Rellenarla para "que no se vea vacía" es lo que había antes.
 */
export async function destacadosVigentes(
  db: PrismaClient,
  opciones: { ahora?: Date; limite?: number } = {},
): Promise<PerfilDestacado[]> {
  const ahora = opciones.ahora ?? new Date();
  const limite = Math.min(Math.max(opciones.limite ?? BOOST_DESTACADOS_PORTADA, 1), 100);

  const filas = await db.$queryRaw<FilaDestacado[]>(Prisma.sql`
    SELECT
      t.activacionId,
      t.userId,
      t.username,
      t.displayName,
      t.imagen,
      t.puntos,
      t.destacadoDesde,
      t.expiraEn
    FROM (
      SELECT
        a.\`id\`            AS activacionId,
        a.\`userId\`        AS userId,
        u.\`username\`      AS username,
        u.\`displayName\`   AS displayName,
        u.\`image\`         AS imagen,
        u.\`pointsBalance\` AS puntos,
        a.\`startsAt\`      AS destacadoDesde,
        -- EL FINAL MÁS LEJANO DE SUS APARICIONES VIGENTES, no el de esta fila: quien encadena dos
        -- boosts alarga su presencia, y el campo dice cuándo deja de estar destacado de verdad.
        MAX(a.\`expiresAt\`) OVER (PARTITION BY a.\`userId\`) AS expiraEn,
        -- UNA FILA POR PERSONA: la de arranque más reciente, que es la que le da su sitio.
        ROW_NUMBER() OVER (
          PARTITION BY a.\`userId\`
          ORDER BY a.\`startsAt\` DESC, a.\`id\` DESC
        ) AS rn
      FROM \`BoostActivation\` a
      JOIN \`User\` u ON u.\`id\` = a.\`userId\`
      WHERE a.\`expiresAt\` > ${ahora}
        AND u.\`deletedAt\` IS NULL
        AND u.\`bannedAt\` IS NULL
    ) t
    WHERE t.rn = 1
    ORDER BY t.destacadoDesde DESC, t.activacionId DESC
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
