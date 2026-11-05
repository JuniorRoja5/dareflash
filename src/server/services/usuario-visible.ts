import { Prisma } from "@/generated/prisma/client";

/**
 * QUÉ PERSONA SE VE EN PÚBLICO: un PARTICIPANTE visible. La regla, escrita UNA vez, para todo lo que
 * resuelve o lista personas a la vista de otros —el perfil /u/<handle>, el buscador, el ranking, la
 * vitrina de destacados, el código de un enlace de invitación, a quién se le puede dar un toque— y
 * para la audiencia de un anuncio. Es la hermana de `VIDEO_VISIBLE`, que la reutiliza para el autor.
 *
 *  - Ni borrada ni baneada: lo que ya filtraba cada consulta por su cuenta.
 *  - Y NO una cuenta de EMPRESA (Fase 9, P2): una empresa no participa, así que no tiene perfil de
 *    participante que enseñar, ni puesto en un ranking, ni sitio en un listado de personas. Y donde
 *    se resuelve por su handle, responde lo MISMO que un usuario que no existe (404): quien prueba
 *    handles no averigua cuáles son de empresa.
 *
 * ┌─ POR QUÉ UNA CONSTANTE Y NO UN `where` EN CADA SITIO ─────────────────────────────────────────┐
 * │ Cada consulta llevaba su `deletedAt: null, bannedAt: null` escrito a mano. Añadir la empresa   │
 * │ en seis sitios habría dejado alguno fuera, y el que se quedara fuera es justo por donde la     │
 * │ empresa vuelve a asomar como participante. Aquí es una línea. El test `usuario-visible` censa │
 * │ cada función que consulta `User` y obliga a clasificarla: pública (y entonces usa esto) o     │
 * │ privada, con su porqué.                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DOS FORMAS, UNA REGLA: la de Prisma (`USUARIO_VISIBLE`) y la de SQL a pelo (`usuarioVisibleSql`)
 * para las consultas con `$queryRaw` (buscador, vitrina). Un test las ejecuta las dos contra la misma
 * base y exige que devuelvan las mismas filas: si una cambia sin la otra, rojo.
 *
 * Sin `server-only`: lo usa también el worker (reparto de anuncios).
 */
export const USUARIO_VISIBLE = {
  deletedAt: null,
  bannedAt: null,
  esCuentaEmpresa: false,
} as const satisfies Prisma.UserWhereInput;

/** Un alias de tabla de una letra o palabra corta: nunca llega de fuera, pero se comprueba igual. */
const ALIAS = /^[a-z][a-z0-9_]{0,15}$/;

/**
 * La MISMA regla en SQL, para un `WHERE` de `$queryRaw`. `alias` = el de la tabla `User` en la
 * consulta (`u`), o nada si la consulta lee `User` sin alias.
 */
export function usuarioVisibleSql(alias?: string): Prisma.Sql {
  if (alias !== undefined && !ALIAS.test(alias)) throw new Error(`alias no válido: ${alias}`);
  const col = (c: string) => Prisma.raw(alias ? `\`${alias}\`.\`${c}\`` : `\`${c}\``);
  return Prisma.sql`${col("deletedAt")} IS NULL AND ${col("bannedAt")} IS NULL AND ${col("esCuentaEmpresa")} = 0`;
}
