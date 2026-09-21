import type { EstadoCuenta, OrdenCuentas } from "@/lib/cuentas-listado";
import type { RolAsignable } from "@/lib/permisos";
import type { SessionUser } from "@/server/auth/session";

/**
 * Nombre HUMANO de cada rol en el panel. `Record` sobre la unión: un rol nuevo sin su etiqueta no
 * compila, en vez de salir en pantalla como `MODERATOR`. Mismo criterio que `ETIQUETA_TIPO` de las
 * notificaciones.
 *
 * ADMIN se lee «Superadministrador» y no «Administrador» a propósito: hay UNO solo, el que crea
 * `scripts/create-admin.ts`, y el panel entero está lleno de gente que administra sin serlo. La
 * palabra larga es la que distingue al que no se puede degradar.
 */
export const ETIQUETA_ROL: Record<SessionUser["role"], string> = {
  USER: "Usuario",
  MODERATOR: "Moderador",
  ADMIN: "Superadministrador",
};

/** El estado de la cuenta, también en humano: `bannedAt` no se le enseña a nadie. */
export const ETIQUETA_SUSPENDIDA = "Suspendida";
export const ETIQUETA_ACTIVA = "Activa";

/**
 * Los ÓRDENES del listado, en humano. `Record` sobre la unión otra vez: añadir un orden al vocabulario
 * sin ponerle nombre no compila.
 *
 * «Retos ganados» y no «victorias» porque es como se llama en el resto del producto (el aviso dice
 * "has ganado un reto"), y porque el ranking del mes ya usa «victorias» para otra cosa: las de ESE
 * mes. Aquí son las de siempre.
 */
export const ETIQUETA_ORDEN: Record<OrdenCuentas, string> = {
  alta: "Fecha de alta",
  alfabetico: "Alfabético",
  puntos: "Puntos",
  victorias: "Retos ganados",
};

/** Los ESTADOS, como filtro (en plural: se filtra un conjunto, no se describe una cuenta). */
export const ETIQUETA_ESTADO_FILTRO: Record<EstadoCuenta, string> = {
  activa: "Activas",
  suspendida: "Suspendidas",
};

/** Lo que dice el desplegable cuando no se filtra por nada. */
export const ETIQUETA_TODOS = "Todos";
export const ETIQUETA_TODAS = "Todas";

/**
 * El COPY del cambio de rol, por el rol que se PIDE. Aquí y no en el componente: si el botón eligiera
 * su texto con un `if` sobre el rol, ese `if` sería una segunda regla —escrita al lado de la de
 * verdad— y acabaría diciendo "hacer moderador" donde se degrada.
 */
export const ACCION_ROL: Record<RolAsignable, { boton: string; pregunta: (h: string) => string }> =
  {
    MODERATOR: {
      boton: "Hacer moderador",
      pregunta: (handle) => `¿Hacer moderador a @${handle}?`,
    },
    USER: {
      boton: "Quitar moderador",
      pregunta: (handle) => `¿Quitarle la moderación a @${handle}?`,
    },
  };
