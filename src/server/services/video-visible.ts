import type { Prisma } from "@/generated/prisma/client";

/**
 * QUÉ VÍDEO SE VE EN PÚBLICO. La regla del feed, escrita UNA vez para todo lo que cuelga de un vídeo
 * visible: el feed que lo lista y los comentarios que se leen o se escriben sobre él. Si cada uno
 * tuviera la suya, se podría comentar un vídeo retirado, o leer los comentarios de uno que el feed ya
 * no enseña.
 *
 *  - PUBLISHED (lo retirado o fallido no se ve), y no un REEMPLAZO en vuelo: ese sale cuando el swap lo
 *    convierte en la participación.
 *  - De un autor ni borrado ni baneado.
 *  - O es la participación de un reto que sigue existiendo (un reto borrado por el admin se lleva su
 *    contenido), o es una subida LIBRE con categoría (un vídeo suelto sin ella no se cuela).
 */
export const VIDEO_VISIBLE: Prisma.VideoWhereInput = {
  status: "PUBLISHED",
  reemplazaSubmissionId: null,
  user: { deletedAt: null, bannedAt: null },
  OR: [
    { submission: { challenge: { deletedAt: null, eliminacionProgramadaEn: null } } },
    { submission: null, category: { not: null } },
  ],
};
