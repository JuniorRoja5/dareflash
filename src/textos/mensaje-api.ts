/**
 * UNA FRASE DE LA API COMO DATO (Fase 11 · P5b3) — solo tipos: lo importan los servicios sin arrastrar
 * ningún diccionario (`import type`).
 *
 * Un servicio no escribe frases: dice QUÉ pasó con una clave del espacio `api` y, si la frase lleva
 * huecos, sus valores YA como texto (las cifras se pasan tal cual se pintaban: el castellano no cambia).
 * La frase la compone quien responde, en su idioma (`frase` de `server/http/textos-api`).
 */
import type { es } from "./es";

type Api = (typeof es)["api"];
export type ClaveApi = keyof Api & string;

/** Los nombres de los huecos `{x}` de una plantilla. */
type Huecos<S> = S extends `${string}{${infer H}}${infer R}` ? H | Huecos<R> : never;

/** El dato: la clave, y sus parámetros SOLO si la frase los tiene (y entonces todos). */
export type MensajeApi = {
  [K in ClaveApi]: [Huecos<Api[K]>] extends [never]
    ? { clave: K; params?: undefined }
    : { clave: K; params: Record<Huecos<Api[K]>, string> };
}[ClaveApi];

/** Un `MensajeApi` escrito con su tipo comprobado (sin `as`). */
export const mensajeApi = <M extends MensajeApi>(m: M): M => m;
