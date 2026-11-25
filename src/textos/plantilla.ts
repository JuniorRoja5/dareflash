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
 * │ · Una frase es UNA clave. Un formato en medio va DENTRO: «El {resaltado:mayor premio} en…», y   │
 * │   se pinta con `tRico` (rico.tsx). Las marcas son un catálogo cerrado (`PropsDeMarca`, abajo).   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import type { MouseEvent } from "react";

import { MARCA } from "@/config/marca";
import { formaDePlural, formatearNumero, type Idioma } from "@/lib/formato";

/** Un plural: la forma de «uno» y la de «el resto». Bastan para es/en/de. */
export type Plural = { readonly one: string; readonly other: string };
export type Texto = string | Plural;
export type Espacio = { readonly [clave: string]: Texto };
export type Fuente = { readonly __idioma: string } & {
  readonly [espacio: string]: Espacio | string;
};

/** ¿`S` es un nombre (de parámetro o de marca)? Sin llaves, sin `:` y sin espacios. */
type EsNombre<S extends string> = S extends "" | `${string}${"{" | "}" | ":" | " "}${string}`
  ? false
  : true;

/**
 * Los nombres de `{param}` de una plantilla, como unión de literales. Se avanza de llave en llave: así
 * `{resaltado:mayor premio}` no cuenta como parámetro (lleva `:`), pero un `{n}` DENTRO de una marca sí.
 */
type NombresDe<S extends string> = S extends `${string}{${infer R}`
  ? | (R extends `${infer P}}${string}` ? (EsNombre<P> extends true ? P : never) : never)
    | NombresDe<R>
  : never;

/**
 * LAS MARCAS DE FORMATO, catálogo CERRADO (`tRico`, src/textos/rico.tsx). Una frase es UNA clave; si
 * lleva un formato en medio, va DENTRO de la plantilla: «El {resaltado:mayor premio} en juego ahora
 * mismo». Al traducir, la marca viaja con sus palabras, estén donde estén en la frase de ese idioma.
 *  - `resaltado`: un `<span>` con la clase que diga quien lo pinta (las palabras que pesan de la frase);
 *  - `enlace`: un enlace interno (`Enlace`), con el destino y la clase que diga quien lo pinta (y, si
 *    hace falta, su `onClick`: el de la casilla de consentimiento corta el clic para no marcarla);
 *  - `oculto`: un `<span class="sr-only">` (lo que solo oye un lector de pantalla);
 *  - `salto`: un `<br>`, VACÍA (`{salto:}`): el corte de línea de un titular, que en otro idioma va en
 *    otro sitio (P5b2a, el titular de /destacados). Solo en titulares: en un párrafo corta el texto.
 * El diccionario solo NOMBRA la marca: la etiqueta, la clase y el destino los pone el código. Nunca HTML.
 */
export type PropsDeMarca = {
  resaltado: { className: string };
  enlace: {
    href: string;
    className?: string;
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  };
  oculto: Record<string, never>;
  salto: Record<string, never>;
};
export type MarcaRica = keyof PropsDeMarca;

/** Los nombres de `{marca:…}` de una plantilla (conocidos o no: lo desconocido lo vetan los tipos de abajo). */
export type MarcasDe<S extends string> = S extends `${string}{${infer R}`
  ? | (R extends `${infer M}:${string}` ? (EsNombre<M> extends true ? M : never) : never)
    | MarcasDe<R>
  : never;

/** Las marcas de un texto (de las dos formas, si es un plural). */
type MarcasDeTexto<T> = T extends Plural
  ? MarcasDe<T["one"]> | MarcasDe<T["other"]>
  : T extends string
    ? MarcasDe<T>
    : never;

/** Las claves de un espacio SIN formato (las de `t`) y CON formato (las de `tRico`). */
export type ClavesPlanas<E> = {
  [K in keyof E]: [MarcasDeTexto<E[K]>] extends [never] ? K : never;
}[keyof E];
export type ClavesRicas<E> = Exclude<keyof E, ClavesPlanas<E>>;

