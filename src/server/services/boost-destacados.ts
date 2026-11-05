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

import {
  BOOST_CARRILES,
  BOOST_DESTACADOS_PORTADA,
  BOOST_DESTACADOS_TOPE,
  BOOST_ROTACION_SEG,
} from "@/config/constants";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { indiceVentana, portadaDeVentana } from "@/lib/boost-rotacion";
import { codificarCursorTiempo, decodificarCursorTiempo } from "@/lib/cursor-tiempo";
import type { Db } from "@/server/db/types";

import { usuarioVisibleSql } from "./usuario-visible";
import { vipsActivosEntre } from "./vip";

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
  /** ¿VIP ahora mismo? UNA consulta para toda la vitrina (hasta cuarenta caras), nunca una por fila. */
  esVip: boolean;
  /**
   * El carril de la rotación de esta aparición. Lo usa `portadaDestacados` para elegir quién sale
   * en la ventana actual; la sección completa lo ignora (ahí salen todos).
   */
  carril: number;
  /** CLAVE del color de nombre (nunca un hex). Solo pinta si `esVip`. */
  colorNombre: string | null;
}

/** Lo que devuelve el driver: fechas como `Date` y los enteros posiblemente como `bigint`. */
interface FilaDestacado {
  activacionId: string;
  userId: string;
  username: string;
  displayName: string | null;
  imagen: string | null;
  puntos: number | bigint;
  colorNombre: string | null;
  destacadoDesde: Date;
  expiraEn: Date;
  carril: number;
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
  opciones: { ahora?: Date; limite?: number; cursor?: string | null } = {},
): Promise<PerfilDestacado[]> {
  const ahora = opciones.ahora ?? new Date();
  const limite = Math.min(
    Math.max(opciones.limite ?? BOOST_DESTACADOS_PORTADA, 1),
    BOOST_DESTACADOS_TOPE,
  );

  // KEYSET, NUNCA OFFSET (regla del repo). El corte va por el MISMO par que ordena
  // —`destacadoDesde` y, para desempatar, `activacionId`—, y fuera de la subconsulta: metido dentro
  // cortaría ANTES del `ROW_NUMBER()`, así que a quien encadena dos boosts se le elegiría como
  // "su" aparición una que no es la más reciente, y saldría dos veces al pasar de página.
  const desde = decodificarCursorTiempo(opciones.cursor ?? null);
  const corte = desde
    ? Prisma.sql`AND (t.destacadoDesde < ${new Date(desde.creadoMs)}
        OR (t.destacadoDesde = ${new Date(desde.creadoMs)} AND t.activacionId < ${desde.id}))`
    : Prisma.empty;

  const filas = await db.$queryRaw<FilaDestacado[]>(Prisma.sql`
    SELECT
      t.activacionId,
      t.userId,
      t.username,
      t.displayName,
      t.imagen,
      t.puntos,
      t.colorNombre,
      t.destacadoDesde,
      t.expiraEn,
      t.carril
    FROM (
      SELECT
        a.\`id\`            AS activacionId,
        a.\`userId\`        AS userId,
        u.\`username\`      AS username,
        u.\`displayName\`   AS displayName,
        u.\`image\`         AS imagen,
        u.\`pointsBalance\` AS puntos,
        u.\`colorNombre\`   AS colorNombre,
        a.\`startsAt\`      AS destacadoDesde,
        a.\`carril\`        AS carril,
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
        AND ${usuarioVisibleSql("u")}
    ) t
    WHERE t.rn = 1
    ${corte}
    ORDER BY t.destacadoDesde DESC, t.activacionId DESC
    LIMIT ${limite}
  `);

  // LOS VIP DE LA VITRINA, EN UNA CONSULTA. Va aparte de la `$queryRaw` de arriba a propósito: la
  // de arriba ya es una ventana con `ROW_NUMBER()` y un `PARTITION BY`, y meterle un LEFT JOIN a
  // `Subscription` con su condición de fecha mezclaría dos reglas —quién está destacado y quién es
  // VIP— en una consulta que nadie va a querer leer. La regla del VIP vive en el chokepoint, puro y
  // probado solo; aquí solo se pregunta por el lote.
  const vips = await vipsActivosEntre(
    db,
    filas.map((f) => f.userId),
    ahora,
  );

  return filas.map((f) => ({
    activacionId: f.activacionId,
    userId: f.userId,
    username: f.username,
    displayName: f.displayName,
    imagen: f.imagen,
    puntos: Number(f.puntos),
    destacadoDesdeMs: f.destacadoDesde.getTime(),
    expiraEnMs: f.expiraEn.getTime(),
    esVip: vips.has(f.userId),
    colorNombre: f.colorNombre,
    carril: Number(f.carril),
  }));
}

