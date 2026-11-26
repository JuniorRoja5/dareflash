/**
 * LOS MENSAJES DE LA API, CONGELADOS ANTES DE SACARLOS AL DICCIONARIO (Fase 11 · P5b3).
 *
 * `tests/fixtures/mensajes-api-antes.json` se generó con el código de ANTES de la extracción (main
 * 7d41da4) leyendo por AST (`helpers/mensajes-api`):
 *  - cada `apiError(código, mensaje)` de la API (fuera del panel) con su mensaje resuelto, y
 *  - cada frase de esas rutas y de los ficheros que les dan texto (errores de los servicios, las
 *    frases de `lib` que llegan a la pantalla, `config/constants`).
 *
 * Después de extraer, el castellano NO cambia ni una letra:
 *  - cada par «código → mensaje» de una ruta sigue diciendo EXACTAMENTE lo mismo (ahora por
 *    `t("clave")` del espacio `api`), salvo las tildes aprobadas (`TILDES_APROBADAS`) y los pares de
 *    lo que se borró (`BORRADOS`);
 *  - cada frase sigue existiendo letra a letra: en el diccionario o en algún fichero leído.
 *
 * Para romperlo: cambiar una letra de un mensaje de la API en `es.ts` (rojo con la ruta y el par), o
 * conectar una ruta a la clave equivocada (rojo).
 *
 * Regenerar el ANTES (solo se hizo una vez, antes de tocar nada): `ACTUALIZAR_ANTES=1 npx vitest run
 * tests/mensajes-api-congelados.test.ts`.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as constantes from "@/config/constants";
import { es } from "@/textos/es";

import { leerMensajesApi, normalizarHuecos, type Lectura } from "./helpers/mensajes-api";

const RAIZ = process.cwd();
const ANTES = path.join(RAIZ, "tests/fixtures/mensajes-api-antes.json");

function ts(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? ts(p) : /\.ts$/.test(n) ? [p] : [];
  });
}
const rel = (p: string) => path.relative(RAIZ, p).replaceAll("\\", "/");

/** Las rutas de la API (sin el panel) y lo que les da texto. */
const FICHEROS = [
  ...ts(path.join(RAIZ, "src/app/api"))
    .map(rel)
    .filter((f) => !f.startsWith("src/app/api/panel/")),
  ...ts(path.join(RAIZ, "src/server/http")).map(rel),
  "src/server/auth/mutating-route.ts",
  "src/server/auth/password-policy.ts",
  "src/server/services/empresas.ts",
  "src/server/services/publicidad.ts",
  "src/server/services/publicidad-entrega.ts",
  "src/server/services/retos-empresa.ts",
  "src/server/services/avatar.ts",
  "src/server/services/imagen.ts",
  "src/server/services/perfil.ts",
  "src/server/services/participacion.ts",
  "src/server/services/retirada.ts",
  "src/server/services/feed.ts",
  "src/server/services/categoria-video.ts",
  "src/lib/metodo-pago-cuerpo.ts",
  "src/lib/nivel-reto.ts",
  "src/lib/mensajes-error.ts",
  "src/lib/estado-subida.ts",
  "src/lib/notificaciones-vista.ts",
  "src/lib/retirada.ts",
  "src/lib/zona-horaria-pais.ts",
  "src/lib/categorias.ts",
  "src/config/constants.ts",
].sort();

const C = constantes as unknown as Record<string, unknown>;
const API = (es as unknown as Record<string, Record<string, unknown> | undefined>)["api"] ?? {};
const resolutores = {
  constante: (n: string) => (typeof C[n] === "string" ? (C[n] as string) : undefined),
  clave: (k: string) => (typeof API[k] === "string" ? (API[k] as string) : undefined),
};

function leerHoy(): Record<string, Lectura> {
  const salida: Record<string, Lectura> = {};
  for (const f of FICHEROS) {
    const p = path.join(RAIZ, f);
    if (existsSync(p)) salida[f] = leerMensajesApi(f, readFileSync(p, "utf8"), resolutores);
  }
  return salida;
}

/** Todas las cadenas del diccionario, aplanadas (también las formas de un plural). */
function cadenasDe(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (v && typeof v === "object") return Object.values(v).flatMap(cadenasDe);
  return [];
}

/**
 * Las tildes que Junior aprobó para /unlock y /verify (P5b2b, 25 nov): ahora que esos mensajes salen
 * de la API, se ven. CUALQUIER OTRA falta no se corrige: se lista en el informe.
 */
const TILDES_APROBADAS: readonly (readonly [string, string])[] = [];

/** Lo que se BORRÓ a propósito: `GET /api/retiradas` (decisión de Junior, 26 nov). */
const BORRADOS: Record<string, readonly string[]> = {};

const corregir = (s: string) => TILDES_APROBADAS.reduce((a, [de, a2]) => a.replaceAll(de, a2), s);

if (process.env.ACTUALIZAR_ANTES === "1") {
  writeFileSync(ANTES, JSON.stringify(leerHoy(), null, 1) + "\n");
}
const antes = JSON.parse(readFileSync(ANTES, "utf8")) as Record<string, Lectura>;

describe("los mensajes de la API dicen lo mismo que antes", () => {
  const hoy = leerHoy();

  it("el ANTES no está vacío (si no, no probaría nada)", () => {
    const pares = Object.values(antes).flatMap((l) => l.pares);
    expect(pares.length).toBeGreaterThan(200);
  });

  it("cada «código → mensaje» de una ruta sigue diciendo exactamente lo mismo", () => {
    const distintos: string[] = [];
    for (const [f, l] of Object.entries(antes)) {
      if (!f.startsWith("src/app/api/") && !f.startsWith("src/server/")) continue;
      const esperado = l.pares
        .filter((p) => !(BORRADOS[f] ?? []).includes(p))
        .map(corregir)
        .sort();
      const actual = [...(hoy[f]?.pares ?? [])].sort();
      if (JSON.stringify(esperado) !== JSON.stringify(actual)) {
        distintos.push(
          `${f}\n  faltan: ${JSON.stringify(esperado.filter((p) => !actual.includes(p)))}\n  sobran: ${JSON.stringify(actual.filter((p) => !esperado.includes(p)))}`,
        );
      }
    }
    expect(distintos, distintos.join("\n")).toEqual([]);
  });

  it("y cada frase de antes sigue existiendo, letra a letra (en el diccionario o en su sitio)", () => {
    const existen = new Set([
      ...cadenasDe(es).map(normalizarHuecos),
      ...Object.values(hoy).flatMap((l) => l.frases),
    ]);
    const perdidas: string[] = [];
    for (const [f, l] of Object.entries(antes)) {
      for (const fr of l.frases) {
        if (!existen.has(corregir(fr))) perdidas.push(`${f}: ${fr}`);
      }
    }
    expect(perdidas, perdidas.join("\n")).toEqual([]);
  });
});
