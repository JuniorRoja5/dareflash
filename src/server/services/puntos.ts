/**
 * PUNTOS DEL USUARIO — lo que necesita su propia pantalla de /puntos.
 *
 * ¿POR QUÉ UN FICHERO APARTE SI EL HISTORIAL YA EXISTÍA? Porque existía en `dareup-admin`, que es el
 * inspector: lo lee un admin sobre la cuenta de otro, y por eso enseña la nota interna del ajuste y
 * el handle del admin que lo firmó. Duplicar la consulta para quitar dos campos habría duplicado
 * también el keyset —la parte que de verdad cuesta mantener—, así que el keyset sigue siendo uno solo
 * y lo que cambia es la VOZ (ver `VozHistorial`).
 *
 * Y la página importa SOLO esto, nunca `dareup-admin`: así la voz no puede quedarse a medias por un
 * import cómodo desde la pantalla equivocada. Un test lo vigila.
 */
import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { historialPuntos, type PaginaHistorial } from "./dareup-admin";

/**
 * MIS movimientos de puntos, del más nuevo al más viejo y por KEYSET.
 *
 * La autorización es POR CONSTRUCCIÓN: no hay parámetro que diga de quién es el historial más allá
 * del `userId` que pasa la página, y la página lo saca de la sesión. No se puede pedir el de otro.
 */
export async function miHistorialPuntos(
  db: PrismaClient,
  userId: string,
  opciones: { cursor?: string | null; limite?: number } = {},
): Promise<PaginaHistorial> {
  return historialPuntos(db, userId, { ...opciones, voz: "propia" });
}
