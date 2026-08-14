/**
 * Servicio de PERFIL (server-only). Actualiza los datos EDITABLES del propio usuario.
 *
 * AUTORIZACIÓN POR CONSTRUCCIÓN: la función recibe el `userId` de la SESIÓN (nunca un id del
 * cliente) y actualiza EXACTAMENTE esa fila. No hay forma de que la firma edite el perfil de otro:
 * el `where` es el id de sesión, punto. La ruta que la llama pasa `user.userId` del `mutatingRoute`.
 *
 * La validación del nombre vive aquí como esquema Zod (el gate real de servidor); reutiliza los
 * límites y la whitelist de `perfil-logic` para que cliente y servidor no diverjan.
 */
import "server-only";

import { z } from "zod";

import {
  NOMBRE_MAX,
  NOMBRE_MIN,
  PATRON_NOMBRE,
  normalizarNombre,
} from "@/app/(app)/(shell)/perfil/perfil-logic";
import type { Db } from "@/server/db/types";

/**
 * Esquema del nombre visible. `transform` NORMALIZA (recorta + colapsa espacios) ANTES de medir y de
 * comprobar la whitelist, así se valida lo que de verdad se guardaría. El orden importa: primero
 * normaliza, luego longitud, luego caracteres. Un nombre vacío o de solo espacios cae por longitud.
 */
export const displayNameSchema = z
  .string()
  .transform(normalizarNombre)
  .pipe(
    z
      .string()
      .min(NOMBRE_MIN, "El nombre es demasiado corto.")
      .max(NOMBRE_MAX, "El nombre es demasiado largo.")
      .regex(PATRON_NOMBRE, "El nombre tiene caracteres no permitidos."),
  );

/** Cuerpo aceptado por la actualización de perfil (hoy: solo el nombre). */
export const actualizarPerfilSchema = z.object({ displayName: displayNameSchema });
export type ActualizarPerfilInput = z.infer<typeof actualizarPerfilSchema>;

/**
 * Actualiza el nombre visible del usuario `userId` (el de la SESIÓN). Devuelve el nombre ya guardado
 * (normalizado) para que la UI refleje lo persistido. `userId` NUNCA sale del cuerpo de la petición.
 */
export async function actualizarNombre(
  db: Db,
  userId: string,
  displayName: string,
): Promise<{ displayName: string }> {
  const actualizado = await db.user.update({
    where: { id: userId },
    data: { displayName },
    select: { displayName: true },
  });
  return { displayName: actualizado.displayName ?? displayName };
}
