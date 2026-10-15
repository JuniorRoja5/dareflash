import { COLORES_NOMBRE_VIP, ColorNombreSchema, TOKEN_CSS } from "@/config/constants";

/**
 * EL COLOR DEL NOMBRE DE UN VIP — y la puerta que impide que un valor del usuario entre en el CSS.
 *
 * ┌─ POR QUÉ ESTO EXISTE AUNQUE EL COLOR SALGA DE UNA LISTA CERRADA ─────────────────────────────┐
 * │ Lo que el cliente manda es una CLAVE ("oro"), no un color, así que en teoría nada suyo llega │
 * │ nunca a una hoja de estilos. Esta función es la SEGUNDA capa, y existe porque la primera se  │
 * │ puede perder sin que nada falle: basta con que algún día alguien añada "color personalizado" │
 * │ y escriba `style={{ "--vip-name": loQueMandó }}`. Ahí, un valor como                          │
 * │ `e8f620;}</style><script>…` deja de ser un color y pasa a ser el cierre de la regla, el de   │
 * │ la etiqueta y lo que venga detrás.                                                            │
 * │                                                                                               │
 * │ La regla es: a un contexto CSS no entra NADA que no haya pasado por aquí. Y lo que pasa es la │
 * │ FORMA COMPLETA de un token, no "un valor limpiado": limpiar deja pasar la forma que no se     │
 * │ pensó, aceptar solo lo que encaja entero no.                                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Pura, sin React y sin servidor: la usan el guard del servidor y el componente, y se prueba sola.
 */

/**
 * La clave elegida -> la referencia CSS que la pinta (`var(--vip-nombre-oro)`). `null` si la clave
 * no es una de las nuestras, y `null` quiere decir "píntalo como un nombre normal", nunca "pon lo
 * que venga".
 *
 * Devuelve un `var(…)` y no un color porque el VALOR depende del tema: una misma opción del
 * catálogo es un tono vivo sobre negro y uno bastante más apagado sobre blanco, y quien sabe eso es
 * `globals.css`. Resolverlo aquí obligaría a saber en qué tema está la página, que es justo lo que
 * las variables de CSS existen para evitar.
 */
export function colorDeNombre(clave: string | null | undefined): string | null {
  const c = ColorNombreSchema.safeParse(clave);
  if (!c.success) return null;
  const token = COLORES_NOMBRE_VIP[c.data];
  // CINTURÓN Y TIRANTES: el catálogo es nuestro y sus valores son nombres de token, pero esto es lo
  // que acaba en una declaración CSS. Si alguien mete mañana un hex o un `rgb(...)` en el catálogo
  // —que "funcionaría"—, aquí se para: de esta función sale un `var(--algo)` o sale `null`.
  return esTokenSeguro(token) ? `var(${token})` : null;
}

/**
 * ¿Es esto un nombre de token y SOLO eso? La única puerta hacia un contexto CSS.
 *
 * No recorta, no normaliza y no arregla: una cadena con un espacio delante, con `;` detrás o con
 * cualquier cosa pegada NO es un token, y tratar de salvarla es exactamente cómo se cuela una carga.
 */
export function esTokenSeguro(valor: unknown): valor is string {
  return typeof valor === "string" && TOKEN_CSS.test(valor);
}

/**
 * El `style` del nombre, ya seguro. Devuelve `undefined` —o sea, ningún estilo— cuando no hay color
 * válido, que es lo que deja el nombre con su color de siempre.
 *
 * VA COMO VARIABLE CSS y no como `color:` directo: así el CSS decide qué hace con ella (el nombre,
 * su resplandor) y el valor vive en un solo sitio. Y nunca, jamás, como texto dentro de un
 * `<style>`: eso es el vector entero.
 */
export function estiloNombreVip(
  clave: string | null | undefined,
): Record<string, string> | undefined {
  const color = colorDeNombre(clave);
  return color ? { "--vip-name": color } : undefined;
}
