/**
 * ¿Es este valor uno de los de un catálogo CERRADO? — sin zod (Fase 11 · P1b).
 *
 * Los catálogos viven en `config/constants.ts` como listas `VALORES_*`, y su `z.enum` en
 * `config/esquemas.ts`, que solo importa el servidor. El cliente y la lógica pura que el cliente
 * también carga (`lib/retirada`, `lib/empresa`, `lib/color-nombre`…) preguntan aquí, sobre la MISMA
 * lista: el mismo criterio que `z.enum(...).safeParse(v).success` —un texto que es exactamente uno
 * de los valores; ni otro tipo, ni otra capitalización, ni un prefijo—.
 */
export function esUnoDe<const T extends string>(valores: readonly T[], valor: unknown): valor is T {
  return typeof valor === "string" && (valores as readonly string[]).includes(valor);
}

/**
 * El valor ya tipado, o una excepción si no está en el catálogo: el equivalente de
 * `z.enum(...).parse(v)` para un `<select>` cuyas opciones salen de esa misma lista.
 */
export function unoDe<const T extends string>(valores: readonly T[], valor: unknown): T {
  if (!esUnoDe(valores, valor)) throw new Error(`Valor fuera del catálogo: ${String(valor)}`);
  return valor;
}
