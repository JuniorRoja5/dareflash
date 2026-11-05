// PASO 3 de scripts/actualizar-geoip.sh: abre un .mmdb y resuelve IP de control de países conocidos.
//
// Es la comprobación que de verdad vale: un fichero bien formado que no resuelve nada pasa cualquier
// suma de verificación. Sale con 0 si TODAS las IP de control caen en su país, y con 1 si no (o si el
// fichero ni se abre). Imprime una línea con el resultado, que el guión deja en su registro.
//
// Uso: node scripts/geoip-comprobar.mjs <fichero.mmdb>
import { readFileSync } from "node:fs";

import { Reader } from "maxmind";

/**
 * IP de control: resolvers públicos y redes académicas cuya asignación de país es estable desde hace
 * años. Si alguna cambia de país de verdad, se cambia aquí; lo que no puede pasar es que fallen TODAS,
 * que es la señal de un fichero que no resuelve.
 */
const CONTROL = [
  ["8.8.8.8", "US"], // Google Public DNS
  ["130.206.1.1", "ES"], // RedIRIS
  ["193.0.6.139", "NL"], // RIPE NCC
];

const fichero = process.argv[2];
if (!fichero) {
  console.error("uso: node scripts/geoip-comprobar.mjs <fichero.mmdb>");
  process.exit(2);
}

let lector;
try {
  lector = new Reader(readFileSync(fichero));
} catch (e) {
  console.log(`no se puede abrir: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const resultados = CONTROL.map(([ip, esperado]) => {
  let obtenido = null;
  try {
    obtenido = lector.get(ip)?.country?.iso_code ?? null;
  } catch {
    obtenido = null;
  }
  return { ip, esperado, obtenido, ok: obtenido === esperado };
});

console.log(
  resultados
    .map((r) => `${r.ip}=${r.obtenido ?? "?"}${r.ok ? "" : `(esperado ${r.esperado})`}`)
    .join(" "),
);
process.exit(resultados.every((r) => r.ok) ? 0 : 1);
