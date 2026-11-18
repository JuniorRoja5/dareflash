/**
 * LA MARCA, EN UN SOLO SITIO (Fase 11 · PM1).
 *
 * Todo texto que nombra el producto —títulos de página, asuntos y cuerpos de correo, avisos de
 * operación, el logo— sale de aquí. Pequeño, sin `env` y sin dependencias a propósito: lo importan
 * componentes de cliente y layouts que se prerenderizan, así que no puede arrastrar nada.
 *
 * EL DOMINIO NO ESTÁ AQUÍ, y es una decisión: ya sale de una sola fuente, la configuración
 * (`APP_URL`, `EMAIL_FROM` y la dirección del admin). Una constante de dominio en el código sería una
 * segunda fuente libre de discrepar de esa en local, en CI o en un entorno de pruebas. Cambiar de
 * dominio es cambiar variables de entorno.
 *
 * `tests/marca-un-sitio.test.ts` falla si la marca aparece escrita a mano en el código de `src/`
 * fuera de este fichero y de las excepciones declaradas allí (ficheros que no pueden importar nada:
 * el favicon, la familia de fuente de `globals.css`…). `tests/render/marca-cambiada.test.tsx` la
 * cambia por otra y comprueba que el título, el correo y el logo la siguen, y que la vieja sigue
 * vetada.
 */
export const MARCA = "DareFlash";

/**
 * LOS NOMBRES QUE TUVO EL PRODUCTO. Hoy ninguno. Cuando la marca cambie, el nombre de ahora pasa aquí
 * —y no se borra—, porque los vetos tienen que seguir valiendo para él: sin esto, alguien podría
 * registrar `@dareflash` y hacerse pasar por la plataforma, o usar «dareflash» como contraseña, al día
 * siguiente de renombrarla.
 */
export const MARCAS_ANTERIORES: readonly string[] = [];

/**
 * Lo que nadie puede usar como @usuario ni dentro de su contraseña: la marca de ahora y TODAS las de
 * antes, en minúsculas (los handles se guardan y comparan en minúsculas, y el veto de contraseñas
 * también). Función y no solo el valor para que el test que cambia la marca recalcule con ESTA regla.
 */
export function marcasVetadas(marca: string, anteriores: readonly string[]): readonly string[] {
  return [marca, ...anteriores].map((m) => m.toLowerCase());
}
export const MARCAS_VETADAS = marcasVetadas(MARCA, MARCAS_ANTERIORES);

/**
 * EL TÍTULO DE LAS PÁGINAS, para el layout raíz: cada página pone solo su sección («Retos») y la
 * plantilla añade la marca. `default` es el de las rutas que no ponen ninguno (Next lo exige junto a
 * `template`).
 */
export function tituloRaiz(marca: string): { default: string; template: string } {
  return { default: marca, template: `%s · ${marca}` };
}
export const TITULO_RAIZ = tituloRaiz(MARCA);
