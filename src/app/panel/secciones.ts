/**
 * Secciones del PANEL de admin (nav). FUENTE ÚNICA: la usan la barra de navegación y el Resumen. Cada
 * sección cuelga de `/panel` (por tanto del layout guardado: requireRole ADMIN + noindex heredados).
 * Retos es funcional (M5); el resto son placeholders de su fase futura.
 */
export interface SeccionPanel {
  href: string;
  label: string;
  /** Frase honesta de qué hará (para el Resumen y el placeholder). */
  descripcion: string;
  /** Fase futura que la implementará; `null` = ya funcional (Retos). */
  fase: number | null;
}

export const SECCIONES_PANEL: SeccionPanel[] = [
  {
    href: "/panel",
    label: "Resumen",
    descripcion: "Vista general del panel y accesos a cada sección.",
    fase: null,
  },
  {
    href: "/panel/retos",
    label: "Retos",
    descripcion: "Crear, publicar y listar retos con su premio, plazo, ganadores y reglas.",
    fase: null,
  },
  {
    href: "/panel/moderacion",
    label: "Moderación",
    descripcion: "Revisar denuncias de vídeos y retos y aplicar acciones de moderación.",
    fase: 5,
  },
  {
    href: "/panel/usuarios",
    label: "Usuarios",
    descripcion: "Buscar cuentas, ver su estado y gestionar roles, baneos y permisos.",
    fase: 5,
  },
  {
    href: "/panel/monedero",
    label: "Monedero y retiradas",
    descripcion: "Revisar y aprobar las retiradas de dinero y auditar el ledger del monedero.",
    fase: 7,
  },
  {
    href: "/panel/boost",
    label: "Boost",
    descripcion: "Gestionar las apariciones destacadas de perfiles y sus créditos.",
    fase: 6,
  },
  {
    href: "/panel/ranking",
    label: "DareUp y ranking",
    descripcion: "Ver y ajustar la puntuación de juego (DareUp) y el ranking mensual.",
    fase: 4,
  },
  {
    href: "/panel/notificaciones",
    label: "Notificaciones",
    descripcion: "Enviar y revisar las notificaciones a los usuarios.",
    fase: 4,
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
