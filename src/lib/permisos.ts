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

// ---------------------------------------------------------------------------------------------------
// GOBIERNO DE CUENTAS. Un único superadmin (el que crea `scripts/create-admin.ts`), moderadores que
// nombra él, y usuarios. Las dos reglas viven aquí, puras, porque las usan la ruta hoy y el panel
// mañana: escritas dos veces, la pantalla acabaría ofreciendo lo que la API rechaza.
// ---------------------------------------------------------------------------------------------------

/** Los roles que la API puede ASIGNAR. `ADMIN` no está, y esa ausencia es la guarda. */
export const ROLES_ASIGNABLES = ["USER", "MODERATOR"] as const;
export type RolAsignable = (typeof ROLES_ASIGNABLES)[number];

/**
 * ¿Puede el actor poner al destino el rol pedido? TRES cláusulas, y cada una tapa un agujero distinto:
 *
 *  1. SOLO EL SUPERADMIN NOMBRA. Nombrar rol no es moderar: un moderador no se fabrica compañeros.
 *  2. `ADMIN` NO ES EXPRESABLE. Aunque alguien colara el literal, aquí no pasa: no se acuña un segundo
 *     superadmin por API. El único camino a ADMIN es el script de arranque.
 *  3. AL ADMIN NO SE LE TOCA. Si el destino ya es ADMIN, se rechaza — así el superadmin no puede ser
 *     degradado, ni por otro ni por sí mismo en un despiste.
 */
export function puedeAsignarRol(x: {
  rolActor: string;
  rolActualDestino: string;
  rolPedido: string;
}): boolean {
  if (x.rolActor !== "ADMIN") return false;
  if (!(ROLES_ASIGNABLES as readonly string[]).includes(x.rolPedido)) return false;
  if (x.rolActualDestino === "ADMIN") return false;
  return true;
}

/**
 * ¿Puede el actor SUSPENDER (o levantar la suspensión de) la cuenta destino? Suspender SÍ es moderar,
 * así que basta con MODERATOR (el ADMIN lo cumple por jerarquía). Pero SOLO sobre una cuenta de
 * usuario: un moderador comprometido no puede echar a otros moderadores ni al superadmin. Para retirar
 * a un moderador, el superadmin lo degrada primero (lo que además le revoca las sesiones) y ya como
 * usuario se le puede suspender.
 */
export function puedeBanear(x: { rolActor: string; rolDestino: string }): boolean {
  const actorModera = x.rolActor === "MODERATOR" || x.rolActor === "ADMIN";
  return actorModera && x.rolDestino === "USER";
}

/**
 * EL MOVIMIENTO QUE SE OFRECE sobre una cuenta: un moderador se degrada, cualquier otro se asciende.
 * El interruptor tiene dos posiciones, así que el destino del clic se deduce del estado actual y no se
 * escribe en la pantalla (donde acabaría diciendo otra cosa que la regla).
 */
export function rolAlternativo(rolActual: string): RolAsignable {
  return rolActual === "MODERATOR" ? "USER" : "MODERATOR";
}

/** Qué controles tiene sentido PINTAR sobre una cuenta, según quién la mira. */
export interface ControlesCuenta {
  /** Ofrecer el cambio de rol (ascender o degradar, ver `rolAlternativo`). */
  puedeRol: boolean;
  puedeSuspender: boolean;
  puedeLevantar: boolean;
}

/**
 * QUÉ SE LE OFRECE A QUIEN MIRA sobre una cuenta concreta. No es una regla nueva: son
 * `puedeAsignarRol` y `puedeBanear`, preguntadas por el movimiento concreto que se pintaría. Existe
 * para que la pantalla no decida a ojo en el JSX —ahí es donde una condición se copia mal y acaba
 * ofreciendo lo que la API rechaza— y para que la página siga siendo correcta cuando el panel se abra
 * a los moderadores: lo que cambia entonces es el ROL DE QUIEN MIRA, no este código.
 *
 * ESTO ES CONVENIENCIA, NO SEGURIDAD. La autoridad son las rutas, que vuelven a comprobar contra la
 * fila real: aquí solo se evita ofrecer botones que no llevarían a ninguna parte.
 */
export function controlesCuenta(x: {
  rolMira: string;
  rolDestino: string;
  suspendido: boolean;
}): ControlesCuenta {
  const puedeModerar = puedeBanear({ rolActor: x.rolMira, rolDestino: x.rolDestino });
  return {
    puedeRol: puedeAsignarRol({
      rolActor: x.rolMira,
      rolActualDestino: x.rolDestino,
      rolPedido: rolAlternativo(x.rolDestino),
    }),
    // Suspender y levantar son la misma potestad en dos estados: nunca se ofrecen los dos a la vez.
    puedeSuspender: puedeModerar && !x.suspendido,
    puedeLevantar: puedeModerar && x.suspendido,
  };
}