/**
 * Lo que hay que pasarle a `tRico` por cada marca de la plantilla. Una marca FUERA del catálogo pide
 * `never`: no hay valor que la cumpla, así que la llamada no compila.
 */
export type MarcasPara<T> = {
  [M in MarcasDeTexto<T>]: M extends MarcaRica ? PropsDeMarca[M] : never;
};

/**
 * Un diccionario cuyas plantillas solo usan marcas del catálogo. `es.ts` se comprueba con esto: una
 * marca desconocida no compila AUNQUE nadie la pinte todavía.
 */
export type ConMarcasConocidas<F> = {
  readonly [E in keyof F]: E extends "__idioma"
    ? F[E]
    : {
        readonly [K in keyof F[E]]: Exclude<MarcasDeTexto<F[E][K]>, MarcaRica> extends never
          ? F[E][K]
          : `marca desconocida: ${Exclude<MarcasDeTexto<F[E][K]>, MarcaRica> & string}`;
      };
};
export function conMarcasConocidas<F extends ConMarcasConocidas<F>>(f: F): F {
  return f;
}

/** Lo que hay que pasarle a `t` para un texto: sus parámetros (sin `marca`, que la pone `t`). */
export type Parametros<T> = T extends Plural
  ? { n: number } & {
      [K in Exclude<NombresDe<T["one"]> | NombresDe<T["other"]>, "n" | "marca">]: string;
    }
  : T extends string
    ? { [K in Exclude<NombresDe<T>, "marca">]: K extends "n" ? number : string }
    : never;

/** ¿Hace falta el segundo argumento? Solo si la plantilla tiene parámetros (o es un plural). */
export type Args<T> = keyof Parametros<T> extends never ? [] : [Parametros<T>];

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

/**
 * La función de un espacio de claves: `t("clave", { … })`. Solo las claves SIN formato: una con marcas
 * devolvería las llaves tal cual («El {resaltado:mayor premio}…»), así que pasarla a `t` no compila.
 */
export type FuncionT<E extends Espacio> = <K extends ClavesPlanas<E> & string>(
  clave: K,
  ...args: Args<E[K]>
) => string;

function rellenar(plantilla: string, valores: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (entera, nombre: string) =>
    nombre in valores ? valores[nombre]! : entera,
  );
}

/**
 * Los valores con los que se rellena una plantilla: `{marca}` desde `MARCA` y cada número formateado con
 * la P1. Lo comparten `t` y `tRico`, para que los dos digan lo mismo.
 */
export function valoresDe(
  parametros: Record<string, string | number> | undefined,
  idioma: Idioma,
): Record<string, string> {
  const valores: Record<string, string> = { marca: MARCA };
  for (const [k, v] of Object.entries(parametros ?? {})) {
    valores[k] = typeof v === "number" ? formatearNumero(v, idioma) : v;
  }
  return valores;
}

/** La plantilla que toca: la del texto, o la forma del plural que pide `n` en ese idioma. */
export function plantillaDe(
  texto: Texto,
  parametros: Record<string, string | number> | undefined,
  idioma: Idioma,
): string {
  if (typeof texto === "string") return texto;
  return texto[formaDePlural(Number(parametros?.n ?? 0), idioma)];
}

/**
 * `t` para un espacio de claves en un idioma. `idioma` es el de FORMATEAR (plurales y números); el
 * espacio ya viene en el idioma que toca (lo elige quien lo carga).
 */
export function crearT<E extends Espacio>(espacio: E, idioma: Idioma): FuncionT<E> {
  return ((clave: string, parametros?: Record<string, string | number>) => {
    const texto = espacio[clave];
    if (texto === undefined) return clave; // no compila; si llega aquí, que se vea
    return rellenar(plantillaDe(texto, parametros, idioma), valoresDe(parametros, idioma));
  }) as FuncionT<E>;
}
