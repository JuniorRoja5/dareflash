/**
 * Lógica PURA de "Participar" (testeable, sin React). La URL canónica del reto y el destino de login
 * para un invitado: tras entrar, vuelve al reto (`?siguiente=` con la ruta canónica ya codificada).
 */

/** Ruta canónica del reto: `/retos/{publicCode}-{slug}`. */
export function rutaCanonicaReto(publicCode: string, slug: string): string {
  return `/retos/${publicCode}-${slug}`;
}

/** Destino de login para un invitado que quiere participar: vuelve al reto tras entrar. */
export function enlaceEntrarParaParticipar(publicCode: string, slug: string): string {
  return `/entrar?siguiente=${encodeURIComponent(rutaCanonicaReto(publicCode, slug))}`;
}
