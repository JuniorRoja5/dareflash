/**
 * ¿PUEDE ESTA PERSONA DENUNCIAR ESTO? La regla, pura y en un solo sitio.
 *
 * La usan LOS DOS LADOS: el botón, para no ofrecer lo que la API va a rechazar, y la ruta, que es
 * quien de verdad decide. Escrita dos veces acabaría diciendo cosas distintas —el botón invitando a
 * denunciar algo que el servidor rechaza, o escondiéndose donde sí se puede—, que es justo el tipo de
 * divergencia que aquí se nota como "la app miente".
 *
 * Las tres condiciones son HECHOS que el cliente también conoce (se los pasa el servidor al pintar):
 * si hay sesión, si ese correo está verificado y si el objeto es suyo. Ninguna es un secreto, así que
 * evaluarlas en cliente no filtra nada; la barrera real la aplica igualmente la ruta.
 */
export type VeredictoDenuncia =
  /** Adelante. */
  | "puede"
  /** Un invitado: primero entrar. */
  | "sin_sesion"
  /** Misma barrera antifraude que votar o comentar: el correo tiene que estar verificado. */
  | "sin_verificar"
  /** Lo tuyo no se denuncia: para eso están borrar (comentario) y retirar (vídeo). */
  | "propio";

export function veredictoDenuncia(quien: {
  haySesion: boolean;
  emailVerificado: boolean;
  /** ¿El objeto denunciado es de quien mira? */
  esMio: boolean;
}): VeredictoDenuncia {
  // El orden importa: "es tuyo" manda sobre lo demás, porque a un invitado nunca le sale como suyo y
  // a un dueño no tiene sentido pedirle que verifique el correo para denunciarse a sí mismo.
  if (quien.esMio) return "propio";
  if (!quien.haySesion) return "sin_sesion";
  if (!quien.emailVerificado) return "sin_verificar";
  return "puede";
}
