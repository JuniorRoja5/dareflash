/**
 * CTA PRINCIPAL del shell — el de la barra superior (`CtaCrear`) y el del hero de /inicio. Fuente
 * ÚNICA de su TEXTO y su DESTINO, por ROL. El copy final lo confirma Junior: se cambia AQUÍ y solo aquí.
 *
 * POR QUÉ POR ROL. Los dos CTA decían "Crear reto" a todo el mundo y llevaban a /crear, que es "Subir
 * tu vídeo": el botón mentía sobre su destino. Crear un reto de verdad es cosa del ADMIN, en el panel
 * (/panel/retos, protegido por `requireRole("ADMIN")`). Así que:
 *   - ADMIN -> "Crear reto", al panel;
 *   - el resto (usuario, moderador e invitado) -> su acción real, "Subir vídeo", a /crear. Al invitado
 *     el proxy lo sigue mandando a /entrar?siguiente=/crear.
 *
 * Pura y cliente-segura: la usan un componente de cliente (la barra) y un Server Component (el hero).
 */
export interface CtaPrincipal {
  readonly texto: string;
  readonly href: string;
}

export const CTA_ADMIN: CtaPrincipal = { texto: "Crear reto", href: "/panel/retos" };
export const CTA_USUARIO: CtaPrincipal = { texto: "Subir vídeo", href: "/crear" };

/** `rol` = el de la sesión, o `null` para un invitado. Solo el ADMIN crea retos. */
export function ctaPrincipal(rol: string | null): CtaPrincipal {
  return rol === "ADMIN" ? CTA_ADMIN : CTA_USUARIO;
}
