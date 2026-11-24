/**
 * TEXTOS PARA LOS TESTS (Fase 11 · P5b1). Lo que en la app baja del servidor como DATOS a un componente
 * que se pinta en los dos lados (la tarjeta de un reto): aquí, el castellano directamente.
 */
import { es } from "../../src/textos/es";

/** Los espacios que recibe `TarjetaReto` (ver `ESPACIOS_TARJETA_RETO`). */
export const TEXTOS_TARJETA = {
  tarjetaReto: es.tarjetaReto,
  categorias: es.categorias,
  marcador: es.marcador,
} as const;
