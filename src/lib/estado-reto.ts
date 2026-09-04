/**
 * ESTADO REAL de un reto en el panel. Se CALCULA, no se lee de la columna: `status` dice qué quiso el
 * admin, no en qué punto está el reto AHORA. Un reto PUBLISHED cuyo plazo venció seguía pintándose
 * "Publicado" en la lista, que es lo que el admin veía y no cuadraba con la realidad.
 *
 * "Programado" existe porque un reto puede estar publicado y aún sin abrir (`startsAt` futuro): antes
 * era indistinguible de uno abierto, y son cosas distintas para quien administra.
 */
export type EstadoRetoAdmin =
  "borrador" | "programado" | "abierto" | "cerrado" | "en-borrado" | "borrado";

export function estadoRetoAdmin(
  reto: {
    status: string;
    startsAt: Date;
    deadline: Date;
    eliminacionProgramadaEn: Date | null;
    deletedAt: Date | null;
  },
  ahora: Date = new Date(),
): EstadoRetoAdmin {
  // El borrado manda sobre todo lo demás: un reto en camino de desaparecer no es "abierto".
  if (reto.deletedAt) return "borrado";
  if (reto.eliminacionProgramadaEn) return "en-borrado";
  if (reto.status === "DRAFT") return "borrador";
  if (reto.status === "CLOSED" || reto.deadline <= ahora) return "cerrado";
  if (reto.startsAt > ahora) return "programado";
  return "abierto";
}
