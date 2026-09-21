/**
 * Secciones del PANEL (nav). FUENTE ÚNICA: la usan la barra de navegación, el Resumen y —desde que el
 * panel se abrió a los moderadores— EL GUARD DE CADA PÁGINA.
 *
 * EL ROL VIVE AQUÍ Y EN NINGÚN OTRO SITIO. El layout deja entrar a MODERATOR o superior (el shell no
 * es la barrera), y cada página exige el rol de SU sección con `requireSeccion`. Escribir un
 * `requireRole("ADMIN")` suelto en una página sería una segunda verdad: el día que una sección cambie
 * de rol, la nav diría una cosa y la página otra. Por eso el guard se DERIVA de esta lista.
 */
export type RolSeccion = "ADMIN" | "MODERATOR";

export interface SeccionPanel {
  href: string;
  label: string;
  /** Frase honesta de qué hará (para el Resumen y el placeholder). */
  descripcion: string;
  /** Fase futura que la implementará; `null` = ya funcional. */
  fase: number | null;
  /**
   * Rol MÍNIMO para entrar. Moderación y Usuarios son el trabajo del moderador; el resto —retos,
   * dinero, puntos, anuncios y sus métricas— es del administrador, y no se abre "de paso" por abrir
   * el shell: un moderador no tiene por qué ver el negocio.
   */
  rol: RolSeccion;
}

import { alcanzaRol } from "@/lib/permisos";

export const SECCIONES_PANEL: SeccionPanel[] = [
  {
    href: "/panel",
    label: "Resumen",
    descripcion: "Vista general del panel y accesos a cada sección.",
    fase: null,
    rol: "ADMIN",
  },
  {
    href: "/panel/retos",
    label: "Retos",
    descripcion: "Crear, publicar y listar retos con su premio, plazo, ganadores y reglas.",
    fase: null,
    rol: "ADMIN",
  },
  {
    href: "/panel/moderacion",
    label: "Moderación",
    descripcion: "Revisar denuncias de vídeos y retos y aplicar acciones de moderación.",
    fase: null,
    rol: "MODERATOR",
  },
  {
    href: "/panel/usuarios",
    label: "Usuarios",
    descripcion: "Buscar cuentas, ver su estado y gestionar roles, baneos y permisos.",
    fase: null,
    // El moderador entra a buscar y suspender; ASIGNAR ROL sigue siendo del administrador, y de eso
    // se encarga la regla de la pantalla (`controlesCuenta`) y la ruta, no el acceso a la página.
    rol: "MODERATOR",
  },
  {
    href: "/panel/monedero",
    label: "Monedero y retiradas",
    descripcion: "Revisar y aprobar las retiradas de dinero y auditar el ledger del monedero.",
    fase: 7,
    rol: "ADMIN",
  },
  {
    href: "/panel/boost",
    label: "Boost",
    descripcion: "Gestionar las apariciones destacadas de perfiles y sus créditos.",
    fase: 6,
    rol: "ADMIN",
  },
  {
    href: "/panel/ranking",
    label: "DareUp y ranking",
    descripcion:
      "Ver el ranking del mes, inspeccionar los puntos de un usuario y ajustarlos con un motivo.",
    fase: null,
    rol: "ADMIN",
  },
  {
    href: "/panel/notificaciones",
    label: "Notificaciones",
    descripcion:
      "Enviar anuncios a los usuarios, seguir su reparto e inspeccionar las notificaciones emitidas.",
    fase: null,
    rol: "ADMIN",
  },
];

/**
 * ¿La sección `href` está activa para la ruta `pathname`? `/panel` es EXACTA (si no, se encendería en
 * todas las subrutas); las demás encienden en su ruta y sus subrutas (prefijo con "/").
 */
export function seccionActiva(href: string, pathname: string): boolean {
  if (href === "/panel") return pathname === "/panel";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Busca una sección por su ruta (fuente única para el placeholder de cada página). */
export function seccionPorHref(href: string): SeccionPanel | undefined {
  return SECCIONES_PANEL.find((s) => s.href === href);
}

/**
 * La sección a la que pertenece una RUTA del panel (ella misma o una subruta suya): `/panel/retos/x`
 * es Retos. `undefined` si no cuelga de ninguna, que es un caso que hay que tratar como error y no
 * como "sin restricción" — ver `rolDeRuta`.
 */
export function seccionParaRuta(pathname: string): SeccionPanel | undefined {
  return SECCIONES_PANEL.find((s) => seccionActiva(s.href, pathname));
}

/**
 * Rol mínimo que exige una ruta del panel. Si la ruta no pertenece a ninguna sección, REVIENTA: una
 * página del panel sin sección es una página sin guard, y eso no puede resolverse "dejando pasar".
 * Fallar aquí lo convierte en un error ruidoso en el primer render, no en una puerta abierta.
 */
export function rolDeRuta(pathname: string): RolSeccion {
  const s = seccionParaRuta(pathname);
  if (!s) throw new Error(`Ruta del panel sin sección declarada: ${pathname}`);
  return s.rol;
}

/** Las secciones que alcanza un rol de sesión: lo que la nav debe enseñar, y nada más. */
export function seccionesPara(rolSesion: string): SeccionPanel[] {
  return SECCIONES_PANEL.filter((s) => alcanzaRol(rolSesion, s.rol));
}

/**
 * A dónde mandar a quien entra al panel. El Resumen es del administrador, así que un moderador que
 * escribe `/panel` no puede toparse con un 403 en su propia herramienta: aterriza en la primera
 * sección que su rol alcanza. `null` = no alcanza ninguna (no debería entrar al panel siquiera).
 */
export function primeraSeccionPara(rolSesion: string): string | null {
  return seccionesPara(rolSesion)[0]?.href ?? null;
}
