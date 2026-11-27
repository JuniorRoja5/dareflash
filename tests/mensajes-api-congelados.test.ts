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
import { MARCA } from "@/config/marca";
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
  // En el diccionario la marca es `{marca}`; la constante de antes ya la llevaba puesta.
  clave: (k: string) =>
    typeof API[k] === "string" ? (API[k] as string).replaceAll("{marca}", MARCA) : undefined,
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
const TILDES_APROBADAS: Record<string, readonly (readonly [string, string])[]> = {
  "src/app/api/auth/unlock/route.ts": [
    ["Cuerpo de la peticion invalido.", "Cuerpo de la petición inválido."],
    ["desbloqueo es invalido", "desbloqueo es inválido"],
    ["iniciar sesion de nuevo", "iniciar sesión de nuevo"],
  ],
  "src/app/api/auth/verify/route.ts": [
    ["Cuerpo de la peticion invalido.", "Cuerpo de la petición inválido."],
    ["El enlace de verificacion es invalido", "El enlace de verificación es inválido"],
    ["Ya puedes iniciar sesion.", "Ya puedes iniciar sesión."],
  ],
};

/**
 * LAS CORRECCIONES VISIBLES que Junior aprobó el 27 nov, en TODOS los ficheros, de la más específica
 * a la más genérica: las faltas de ortografía de los mensajes de la API, los cuatro mensajes de
 * `mutatingRoute` en lenguaje humano (sin «CSRF», «token» ni «origen»), y la edad del registro (16 →
 * `{edad}` desde `EDAD_MIN_USO`, que vale 18). Lo que no está aquí tiene que seguir IDÉNTICO.
 */
const CORRECCIONES_27_NOV: readonly (readonly [string, string])[] = [
  [
    "Token CSRF invalido o ausente.",
    "Tu sesión ha caducado. Recarga la página e inténtalo de nuevo.",
  ],
  ["Origen no permitido.", "Tu sesión ha caducado. Recarga la página e inténtalo de nuevo."],
  ["No autenticado.", "Tienes que iniciar sesión para hacer esto."],
  ["al menos 16 años", "al menos {…} años"],
  ["Credenciales invalidas.", "Credenciales inválidas."],
  // Sin jerga: «token» no le dice nada a quien abre un enlace cortado (P5b3, para su visto bueno).
  ["Falta el token.", "Este enlace está incompleto. Ábrelo otra vez desde el correo."],
  ["Cuerpo de la peticion invalido.", "Cuerpo de la petición inválido."],
  ["contrasena", "contraseña"],
  ["Contrasena", "Contraseña"],
  ["iniciar sesion", "iniciar sesión"],
  ["invalidos", "inválidos"],
  ["invalido", "inválido"],
  ["direccion", "dirección"],
  ["no esta disponible", "no está disponible"],
  ["ya no es valido", "ya no es válido"],
  ["Intentalo mas tarde", "Inténtalo más tarde"],
  ["Intenta mas tarde", "Intenta más tarde"],
  ["categoria de la lista", "categoría de la lista"],
  ["correo de verificacion", "correo de verificación"],
  [
    "Un moderador retiro tu participacion en este reto, asi que",
    "Un moderador retiró tu participación en este reto, así que",
  ],
];

/** Lo que se BORRÓ a propósito: `GET /api/retiradas` (decisión de Junior, 26 nov). */
const BORRADOS: Record<string, readonly string[]> = {
  "src/app/api/retiradas/route.ts": [
    "UNAUTHENTICATED → Inicia sesión para ver tus cobros.",
    "VALIDATION → Parámetros inválidos.",
  ],
};

/**
 * Pares cuya FORMA cambió sin cambiar el texto, uno a uno y con su porqué. El texto de cada uno lo
 * fija el conjunto de frases (abajo) y su propio test.
 */
