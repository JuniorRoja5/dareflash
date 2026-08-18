/**
 * Identidad de usuario en la UI (modelo TikTok/YouTube). Punto ÚNICO para decidir CÓMO se pinta un
 * usuario en cualquier superficie (perfil, feed, búsqueda, ranking, menú de cuenta):
 *
 *   - NOMBRE prominente = `displayName` si tiene contenido; si no, el propio `handle` hace de nombre.
 *   - "@handle" = identificador SECUNDARIO (pequeño, debajo) y SOLO cuando hay `displayName`. Si no hay
 *     displayName, el handle YA es el nombre -> no se duplica.
 *
 * `displayName` sigue siendo OPCIONAL; el `handle` (username) es obligatorio desde P1, así que siempre
 * hay algo que mostrar. Cliente-seguro (sin deps): viaja al bundle sin arrastrar nada.
 */

/** Nombre PROMINENTE: `displayName` si tiene contenido (recortado); si no, el `handle`. */
export function nombreMostrado(displayName: string | null | undefined, handle: string): string {
  const d = displayName?.trim();
  return d ? d : handle;
}

/** ¿Pintar el "@handle" secundario? Solo si hay `displayName` (si no, el handle ya es el nombre). */
export function mostrarHandleSecundario(displayName: string | null | undefined): boolean {
  return Boolean(displayName?.trim());
}
