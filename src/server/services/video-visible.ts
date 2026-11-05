import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db/types";
import { USUARIO_VISIBLE } from "@/server/services/usuario-visible";

/**
 * QUÉ VÍDEO SE VE EN PÚBLICO. La regla del feed, escrita UNA vez para todo lo que cuelga de un vídeo
 * visible: el feed que lo lista y los comentarios que se leen o se escriben sobre él. Si cada uno
 * tuviera la suya, se podría comentar un vídeo retirado, o leer los comentarios de uno que el feed ya
 * no enseña.
 *
 *  - PUBLISHED (lo retirado o fallido no se ve), y no un REEMPLAZO en vuelo: ese sale cuando el swap lo
 *    convierte en la participación.
 *  - De un autor visible (`USUARIO_VISIBLE`: ni borrado, ni baneado, ni cuenta de empresa).
 *  - O es la participación de un reto que sigue existiendo (un reto borrado por el admin se lleva su
 *    contenido), o es una subida LIBRE con categoría (un vídeo suelto sin ella no se cuela).
 *  - Y NO lo ha escondido el umbral de denuncias.
 *
 * EL AUTO-OCULTO ENTRA AQUÍ Y NO EN CADA CONSULTA, y esa es la ventaja de que la regla sea una:
 * con esta línea desaparece del feed, de las listas, de los comentarios que cuelgan de él y —por
 * el mismo camino— deja de poderse denunciar, porque `denunciar` comprueba la visibilidad con esta
 * misma constante. Escribirlo en cada sitio habría dejado alguno fuera, y el que se quedara fuera
 * sería un agujero por el que el contenido escondido sigue viéndose.
 */
export const VIDEO_VISIBLE: Prisma.VideoWhereInput = {
  status: "PUBLISHED",
  ocultoAutoEn: null,
  reemplazaSubmissionId: null,
  // El AUTOR, con la regla de persona visible (`USUARIO_VISIBLE`): una sola definición para los dos.
  user: USUARIO_VISIBLE,
  OR: [
    { submission: { challenge: { deletedAt: null, eliminacionProgramadaEn: null } } },
    { submission: null, category: { not: null } },
  ],
};

/** Lo mínimo para firmar una reproducción. `thumbnailFileName` es OBLIGATORIO en el select de
 *  cualquier cosa que firme un póster (si no, Bunny devuelve su frame automático). */
const SELECT_REPRODUCCION = {
  bunnyVideoId: true,
  thumbnailFileName: true,
  status: true,
} satisfies Prisma.VideoSelect;

export type VideoReproducible = Prisma.VideoGetPayload<{ select: typeof SELECT_REPRODUCCION }>;

/**
 * LA FILA QUE SE PUEDE REPRODUCIR, o `null`. Vive aquí, pegada a la regla, PORQUE la ruta de
 * reproducción se saltó la regla justo por estar lejos de ella: filtraba `status === "PUBLISHED"` a
 * mano y devolvía una URL firmada de vídeos que la moderación había escondido. Con la consulta aquí,
 * "qué se ve" y "qué se puede reproducir" no pueden volver a separarse sin tocar este fichero.
 *
 * Recibe el `Db` por parámetro (sin `env`, sin singleton): se prueba contra la base, que es la única
 * forma de que el test muerda el filtro de verdad en vez de una copia escrita en el propio test.
 */
export function videoReproducible(db: Db, id: string): Promise<VideoReproducible | null> {
  // `findFirst` y no `findUnique`: el id es único, pero el filtro lleva relaciones y un OR, y
  // `findUnique` solo admite campos de la clave.
  return db.video.findFirst({ where: { id, ...VIDEO_VISIBLE }, select: SELECT_REPRODUCCION });
}
