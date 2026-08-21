import type { ComponentType, SVGProps } from "react";

/**
 * Iconos de la barra lateral del panel. SVG inline, `stroke: currentColor` (heredan el color del enlace,
 * activo o no), 20px, trazo 1.6. Uno por sección; se mapean por `href` en `ICONO_SECCION`. Decorativos
 * (`aria-hidden`): la etiqueta de texto va al lado y es la que anuncia la sección al lector de pantalla.
 */
type Icono = ComponentType<SVGProps<SVGSVGElement>>;

function Svg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const Resumen: Icono = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

const Retos: Icono = (p) => (
  <Svg {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Svg>
);

const Moderacion: Icono = (p) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
    <path d="m9.5 11.5 2 2 3.5-4" />
  </Svg>
);

const Usuarios: Icono = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 20a5.2 5.2 0 0 0-3-4.7" />
  </Svg>
);

const Monedero: Icono = (p) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14.5" r="1.2" />
  </Svg>
);

const Boost: Icono = (p) => (
  <Svg {...p}>
    <path d="M12 3c3 1.5 5 4.5 5 8.5 0 2-.7 3.8-1.8 5.2H8.8A8.4 8.4 0 0 1 7 11.5C7 7.5 9 4.5 12 3Z" />
    <circle cx="12" cy="10" r="1.5" />
    <path d="M9 18c-1 1-1.3 2.4-1.2 3.5C9 21.4 10.2 21 11 20M15 18c1 1 1.3 2.4 1.2 3.5C15 21.4 13.8 21 13 20" />
  </Svg>
);

const Ranking: Icono = (p) => (
  <Svg {...p}>
    <path d="M6 4h12v3a4 4 0 0 1-4 4h-4A4 4 0 0 1 6 7V4Z" />
    <path d="M6 5H3.5v1.5A2.5 2.5 0 0 0 6 9M18 5h2.5v1.5A2.5 2.5 0 0 1 18 9" />
    <path d="M12 11v4M8.5 20h7M10 20l.7-3h2.6l.7 3" />
  </Svg>
);

const Notificaciones: Icono = (p) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 0 1 12 0c0 4 1 5.5 2 6.5H4c1-1 2-2.5 2-6.5Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Svg>
);

/** Icono por `href` de sección. Fuente única para la barra lateral. */
export const ICONO_SECCION: Record<string, Icono> = {
  "/panel": Resumen,
  "/panel/retos": Retos,
  "/panel/moderacion": Moderacion,
  "/panel/usuarios": Usuarios,
  "/panel/monedero": Monedero,
  "/panel/boost": Boost,
  "/panel/ranking": Ranking,
  "/panel/notificaciones": Notificaciones,
};
