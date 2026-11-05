/**
 * CTA PRINCIPAL del shell — el de la barra superior (`CtaCrear`), el del hero de /inicio y el central
 * de la nav móvil. Fuente ÚNICA de su TEXTO y su DESTINO, por ROL y por TIPO DE CUENTA. El copy final
 * lo confirma Junior: se cambia AQUÍ y solo aquí.
 *
 * POR QUÉ POR ROL. Los dos CTA decían "Crear reto" a todo el mundo y llevaban a /crear, que es "Subir
 * tu vídeo": el botón mentía sobre su destino. Crear un reto de verdad es cosa del ADMIN, en el panel
 * (/panel/retos, protegido por `requireRole("ADMIN")`). Así que:
 *   - ADMIN -> "Crear reto", al panel;
 *   - una CUENTA DE EMPRESA -> "Mi empresa", a su portal (ver abajo);
 *   - el resto (usuario, moderador e invitado) -> su acción real, "Subir vídeo", a /crear. Al invitado
 *     el proxy lo sigue mandando a /entrar?siguiente=/crear.
 *
 * ┌─ LA EMPRESA, Y POR QUÉ NO LLEVA "+" ──────────────────────────────────────────────────────────┐
 * │ Antes una empresa veía "Subir vídeo", el único botón de acento de la pantalla, y al pulsarlo  │
 * │ el servidor le contestaba que las empresas no participan. Su acción de verdad será crear una   │
 * │ campaña, pero eso llega en otra pieza: hoy no hay nada que crear, y un "+" promete crear.     │
 * │ Por eso hoy su CTA es la puerta a su portal, sin "+" (`crea: false`). Cuando existan las      │
 * │ campañas, es ESTA línea la que pasa a "Crear campaña": los tres sitios cambian solos.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Pura y cliente-segura: la usan componentes de cliente (la barra, la nav) y un Server Component (el
 * hero).
 */
export interface CtaPrincipal {
  readonly texto: string;
  readonly href: string;
  /** ¿El destino CREA algo? Decide si el botón lleva "+": un "+" que no crea nada miente. */
  readonly crea: boolean;
}

export const CTA_ADMIN: CtaPrincipal = { texto: "Crear reto", href: "/panel/retos", crea: true };
export const CTA_USUARIO: CtaPrincipal = { texto: "Subir vídeo", href: "/crear", crea: true };
export const CTA_EMPRESA: CtaPrincipal = { texto: "Mi empresa", href: "/empresa", crea: false };

/**
 * `rol` = el de la sesión, o `null` para un invitado. `esCuentaEmpresa` = el de la sesión
 * (`SessionUser.esCuentaEmpresa`). La empresa va PRIMERO: su rol es USER, y por rol recibiría el CTA
 * del participante, que es justo lo que no puede hacer.
 */
export function ctaPrincipal(rol: string | null, esCuentaEmpresa = false): CtaPrincipal {
  if (esCuentaEmpresa) return CTA_EMPRESA;
  return rol === "ADMIN" ? CTA_ADMIN : CTA_USUARIO;
}
