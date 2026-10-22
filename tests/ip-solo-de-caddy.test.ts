/**
 * LA IP DEL CLIENTE SOLO SALE DE LA CABECERA QUE FIJA CADDY.
 *
 * ┌─ QUÉ SE ESTÁ PROTEGIENDO ───────────────────────────────────────────────────────────────────┐
 * │ La IP es la clave del rate-limit de login, registro, recuperación de contraseña, búsqueda y  │
 * │ voto, y se guarda hasheada en `Vote.ipHash`. Si el servidor confiara una cabecera que pone   │
 * │ el CLIENTE, cualquiera podría cambiarla en cada petición y el rate-limit dejaría de existir: │
 * │ fuerza bruta sobre contraseñas sin límite, y un voto por cada valor inventado.                │
 * │                                                                                               │
 * │ Hoy NO hay hueco: `clientIp` lee únicamente `x-real-ip`, que Caddy fija con                   │
 * │ `header_up X-Real-IP {remote_host}` (reemplaza lo que trajera el cliente), y el contenedor    │
 * │ `web` no expone puerto, así que no hay forma de llegar saltándose el proxy. Esta auditoría    │
 * │ no cambió código: lo que faltaba era el candado para que SIGA siendo así.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUÉ UN `X-Forwarded-For` ES PEOR QUE NADA ─────────────────────────────────────────────┐
 * │ Caddy lo AÑADE (append), no lo reemplaza: si el cliente manda `X-Forwarded-For: 1.2.3.4`, lo │
 * │ que llega es `1.2.3.4, <ip real>`. Leer "el primero de la lista", que es el patrón que se    │
 * │ copia de internet, es leer exactamente lo que escribió el atacante.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { clientIp, clientIpKey } from "../src/server/http/api";

const RAIZ = process.cwd();
const SECRETO = "TEST-FIXTURE-secreto-para-el-hmac-de-ip";

function fuentesDe(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const full = join(dir, entrada);
    if (statSync(full).isDirectory()) out.push(...fuentesDe(full));
    else if (entrada.endsWith(".ts") || entrada.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FUENTES = fuentesDe(join(RAIZ, "src")).filter((f) => !f.includes(`${"src"}\\generated`));

/** Solo CÓDIGO: los docblocks de `api.ts` NOMBRAN `X-Forwarded-For` para explicar por qué no se lee. */
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

/** Cabeceras que pone —o puede poner— el CLIENTE. Ninguna puede decidir una IP. */
const CABECERAS_DEL_CLIENTE = [
  "x-forwarded-for",
  "x-client-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-real-ip-original",
  "forwarded",
];

describe("nadie confía una cabecera del cliente como IP", () => {
  it("ni un `headers.get` de una cabecera falsificable en todo `src/`", () => {
    const culpables: string[] = [];
    for (const absoluto of FUENTES) {
      const codigo = soloCodigo(readFileSync(absoluto, "utf8")).toLowerCase();
      for (const cab of CABECERAS_DEL_CLIENTE) {
        if (codigo.includes(`"${cab}"`) || codigo.includes(`'${cab}'`)) {
          culpables.push(`${relative(RAIZ, absoluto)} → ${cab}`);
        }
      }
    }
    expect(
      culpables,
      "esa cabecera la pone quien llama: si decide la IP, el rate-limit deja de existir",
    ).toEqual([]);
  });

  it("y `clientIp` lee SOLO `x-real-ip` (una sola cabecera, sin alternativas)", () => {
    const api = soloCodigo(readFileSync(join(RAIZ, "src", "server", "http", "api.ts"), "utf8"));
    const leidas = [...api.matchAll(/headers\.get\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
    // `api.ts` lee otras cabeceras para otras cosas (Origin, CSRF). Lo que se fija es que NINGUNA
    // de las que suenan a IP esté ahí salvo `x-real-ip`.
    const deIp = leidas.filter((h) => /ip|forwarded|client/i.test(h ?? ""));
    expect(deIp).toEqual(["x-real-ip"]);
  });
});

describe("y se comporta así de verdad, no solo en el código", () => {
  const con = (headers: Record<string, string>): Request =>
    new Request("http://test/x", { headers });

  it("un `X-Forwarded-For` del cliente NO cambia la IP ni la clave", () => {
    const limpia = con({ "x-real-ip": "203.0.113.7" });
    const envenenada = con({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" });

    expect(clientIp(envenenada)).toBe(clientIp(limpia));
    expect(clientIpKey(envenenada, SECRETO)).toBe(clientIpKey(limpia, SECRETO));
  });

  it("ninguna de las otras cabeceras de moda cuela tampoco", () => {
    const base = clientIpKey(con({ "x-real-ip": "198.51.100.9" }), SECRETO);
    for (const cab of CABECERAS_DEL_CLIENTE) {
      const envenenada = con({ "x-real-ip": "198.51.100.9", [cab]: "9.9.9.9" });
      expect(clientIpKey(envenenada, SECRETO), cab).toBe(base);
    }
  });

  it("sin `x-real-ip` NO cae a otra cabecera: cae a un valor marcado como anomalía", () => {
    // Degradar a "lo que diga el cliente" sería el fail-open clásico. Aquí todas las peticiones
    // sin la cabecera comparten cubo, que es restrictivo, y queda el aviso en el log.
    const sinNada = clientIp(con({ "x-forwarded-for": "1.2.3.4" }));
    expect(sinNada).not.toContain("1.2.3.4");
    expect(sinNada).toBe("missing-x-real-ip");
  });

  it("la IP nunca viaja en claro en la clave: es un HMAC", () => {
    const clave = clientIpKey(con({ "x-real-ip": "203.0.113.7" }), SECRETO);
    expect(clave).not.toContain("203.0.113");
    expect(clave).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("y Caddy la REEMPLAZA, no la añade", () => {
  it("`header_up X-Real-IP {remote_host}` sigue en el Caddyfile", () => {
    // `header_up Nombre valor` en Caddy es un SET: machaca lo que trajera el cliente. Con un `+`
    // delante sería un append, y entonces la cabecera llevaría dos valores y el primero sería el
    // del atacante. Este test también lo mira.
    const caddy = readFileSync(join(RAIZ, "caddy", "Caddyfile"), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");

    expect(caddy).toMatch(/header_up X-Real-IP \{remote_host\}/);
    expect(caddy, "con `+` sería un append y el valor del cliente iría primero").not.toMatch(
      /header_up \+X-Real-IP/,
    );
  });
});
