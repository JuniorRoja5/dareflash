/**
 * LAS CIFRAS DE LO QUE ESPERA AL ADMIN — la consulta. La lógica de quién ve qué y cómo se suma es
 * pura y vive en `lib/pendientes-panel`.
 *
 * CADA CIFRA LEE LA MISMA CONSULTA QUE SU COLA. Las empresas pendientes se cuentan con
 * `contarEmpresas`, que usa el MISMO filtro que `listarEmpresas` (`filtroEmpresas`): el número de la
 * insignia y las filas de la cola no pueden decir cosas distintas.
 *
 * NO CONSULTA LO QUE QUIEN MIRA NO PUEDE ATENDER: a un moderador no se le cuentan las empresas (ni
 * siquiera se le pregunta a la base de datos). Y el panel lo pide en CADA página —va en el layout—,
 * así que el coste importa: un `COUNT` sobre el índice `[estado, createdAt, id]` es un rango del
 * índice, no un recorrido de la tabla.
 */
import "server-only";

import type { PendientesPanel } from "@/lib/pendientes-panel";
import { SECCION_DE_PENDIENTE } from "@/lib/pendientes-panel";
import { alcanzaRol } from "@/lib/permisos";
import type { Db } from "@/server/db/types";

import { contarEmpresas } from "./empresas";

export async function pendientesPanel(db: Db, rol: string): Promise<PendientesPanel> {
  const empresas = alcanzaRol(rol, SECCION_DE_PENDIENTE.empresas.rol)
    ? await contarEmpresas(db, "PENDIENTE")
    : 0;
  return { empresas };
}
