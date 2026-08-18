import { CtaCrear } from "./cta-crear";
import { MenuCuenta } from "./menu-cuenta";

/** Iconos inline (trazo 1.6 px, currentColor), misma familia severa. */
function IconoLupa() {
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
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

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
      {/* Buscador: form GET a /buscar (cero JS). Al enviar (Enter) navega a /buscar?q=... y allí la isla
          de búsqueda arranca con esa consulta. */}
      <form action="/buscar" role="search" className="relative w-full max-w-md">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim">
          <IconoLupa />
        </span>
        <input
          type="search"
          name="q"
          placeholder="Buscar retos, personas…"
          aria-label="Buscar"
          className="min-h-[44px] w-full rounded-full border border-line bg-raised pr-4 pl-11 text-sm text-text placeholder:text-text-dim focus:border-text focus:outline-none"
        />
      </form>

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
