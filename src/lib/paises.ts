/**
 * PAÍSES — puro, y sin una lista de nombres que mantener.
 *
 * Guardamos el CÓDIGO (ISO 3166-1 alpha-2) y el nombre lo pone `Intl.DisplayNames`, que viene en
 * la plataforma y habla todos los idiomas. La alternativa —250 nombres escritos a mano en
 * `constants`— envejece en dos sitios a la vez: cuando un país se renombra y cuando la app hable
 * otro idioma. Aquí no hay nada que traducir.
 *
 * `of()` lanza con un código mal formado, así que todo va envuelto: un país raro en la base de
 * datos tiene que pintarse como su código, nunca reventar la pantalla que lo enseña.
 */
import { PAISES_ISO, type PaisIso } from "@/config/constants";

const VALIDOS: ReadonlySet<string> = new Set(PAISES_ISO);

/** ¿Es un código de país asignado? Mayúsculas o minúsculas dan lo mismo. */
export function esPaisIso(valor: string): valor is PaisIso {
  return VALIDOS.has(valor.trim().toUpperCase());
}

/** El nombre del país en `idioma`, o su propio código si no se sabe decir. */
export function nombrePais(iso: string, idioma = "es"): string {
  const codigo = iso.trim().toUpperCase();
  try {
    return new Intl.DisplayNames([idioma], { type: "region" }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

export interface PaisParaElegir {
  iso: PaisIso;
  nombre: string;
}

/**
 * Los países para un `<select>`, ORDENADOS POR SU NOMBRE en el idioma de quien mira —con
 * `localeCompare`, que es quien sabe que la Ñ va después de la N—. Ordenar por código pondría
 * «AD, AE, AF…» y obligaría a leerse la lista entera para encontrar España.
 */
export function paisesParaElegir(idioma = "es"): PaisParaElegir[] {
  return PAISES_ISO.map((iso) => ({ iso, nombre: nombrePais(iso, idioma) })).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, idioma),
  );
}
