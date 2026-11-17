/**
 * Tipos de `hls.js/light` (Fase 11 · P1c). El paquete publica el build light en su `exports` pero NO
 * le da tipos propios, y TypeScript lo trataría como `any`. El light es el mismo `Hls` sin
 * subtítulos, audio alternativo, DRM (EME), CMCD ni intersticiales: lo que usa el reproductor (la
 * clase, `isSupported`, `DefaultConfig.loader`, `Events.ERROR`, `loadSource`, `attachMedia`) existe
 * igual en los dos, así que se reutilizan los tipos del paquete.
 *
 * Solo tipos: un `.d.ts` no genera JS y no cambia lo que se descarga.
 */
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
