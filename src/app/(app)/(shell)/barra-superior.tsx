import { BuscadorBarra } from "./buscador-barra";
import { CtaCrear } from "./cta-crear";
import { MenuCuenta } from "./menu-cuenta";

/** Iconos inline (trazo 1.6 px, currentColor), misma familia severa. */
function IconoCampana() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 14 18 8z" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </svg>
  );
}

/**
 * BARRA SUPERIOR del shell de escritorio (solo >= lg; en movil no hay barra superior). Buscador +
 * boton "Crear reto" + notificaciones + avatar. Es MAQUETA: el buscador y las notificaciones son
 * presentacionales (sin backend), claramente falsos. Cero sombras; filete inferior; geometria severa.
 *
 * "Crear reto" (CtaCrear) es el magenta persistente del shell (cromo, como el [+] de la nav), salvo
 * en /inicio, donde se atenua a secundario para no competir con el magenta de contenido del hero de
 * la portada. Reusa el lenguaje del boton para un CTA de navegacion; no es un primitivo nuevo.
 */
export function BarraSuperior({
  usuario,
}: {
  /** Usuario de la sesión (nombre + avatar reales). `null` = invitado -> avatar neutro. */
  usuario: { nombre: string; imagen: string | null } | null;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-surface px-8 py-3">
      {/* Buscador con desplegable de sugerencias (isla cliente). Conserva el <form action="/buscar">
          dentro, así el Enter sigue navegando a /buscar sin JS (mejora progresiva). */}
      <BuscadorBarra />

      <div className="ml-auto flex items-center gap-3">
        {/* Crear reto — magenta persistente (atenuado a secundario en /inicio) */}
        <CtaCrear />

        {/* Notificaciones (maqueta: badge fijo, NEUTRO — el magenta es solo Crear) */}
        <button
          type="button"
          aria-label="Notificaciones (3 sin leer)"
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-text-dim transition-colors duration-150 ease-mechanical hover:bg-raised hover:text-text"
        >
          <IconoCampana />
          <span className="absolute top-2 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-text-dim px-1 text-2xs font-semibold tabular-nums text-void">
            3
          </span>
        </button>

        {/* Menú de cuenta (avatar + chevron -> desplegable real con "Cerrar sesión") */}
        <MenuCuenta usuario={usuario} />
      </div>
    </header>
  );
}
