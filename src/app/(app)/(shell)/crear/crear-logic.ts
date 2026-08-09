/**
 * CREAR · logica PURA de validacion (Paso C · unidad 5). Maqueta, sin backend: la validacion es de
 * cliente. Extraida para atarla con dientes.
 */

/** Un titulo es valido si tiene contenido real (no vacio ni solo espacios). */
export function tituloEsValido(titulo: string): boolean {
  return titulo.trim().length > 0;
}
