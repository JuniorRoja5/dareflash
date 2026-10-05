import type { Prisma } from "@/generated/prisma/client";

/**
 * QUÉ COMENTARIO SE VE. La hermana de `VIDEO_VISIBLE`, y nace por el mismo motivo: la condición
 * estaba escrita a mano en cada consulta (`retiradoEn: null`, tres veces), y al añadir un segundo
 * motivo para no verse —el ocultado por denuncias— una de las tres se habría quedado atrás. La que
 * se quedara atrás sería el agujero por el que un comentario escondido sigue leyéndose.
 *
 * DOS MOTIVOS DISTINTOS PARA NO VERSE, y por eso son dos columnas:
 *  - `retiradoEn`: lo retiró una PERSONA (su autor o un moderador). Definitivo.
 *  - `ocultoAutoEn`: lo escondió el UMBRAL de denuncias. Provisional, pendiente de que un
 *    moderador confirme o descarte.
 *
 * NO se usa en el camino de RETIRAR: ahí hay que poder actuar sobre un comentario ya auto-oculto
 * —es justo lo que hace el moderador al confirmar—, así que aquella consulta mira solo
 * `retiradoEn` a propósito.
 */
export const COMENTARIO_VISIBLE = {
  retiradoEn: null,
  ocultoAutoEn: null,
} satisfies Prisma.CommentWhereInput;
