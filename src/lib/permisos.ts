/**
 * PERMISOS de la app — punto ÚNICO de decisión. Aislado y PURO (cliente-seguro) para que el mismo
 * criterio lo usen el servidor (endpoint) y el cliente (mostrar/ocultar el botón), sin duplicar la regla.
 */

/** Forma mínima del usuario para decidir permisos: rol + los flags por-usuario. */
export interface UsuarioPermisos {
  role: string; // "USER" | "MODERATOR" | "ADMIN" (de la sesión o de Prisma)
  puedeCrearRetos: boolean;
}

/**
 * ¿Puede este usuario CREAR RETOS? ÚNICO sitio donde se decide. Hoy: el ADMIN siempre; cualquier otro
 * usuario SOLO si tiene el flag `puedeCrearRetos` (concedido por el admin). MODERATOR NO obtiene la
 * capacidad por su rol —necesita el flag como cualquiera—. Cuando existan el endpoint de creación y el
 * botón de UI, AMBOS llaman aquí; prohibido cablear `role === "ADMIN"` en ningún otro sitio.
 */
export function usuarioPuedeCrearRetos(usuario: UsuarioPermisos): boolean {
  return usuario.role === "ADMIN" || usuario.puedeCrearRetos === true;
}
