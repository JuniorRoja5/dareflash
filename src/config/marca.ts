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
export const MARCA = "RevolFlash";

/**
 * LOS NOMBRES QUE TUVO EL PRODUCTO. Cuando la marca cambia, el nombre de antes pasa aquí —y no se
 * borra—, porque los vetos tienen que seguir valiendo para él: sin esto, alguien podría registrar el
 * @usuario del nombre viejo y hacerse pasar por la plataforma, o usarlo como contraseña, al día
 * siguiente de renombrarla. NO es texto visible: esta lista es la ÚNICA aparición del nombre viejo en
 * `src/`, y está para vetarlo (Fase 11 · PM2). `tests/marca-un-sitio.test.ts` lo vigila.
 */
export const MARCAS_ANTERIORES: readonly string[] = ["DareFlash"];

/**
 * LA FORMA COMPARABLE de un nombre: minúsculas y sin separadores (espacio, punto, guion bajo, guion).
 *
 * ┌─ POR QUÉ SIN SEPARADORES ─────────────────────────────────────────────────────────────────────┐
 * │ Un @usuario admite `.` y `_` (`HANDLE_RE`), así que comparar la marca TAL CUAL dejaba libres   │
 * │ `revol.flash`, `revol_flash` o `revolflash_oficial`: suplantación de la plataforma con un punto.│
 * │ Y una marca con espacio («Revol Flash») daría «revol flash», que ningún handle puede igualar:  │
 * │ `revolflash` quedaría libre. Normalizando los DOS lados, todo eso es la misma palabra.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function normalizarNombre(texto: string): string {
  return texto.toLowerCase().replace(/[\s._-]+/g, "");
}

/**
 * Lo que nadie puede usar como @usuario ni dentro de su contraseña: la marca de ahora y TODAS las de
 * antes, YA NORMALIZADAS. Función y no solo el valor para que el test que cambia la marca recalcule
 * con ESTA regla.
 */
export function marcasVetadas(marca: string, anteriores: readonly string[]): readonly string[] {
  return [marca, ...anteriores].map(normalizarNombre);
}
export const MARCAS_VETADAS = marcasVetadas(MARCA, MARCAS_ANTERIORES);

/**
 * ¿Lleva `texto` DENTRO alguna marca vetada, una vez normalizados los dos lados? Por CONTENCIÓN, no
 * por igualdad: `revolflash_oficial` o `xrevolflashx` también suplantan.
 *
 * `vetadas` se pasa SIEMPRE (sin valor por defecto): quien llama pasa el `MARCAS_VETADAS` que importa,
 * y así el test que sustituye este módulo por una marca de prueba mide la regla con SU lista. Con un
 * valor por defecto, la función seguiría leyendo la lista real aunque el módulo estuviera sustituido.
 */
export function contieneMarcaVetada(texto: string, vetadas: readonly string[]): boolean {
  const t = normalizarNombre(texto);
  return vetadas.some((m) => m.length > 0 && t.includes(m));
}

/**
 * EL TÍTULO DE LAS PÁGINAS, para el layout raíz: cada página pone solo su sección («Retos») y la
 * plantilla añade la marca. `default` es el de las rutas que no ponen ninguno (Next lo exige junto a
 * `template`).
 */
export function tituloRaiz(marca: string): { default: string; template: string } {
  return { default: marca, template: `%s · ${marca}` };
}
export const TITULO_RAIZ = tituloRaiz(MARCA);