const EQUIVALENCIAS: Record<string, Readonly<Record<string, string>>> = {
  // Antes era un alias local de la constante que el extractor no resolvía; ahora es su clave.
  "src/app/api/videos/upload-credential/route.ts": {
    "PARTICIPACION_BLOQUEADA → ‹MSG_BLOQUEADA›":
      "PARTICIPACION_BLOQUEADA → Un moderador retiro tu participacion en este reto, asi que no puedes volver a participar.",
  },
  // El mapa de rechazos se importa de `lib/metodo-pago-cuerpo` (ahora claves; antes frases): no se
  // resuelve aquí. Sus frases las fija el conjunto de frases y `metodos-pago`.
  "src/app/api/metodos-pago/route.ts": {
    "‹r.rechazo› → ‹MENSAJE_METODO_PAGO[r.rechazo]›":
      "‹r.rechazo› → ‹MENSAJE_METODO_PAGO[r.rechazo]›",
    "‹cuerpo.codigo› → ‹cuerpo.mensaje›": "‹cuerpo.codigo› → ‹cuerpo.mensaje›",
  },
  "src/app/api/metodos-pago/[id]/route.ts": {
    "‹r.rechazo› → ‹MENSAJE_METODO_PAGO[r.rechazo]›":
      "‹r.rechazo› → ‹MENSAJE_METODO_PAGO[r.rechazo]›",
    "‹cuerpo.codigo› → ‹cuerpo.mensaje›": "‹cuerpo.codigo› → ‹cuerpo.mensaje›",
  },
};

/**
 * Frases que eran UNA plantilla con un `?:` dentro y ahora son sus FORMAS en el diccionario (un plural
 * `{ one, other }`): el texto de cada forma es el de antes con la palabra que elegía el `?:`.
 */
const FRASES_REESCRITAS: Record<string, readonly string[]> = {
  // CONSTANTES MUERTAS, borradas (aprobado el 27 nov): nadie las usaba ya en main.
  "Ese paquete no existe.": [],
  "Ese enlace de invitación no es válido.": [],
  // El nombre del producto en Stripe: el `?:` del plural es ahora `{ one, other }`.
  "{…} Boost{…}": ["{n} Boost", "{n} Boosts"],
  // TEXTO MUERTO, quitado: el mensaje de zod de `q` en /api/buscar nunca se devolvía (la ruta responde
  // con `api.busquedaInvalidaEscribe`). Sin formas que comprobar.
  "Escribe al menos 2 caracteres.": [],
  "Anúnciate aquí y te verá la gente de tu zona. Desde {…} {…} de publicidad al día.": [
    "Anúnciate aquí y te verá la gente de tu zona. Desde {n} crédito de publicidad al día.",
    "Anúnciate aquí y te verá la gente de tu zona. Desde {n} créditos de publicidad al día.",
  ],
};

const corregir = (f: string, s: string) =>
  [...(TILDES_APROBADAS[f] ?? []), ...CORRECCIONES_27_NOV].reduce(
    (a, [de, a2]) => a.replaceAll(de, a2),
    s,
  );
/** Todas las correcciones, para buscar una frase de antes que ya no se escribe igual. */
const corregirEnCualquiera = (s: string) =>
  [...Object.values(TILDES_APROBADAS).flat(), ...CORRECCIONES_27_NOV].reduce(
    (a, [de, a2]) => a.replaceAll(de, a2),
    s,
  );

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
        .map((p) => EQUIVALENCIAS[f]?.[p] ?? p)
        .map((p) => corregir(f, p))
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
        const reescrita = FRASES_REESCRITAS[fr];
        if (reescrita) {
          // La misma frase, partida en sus formas: TODAS tienen que existir, letra a letra.
          for (const forma of reescrita) {
            if (!existen.has(normalizarHuecos(forma))) perdidas.push(`${f}: ${fr} → ${forma}`);
          }
          continue;
        }
        if (!existen.has(fr) && !existen.has(corregirEnCualquiera(fr)))
          perdidas.push(`${f}: ${fr}`);
      }
    }
    expect(perdidas, perdidas.join("\n")).toEqual([]);
  });
});
