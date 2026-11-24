/**
 * EL NOMBRE DE UNA CATEGORÍA EN EL IDIOMA DE LA PÁGINA (Fase 11 · P5b1). La clave viene de la base de
 * datos como texto (`Challenge.category`): si es del catálogo, su nombre sale de los textos
 * (`categorias.cat_<clave>`); si no —una categoría retirada, un dato raro—, se devuelve la clave tal cual,
 * como hacía `nombreCategoria`. Pura y sin diccionarios: recibe la `t` del espacio `categorias`.
 */
import { CATEGORIES } from "@/config/constants";

import type { FuncionT } from "./plantilla";
import type { Textos } from "./servidor";

export function nombreDeCategoria(
  t: FuncionT<Textos["categorias"]>,
  clave: string | null | undefined,
): string | null {
  if (!clave) return null;
  const c = CATEGORIES.find((x) => x.key === clave);
  return c ? t(`cat_${c.key}`) : clave;
}