/**
 * LOS CINCO DE LA PORTADA EN ESTA VENTANA. Es la lista que ve quien entra en `/inicio`.
 *
 * ┌─ POR QUÉ NO ES "LOS 5 MÁS RECIENTES" ──────────────────────────────────────────────────────────┐
 * │ Lo era, y con más de 5 vigentes se comportaba como una PILA: la portada la ocupaban siempre    │
 * │ las últimas activaciones, así que quien compraba al principio de una hora con tráfico era      │
 * │ desplazado a los pocos minutos y NO volvía — cada compra nueva lo empujaba más abajo. Pagaba   │
 * │ lo mismo que los demás y podía quedarse con un minuto de portada, o con ninguno.               │
 * │                                                                                                 │
 * │ Ahora rota por carriles, y la rotación cumple una promesa medible: al menos                    │
 * │ `BOOST_MIN_PORTADA` minutos dentro de su hora, lleguen las activaciones como lleguen. La        │
 * │ demostración —y por qué sale exacta— está en `lib/boost-rotacion`.                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE LEEN TODOS LOS VIGENTES Y SE ELIGE EN MEMORIA, y no con un `WHERE carril = …` en SQL, por dos
 * razones: son como mucho `BOOST_MAX_SIMULTANEOS` filas (60) porque el cupo lo garantiza, así que
 * leerlas cuesta lo mismo; y el relleno con los carriles siguientes —lo que evita una portada medio
 * vacía cuando hay pocos— no se escribe en una cláusula `WHERE` sin perder la claridad de la regla.
 *
 * MISMA VENTANA, MISMA PORTADA: la selección depende del índice de ventana, no del instante. Dos
 * visitantes del mismo minuto ven lo mismo, y por eso esto se puede cachear con una clave por
 * ventana.
 */
export async function portadaDestacados(
  db: PrismaClient,
  opciones: { ahora?: Date } = {},
): Promise<PerfilDestacado[]> {
  const ahora = opciones.ahora ?? new Date();
  // El tope: con el cupo puesto nunca habrá más, y pedir el tope en vez de 5 es lo que permite
  // rotar (con 5 no se podría elegir entre quiénes).
  const vigentes = await destacadosVigentes(db, { ahora, limite: BOOST_DESTACADOS_TOPE });

  const elegidos = portadaDeVentana(
    vigentes.map((v) => ({ id: v.activacionId, userId: v.userId, carril: v.carril })),
    indiceVentana(ahora.getTime(), BOOST_ROTACION_SEG),
    { carriles: BOOST_CARRILES, huecos: BOOST_DESTACADOS_PORTADA },
  );

  const porId = new Map(vigentes.map((v) => [v.activacionId, v]));
  return elegidos.map((e) => porId.get(e.id)!);
}

/** Una página de la vitrina completa, por keyset. */
export interface PaginaDestacados {
  items: PerfilDestacado[];
  nextCursor: string | null;
}

/**
 * UNA PÁGINA de `/destacados`, por keyset.
 *
 * Con el cupo de `BOOST_MAX_SIMULTANEOS` caben todos por debajo del tope, así que hoy la segunda
 * página casi nunca existe. Se pagina igual, y no por ceremonia: el día que el máximo suba, una
 * lista sin paginar es una consulta que crece sin que nadie lo decida — y añadir paginación
 * después obliga a tocar la pantalla con tráfico encima. Keyset, nunca `OFFSET`.
 */
export async function paginaDestacados(
  db: PrismaClient,
  opciones: { ahora?: Date; cursor?: string | null; porPagina?: number } = {},
): Promise<PaginaDestacados> {
  const porPagina = Math.min(Math.max(opciones.porPagina ?? 24, 1), BOOST_DESTACADOS_TOPE - 1);
  // Una de más: así se sabe si hay siguiente sin un `count` aparte.
  const filas = await destacadosVigentes(db, {
    ahora: opciones.ahora,
    cursor: opciones.cursor,
    limite: porPagina + 1,
  });

  const hayMas = filas.length > porPagina;
  const items = hayMas ? filas.slice(0, porPagina) : filas;
  const ultima = items.at(-1);
  return {
    items,
    nextCursor:
      hayMas && ultima
        ? codificarCursorTiempo({ creadoMs: ultima.destacadoDesdeMs, id: ultima.activacionId })
        : null,
  };
}

/**
 * DE UN LOTE DE AUTORES, QUIÉNES ESTÁN DESTACADOS AHORA MISMO. Una consulta, y después pertenencia
 * O(1).
 *
 * ┌─ VIVE AQUÍ PARA QUE HAYA UNA SOLA VERDAD ─────────────────────────────────────────────────────┐
 * │ La usan el feed global y el feed de un reto. Con una copia en cada servicio, el mismo autor    │
 * │ podría salir destacado en una pantalla y plano en la otra en cuanto una de las dos se tocara — │
 * │ y "destacado" dejaría de significar lo mismo según por dónde hubieras entrado.                │
 * │                                                                                               │
 * │ Y ES UN CONJUNTO, NO UN DATO POR POST: preguntar por cada vídeo "¿su autor está destacado?"    │
 * │ son N consultas en el componente más caro de la app, y N crece con el scroll infinito.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * "VIGENTE" ES `expiresAt > ahora`, la misma verdad que la vitrina: el estado se calcula, no hay
 * columna ni job. Un Boost que expira deja de resaltar en la consulta siguiente, solo. `distinct`
 * por usuario porque lo que se necesita es la pertenencia, no cuántas apariciones tiene quien
 * encadenó varias.
 *
 * NO FILTRA CUENTAS SUSPENDIDAS, y no hace falta: quien llama solo trae autores de contenido
 * visible (`VIDEO_VISIBLE` ya excluye borrados y baneados), así que un id de alguien suspendido no
 * llega hasta aquí.
 */
export async function autoresDestacados(
  db: Db,
  userIds: readonly string[],
  ahora: Date = new Date(),
): Promise<ReadonlySet<string>> {
  const unicos = [...new Set(userIds)];
  if (unicos.length === 0) return new Set();
  const vigentes = await db.boostActivation.findMany({
    where: { userId: { in: unicos }, expiresAt: { gt: ahora } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return new Set(vigentes.map((a) => a.userId));
}
