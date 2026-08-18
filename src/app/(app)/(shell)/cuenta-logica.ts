/**
 * Lógica PURA del menú de cuenta (P5). Decide QUÉ opciones muestra el desplegable según haya sesión o
 * no: aislada del componente para atarla con dientes (invertir el criterio —ofrecer "Cerrar sesión" a
 * un invitado, o "Entrar" a quien ya tiene sesión— cae en rojo). El componente solo mapea esta lista.
 */

/** Una entrada del menú. `logout` es una ACCIÓN (sin href); el resto son navegación. */
export type ItemCuenta = { id: "perfil" | "logout" | "entrar"; label: string; href?: string };

/**
 * Con sesión -> ver perfil + cerrar sesión; invitado -> entrar. "Cerrar sesión" SOLO aparece con
 * sesión (requisito de P5: la acción de logout no se ofrece a quien no la tiene).
 */
export function itemsMenuCuenta(haySesion: boolean): ItemCuenta[] {
  if (haySesion) {
    return [
      { id: "perfil", label: "Ver mi perfil", href: "/perfil" },
      { id: "logout", label: "Cerrar sesión" },
    ];
  }
  return [{ id: "entrar", label: "Entrar", href: "/entrar" }];
}
