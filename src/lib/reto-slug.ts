/**
 * SLUG cosmético de un reto (SEO). La URL del reto será `/retos/{publicCode}-{slug}`: el `publicCode`
 * es la clave AUTORITATIVA (única, indexada) y el `slug` es decorativo. Por eso el slug NO es único y
 * si no cuadra con el del `publicCode`, el route de detalle hará 301 al canónico (trabajo POSTERIOR).
 *
 * PURA y cliente-segura. Normaliza: quita acentos (NFD), minúsculas, todo lo no [a-z0-9] -> "-",
 * colapsa y recorta guiones, y acota la longitud.
 */
export const SLUG_MAX = 80;

export function slugDesdeTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // quita diacríticos combinantes (á -> a)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // no-alfanumérico -> guion
    .replace(/^-+|-+$/g, "") // sin guiones en los extremos
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, ""); // por si el corte dejó un guion final
}
