/**
 * QUÉ ESPACIOS DE TEXTOS RECIBE CADA PARTE DE LA PÁGINA EN EL CLIENTE (Fase 11 · P5b1).
 *
 * Un componente de servidor pinta su texto y no manda nada. Un componente de CLIENTE necesita sus
 * textos en el navegador, y le llegan como props del proveedor (`TextosProvider`): SOLO los espacios
 * que esa parte usa y SOLO del idioma de la página. Aquí se dice cuáles, en un sitio, para que «qué
 * viaja al navegador» se pueda leer de una vez. Un espacio de servidor (los de la portada, por ejemplo)
 * NO debe estar en ninguna de estas listas: no hace falta allí.
 */
import type { NombreEspacio } from "./servidor";

/**
 * Las islas de cliente del ARMAZÓN —barra, buscador, campana, menú de cuenta, nav y tema— y las
 * PRIMITIVAS de cliente que salen en muchas pantallas de la app (votar, me gusta, denunciar, compartir,
 * el reproductor y su modal, la imagen de un anuncio). Van juntas en el layout `(app)` porque esas
 * primitivas aparecen por todas partes y son pocas palabras; una página no tiene que acordarse de ellas.
 */
export const ESPACIOS_ARMAZON = [
  "buscador",
  "campana",
  "cuenta",
  "cta",
  "nav",
  "tema",
  "categorias",
  "voto",
  "like",
  "denunciar",
  "compartir",
  "reproductor",
  "modal",
  "anuncio",
  "marcas",
  "cuentaAtras",
  "errorPantalla",
  "copiar",
  "toque",
  "carga",
  "duracion",
] as const satisfies readonly NombreEspacio[];

/**
 * El panel no se traduce: sus islas de cliente reciben estos espacios SIEMPRE en castellano. `marcas`
 * y `cuentaAtras` porque el panel pinta avatares, nombres VIP y marcadores, y `carga` por sus pantallas
 * de carga (hojas de cliente que LANZAN si su espacio no llega).
 */
export const ESPACIOS_PANEL = [
  "reproductor",
  "modal",
  "marcas",
  "cuentaAtras",
  "carga",
] as const satisfies readonly NombreEspacio[];
