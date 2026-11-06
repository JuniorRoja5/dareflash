/**
 * LAS CIFRAS DE LO QUE ESPERA AL ADMIN — la consulta. La lógica de quién ve qué y cómo se suma es
 * pura y vive en `lib/pendientes-panel`.
 *
 * CADA CIFRA LEE LA MISMA CONSULTA QUE SU COLA. Las empresas pendientes se cuentan con
 * `contarEmpresas`, que usa el MISMO filtro que `listarEmpresas` (`filtroEmpresas`); las propuestas
 * de reto, con `contarSolicitudesReto` y `filtroSolicitudesReto` (Fase 9 · P3). El número de la
 * insignia y las filas de la cola no pueden decir cosas distintas.
 *
 * NO CONSULTA LO QUE QUIEN MIRA NO PUEDE ATENDER: a un moderador no se le cuentan (ni siquiera se le
 * pregunta a la base de datos). Y el panel lo pide en CADA página —va en el layout—, así que el coste
 * importa: cada `COUNT` va sobre un índice `[estado, createdAt, id]`, un rango del índice y no un
 * recorrido de la tabla. Las dos van en paralelo.
 */
import "server-only";

import type { PendientesPanel } from "@/lib/pendientes-panel";
import { SECCION_DE_PENDIENTE } from "@/lib/pendientes-panel";
import { alcanzaRol } from "@/lib/permisos";
import type { Db } from "@/server/db/types";

import { contarEmpresas } from "./empresas";
import { contarPublicidadEnRevision } from "./publicidad-moderacion";
import { contarSolicitudesReto } from "./retos-empresa";

export async function pendientesPanel(db: Db, rol: string): Promise<PendientesPanel> {
  const puede = (k: keyof PendientesPanel) => alcanzaRol(rol, SECCION_DE_PENDIENTE[k].rol);
  const [empresas, propuestas, publicidad] = await Promise.all([
    puede("empresas") ? contarEmpresas(db, "PENDIENTE") : 0,
    puede("propuestas") ? contarSolicitudesReto(db, "PENDIENTE") : 0,
    // Fase 9 · P8: las campañas en revisión, con el MISMO filtro que la lista «En revisión».
    puede("publicidad") ? contarPublicidadEnRevision(db) : 0,
  ]);
  return { empresas, propuestas, publicidad };
}
