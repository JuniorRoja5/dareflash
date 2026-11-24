/**
 * LA TRADUCCIÓN PROPIA (Fase 11 · P5b1) — la parte PURA: tipos y la función `t`. Sin diccionarios (esos
 * viven en `src/textos/<idioma>.ts`, solo para el servidor) y sin React: la usan el servidor y el
 * cliente por igual.
 *
 * ┌─ LAS REGLAS ─────────────────────────────────────────────────────────────────────────────────────┐
 * │ · Un texto es una PLANTILLA: «Hola, {nombre}». Sus parámetros salen del TIPO de la plantilla:    │
 * │   `t("saludo", { nombre })` es obligatorio y se comprueba al compilar (falta uno → no compila).  │
 * │ · Los valores son TEXTO, salvo `{n}`: un número. Ningún número se pasa a pelo en otro parámetro:  │
 * │   se formatea antes con la P1 (`formatearNumero`); el `{n}` lo formatea `t` con esa misma función.│
 * │ · Un PLURAL es `{ one, other }` y lo elige `formaDePlural` (lib/formato) por `n`. El `{n}`     │
 * │   de la plantilla lo formatea `t` con ese mismo formateador; nadie lo escribe a mano.           │
 * │ · `{marca}` lo pone `t` desde `MARCA` (config/marca): no se pasa ni se escribe.                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { MARCA } from "@/config/marca";
import { formaDePlural, formatearNumero, type Idioma } from "@/lib/formato";

/** Un plural: la forma de «uno» y la de «el resto». Bastan para es/en/de. */
export type Plural = { readonly one: string; readonly other: string };
export type Texto = string | Plural;
export type Espacio = { readonly [clave: string]: Texto };
export type Fuente = { readonly __idioma: string } & {
  readonly [espacio: string]: Espacio | string;
};

/** Los nombres de `{param}` de una plantilla, como unión de literales. */
type NombresDe<S extends string> = S extends `${string}{${infer P}}${infer R}`
  ? P | NombresDe<R>
  : never;

/** Lo que hay que pasarle a `t` para un texto: sus parámetros (sin `marca`, que la pone `t`). */
export type Parametros<T> = T extends Plural
  ? { n: number } & {
      [K in Exclude<NombresDe<T["one"]> | NombresDe<T["other"]>, "n" | "marca">]: string;
    }
  : T extends string
    ? { [K in Exclude<NombresDe<T>, "marca">]: K extends "n" ? number : string }
    : never;

/** ¿Hace falta el segundo argumento? Solo si la plantilla tiene parámetros (o es un plural). */
type Args<T> = keyof Parametros<T> extends never ? [] : [Parametros<T>];

/**
 * LA FORMA que tiene que cumplir un diccionario de otro idioma: las MISMAS claves que el castellano,
 * cada una con texto (un plural, con sus dos formas). Con `satisfies Diccionario<typeof es>`, una clave
 * que falta o que sobra no compila.
 */
export type Diccionario<F> = {
  readonly [E in keyof F]: E extends "__idioma"
    ? string
    : F[E] extends Espacio
      ? { readonly [K in keyof F[E]]: F[E][K] extends Plural ? Plural : string }
      : never;
};

/** La función de un espacio de claves: `t("clave", { … })`. */
export type FuncionT<E extends Espacio> = <K extends keyof E & string>(
  clave: K,
  ...args: Args<E[K]>
) => string;

function rellenar(plantilla: string, valores: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (entera, nombre: string) =>
    nombre in valores ? valores[nombre]! : entera,
  );
}

/**
 * `t` para un espacio de claves en un idioma. `idioma` es el de FORMATEAR (plurales y números); el
 * espacio ya viene en el idioma que toca (lo elige quien lo carga).
 */
export function crearT<E extends Espacio>(espacio: E, idioma: Idioma): FuncionT<E> {
  return ((clave: string, parametros?: Record<string, string | number>) => {
    const texto = espacio[clave];
    if (texto === undefined) return clave; // no compila; si llega aquí, que se vea
    const valores: Record<string, string> = { marca: MARCA };
    for (const [k, v] of Object.entries(parametros ?? {})) {
      valores[k] = typeof v === "number" ? formatearNumero(v, idioma) : v;
    }
    if (typeof texto === "string") return rellenar(texto, valores);
    const n = Number(parametros?.n ?? 0);
    return rellenar(texto[formaDePlural(n, idioma)], valores);
  }) as FuncionT<E>;
}
