import type { RolAsignable } from "@/lib/permisos";
import type { SessionUser } from "@/server/auth/session";

/**
 * Nombre HUMANO de cada rol en el panel. `Record` sobre la unión: un rol nuevo sin su etiqueta no
 * compila, en vez de salir en pantalla como `MODERATOR`. Mismo criterio que `ETIQUETA_TIPO` de las
 * notificaciones.
 */
export const ETIQUETA_ROL: Record<SessionUser["role"], string> = {
  USER: "Usuario",
  MODERATOR: "Moderador",
  ADMIN: "Administrador",
};

/** El estado de la cuenta, también en humano: `bannedAt` no se le enseña a nadie. */
export const ETIQUETA_SUSPENDIDA = "Suspendida";
export const ETIQUETA_ACTIVA = "Activa";

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
