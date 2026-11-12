/**
 * VALORES FALSOS PARA LOS TESTS, GENERADOS AL EJECUTARSE — nunca escritos.
 *
 * El repositorio es público y la regla es CERO alertas, también de escáneres externos (GitGuardian). Un
 * escáner no sabe que una contraseña escrita en un test, o un secreto con el prefijo de Stripe, es de
 * mentira: si tiene FORMA de credencial, lo marca. Marcarlo con «TEST-FIXTURE» tampoco basta (esa marca
 * solo la entendería nuestro gitleaks). Así que un test que necesita una contraseña, un secreto, un
 * token o una clave lo pide aquí, y en el código fuente no queda ningún literal que leer.
 *
 * DETERMINISTA a propósito: el valor sale de la ETIQUETA (SHA-256 de ella). La misma etiqueta da siempre
 * el mismo valor —en el mismo fichero, entre un `vi.mock` y el cuerpo del test, o entre dos procesos—, que
 * es lo que necesita un test que registra con una contraseña y luego entra con ella, o que firma con un
 * secreto y verifica con el mismo. Etiquetas distintas dan valores distintos.
 *
 * PREFIJOS DE PROVEEDORES (`whsec_`, `sk_test_`, …): prohibidos en los tests. El SDK de Stripe acepta
 * cualquier cadena como clave o secreto de firma, y nuestro código no mira el prefijo, así que ningún
 * test lo necesita. Si alguno llegara a necesitarlo, se construye AQUÍ por concatenación, con un
 * comentario que diga por qué.
 */
import { createHash } from "node:crypto";

/**
 * Un valor falso de `longitud` caracteres (base64url: letras, dígitos, `-` y `_`), derivado de
 * `etiqueta`. Sirve de secreto HMAC, clave de API, token o hash de relleno.
 */
export function falso(etiqueta: string, longitud = 40): string {
  let valor = "";
  for (let i = 0; valor.length < longitud; i++) {
    valor += createHash("sha256")
      .update(`dareflash/valor-falso/${etiqueta}/${i}`)
      .digest("base64url");
  }
  return valor.slice(0, longitud);
}

/**
 * Una contraseña falsa que PASA la política de contraseñas (`evaluarPassword`): 24 caracteres
 * aleatorios en la práctica, con mayúscula, minúscula, dígito y símbolo garantizados al final.
 */
export function contrasenaFalsa(etiqueta: string): string {
  return `${falso(`contrasena/${etiqueta}`, 20)}Aa9!`;
}
