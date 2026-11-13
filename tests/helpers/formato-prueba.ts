/**
 * EL IDIOMA Y LA ZONA DE LOS TESTS DE RENDER (Fase 11 · P1).
 *
 * En la app, `useFormato()` los recibe del `FormatoProvider` que monta el layout raíz. Un test de render
 * monta un componente suelto, sin layout, así que el `setup` de render dobla `useFormato` para que
 * devuelva ESTE objeto. Un test que quiera probar con una zona concreta (o sin ella) lo cambia y lo
 * deja como estaba en su `finally`/`afterEach`.
 *
 * Por defecto, castellano y SIN zona conocida: es el caso más exigente (la primera vista de alguien
 * nuevo), donde no puede salir ni una hora inventada.
 */
import type { Idioma, ZonaHoraria } from "../../src/lib/formato";

export const formatoDePrueba: { idioma: Idioma; zona: ZonaHoraria | null } = {
  idioma: "es",
  zona: null,
};
