import { BuscadorBarra } from "./buscador-barra";
import { CampanaNotificaciones } from "./campana-notificaciones";
import { CtaCrear } from "./cta-crear";
import { MenuCuenta } from "./menu-cuenta";

/**
 * BARRA SUPERIOR del shell de escritorio (solo >= lg; en movil no hay barra superior). Buscador +
 * CTA principal + campana de avisos + menu de cuenta. Cero sombras; filete inferior; geometria severa.
 *
 * El CTA principal (`CtaCrear`, por ROL: ver `ctaPrincipal`) es el magenta persistente del shell (cromo,
 * como el [+] de la nav), salvo en /inicio, donde se atenua a secundario para no competir con el magenta
 * de contenido del hero de la portada. Reusa el lenguaje del boton; no es un primitivo nuevo.
 *
 * La CAMPANA es real y SOLO con sesion: su numero sale del contador compartido de avisos (ver
 * `avisos-contexto`), que se refresca solo. Antes era una maqueta con un "3" fijo que se ensenaba
 * tambien al invitado; un invitado no tiene avisos, asi que no ve campana.
 */
export function BarraSuperior({
  usuario,
  rol,
}: {
  /** Usuario de la sesión (nombre + avatar reales). `null` = invitado -> silueta genérica. */
  usuario: { nombre: string; imagen: string | null } | null;
  /** Rol de la sesión (`null` = invitado). Decide el CTA principal: ver `ctaPrincipal`. */
  rol: string | null;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-surface px-8 py-3">
      {/* Buscador con desplegable de sugerencias (isla cliente). Conserva el <form action="/buscar">
          dentro, así el Enter sigue navegando a /buscar sin JS (mejora progresiva). */}
      <BuscadorBarra />

      <div className="ml-auto flex items-center gap-3">
        {/* CTA principal por rol — magenta persistente (atenuado a secundario en /inicio) */}
        <CtaCrear rol={rol} />

        {/* Campana de avisos: solo con sesión. Su número lo lleva el contador compartido. */}
        {usuario ? <CampanaNotificaciones /> : null}

        {/* Menú de cuenta (avatar + chevron -> desplegable real con "Cerrar sesión") */}
        <MenuCuenta usuario={usuario} />
      </div>
    </header>
  );
}
