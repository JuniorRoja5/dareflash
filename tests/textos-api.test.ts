/**
 * LA API RESPONDE EN EL IDIOMA DE QUIEN LLAMA, Y SOLO POR LA COOKIE (Fase 11 · P5b3).
 *
 * Lo que se fija:
 *  - el PROXY deja el idioma de la página servida en la cookie `df-idioma`, y SOLO si cambia: una
 *    `Set-Cookie` en cada respuesta sería ruido en cada página;
 *  - la API la lee VALIDADA (`idiomaDeLaApi`): un idioma publicado, o `xx` solo en desarrollo; sin
 *    cookie, vacía, manipulada o de un idioma no publicado, castellano;
 *  - NINGUNA ruta de la API (ni lo que importa) lee `x-df-idioma` / `x-df-ruta`: `/api` no pasa por el
 *    proxy y esas cabeceras llegan tal cual las mande el cliente;
 *  - `GET /api/retiradas` ya no existe (decisión de Junior, 26 nov);
 *  - ningún mensaje de la API se escribe a mano: sale de `t()` (o de un DATO de un servicio).
 *
 * Para romperlo: quitar el «solo si cambia» del proxy (rojo), aceptar `xx` sin mirar el entorno
 * (rojo), leer `idiomaDeLaPeticion` en una ruta (rojo con su cadena), devolver el `GET` (rojo), o
 * escribir `apiError("X", "Hola.", 400)` en una ruta (rojo con fichero y línea).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ entorno: "production", publicados: ["es"] as string[] }));
vi.mock("@/config/env", () => ({
  env: {
    get NODE_ENV() {
      return H.entorno;
    },
  },
}));
vi.mock("@/config/constants", async (original) => ({
  ...(await original<typeof import("../src/config/constants")>()),
  get IDIOMAS_PUBLICADOS() {
    return H.publicados;
  },
}));

import { proxy } from "../src/proxy";
import { idiomaDeLaApi, textosApi } from "../src/server/http/textos-api";
import { es } from "../src/textos/es";

import { esFrase } from "./helpers/mensajes-api";
import { especificadores, resolver, rel, sinComentarios } from "./helpers/grafo-imports";

const RAIZ = process.cwd();
const BASE = "https://plataforma.test";
const ESCRITORIO =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36";

beforeEach(() => {
  H.entorno = "production";
  H.publicados = ["es"];
});

const pagina = (ruta: string, cookie?: string) =>
  proxy(
    new NextRequest(`${BASE}${ruta}`, {
      headers: new Headers({ "user-agent": ESCRITORIO, ...(cookie ? { cookie } : {}) }),
    }),
  );
const api = (cookie?: string) =>
  new Request(`${BASE}/api/x`, { headers: cookie ? { cookie } : {} });

describe("el proxy deja el idioma en la cookie `df-idioma`, solo si cambia", () => {
  it("al servir /inicio sin cookie: la pone, «es»", () => {
    const res = pagina("/inicio");
    expect(res.cookies.get("df-idioma")?.value).toBe("es");
    expect(res.headers.get("set-cookie") ?? "").toMatch(/df-idioma=es/);
  });

  it("con la cookie ya en «es»: NO la reescribe (ni una Set-Cookie)", () => {
    const res = pagina("/inicio", "df-idioma=es");
    expect(res.headers.get("set-cookie"), "una Set-Cookie en cada respuesta").toBeNull();
  });

  it("si cambia, la pisa: en /xx/feed (desarrollo) pasa a «xx»", () => {
    H.entorno = "development";
    const res = pagina("/xx/feed", "df-idioma=es");
    expect(res.cookies.get("df-idioma")?.value).toBe("xx");
  });

  it("y una redirección o un 404 no la tocan: solo se pone al servir una página", () => {
    expect(pagina("/es/feed").headers.get("set-cookie")).toBeNull(); // 308
    expect(pagina("/en/feed").headers.get("set-cookie")).toBeNull(); // no publicado: 404
  });
});

describe("la API la lee validada: si no vale, castellano", () => {
  it("sin cookie, vacía, manipulada o no publicada → «es»", async () => {
    for (const cookie of [
      undefined,
      "df-idioma=",
      "df-idioma=EN",
      "df-idioma=en",
      "df-idioma=<x>",
    ]) {
      expect(await idiomaDeLaApi(api(cookie)), String(cookie)).toBe("es");
    }
  });

  it("un idioma PUBLICADO se respeta", async () => {
    H.publicados = ["es", "en"];
    expect(await idiomaDeLaApi(api("otra=1; df-idioma=en"))).toBe("en");
  });

  it("`xx` solo en desarrollo; en producción es castellano", async () => {
    expect(await idiomaDeLaApi(api("df-idioma=xx"))).toBe("es");
    H.entorno = "development";
    expect(await idiomaDeLaApi(api("df-idioma=xx"))).toBe("xx");
  });

  it("y la frase sale en castellano con una cookie inválida", async () => {
    const t = await textosApi(api("df-idioma=klingon"));
    expect(t("noAutenticado")).toBe(es.api.noAutenticado);
  });

  it("con `xx` en desarrollo, la frase sale en el pseudo-idioma (no la castellana)", async () => {
    H.entorno = "development";
    const t = await textosApi(api("df-idioma=xx"));
    expect(t("noAutenticado")).not.toBe(es.api.noAutenticado);
  });
});

// ---------------------------------------------------------------------------------------------------

function ts_(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? ts_(p) : /\.ts$/.test(n) ? [p] : [];
  });
}
const RUTAS_API = ts_(path.join(RAIZ, "src/app/api")).filter(
  (f) => !rel(f).startsWith("src/app/api/panel/"),
);

/** ¿Lee las cabeceras de idioma? Las nombra (o sus constantes). `lib/idioma-ruta` solo las DEFINE. */
const LEE_CABECERAS = /CABECERA_IDIOMA|CABECERA_RUTA|["']x-df-(idioma|ruta)["']/;
const DEFINE_CABECERAS = new Set(["src/lib/idioma-ruta.ts"]);

/** La cadena de imports más corta desde `origen` hasta un fichero que lee esas cabeceras. */
function cadenaHastaCabeceras(origen: string): string[] | null {
  const visto = new Set([origen]);
  const cola: string[][] = [[origen]];
  while (cola.length > 0) {
    const cadena = cola.shift()!;
    const f = cadena.at(-1)!;
    const texto = readFileSync(f, "utf8");
    if (!DEFINE_CABECERAS.has(rel(f)) && LEE_CABECERAS.test(sinComentarios(texto))) {
      return cadena.map(rel);
    }
    for (const espec of especificadores(texto)) {
      const r = resolver(f, espec);
      if (r && !visto.has(r)) {
        visto.add(r);
        cola.push([...cadena, r]);
      }
    }
  }
  return null;
}

describe("ninguna ruta de la API lee `x-df-idioma` / `x-df-ruta`", () => {
  it("hay rutas que recorrer (si no, no probaría nada)", () => {
    expect(RUTAS_API.length).toBeGreaterThan(45);
  });

  it("ninguna llega, por ninguna cadena de imports, a un fichero que las lea", () => {
    const cadenas = RUTAS_API.map(cadenaHastaCabeceras).filter((c): c is string[] => c !== null);
    expect(
      cadenas.map((c) => c.join(" → ")),
      "la API lee una cabecera que nadie pisa",
    ).toEqual([]);
  });

  it("el detector SÍ ve una (control): `textos/servidor` llega a `formato-peticion`", () => {
    const c = cadenaHastaCabeceras(path.join(RAIZ, "src/textos/servidor.ts"));
    expect(c?.at(-1)).toBe("src/server/formato-peticion.ts");
  });
});

describe("`GET /api/retiradas` se borró (decisión de Junior, 26 nov)", () => {
  it("la ruta solo exporta POST", async () => {
    const ruta = await import("../src/app/api/retiradas/route");
    expect(Object.keys(ruta)).not.toContain("GET");
    expect(Object.keys(ruta)).toContain("POST");
  });
});

// ---------------------------------------------------------------------------------------------------

/**
 * Lo que una ruta de la API PUEDE escribir a mano, y por qué. Todo lo demás con forma de frase es rojo.
 */
const PERMITIDO: Record<string, string> = {
  // Metadato del objeto en Bunny (su panel), no algo que lea una persona en la app.
  "src/app/api/videos/upload-credential/route.ts": "Video de {…}",
  // Nombre del plan: es de marca, no se traduce.
  "src/app/api/vip/checkout/route.ts": "VIP Mythic",
};

function textosAManoEnRuta(f: string): string[] {
  const fuente = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fuera: string[] = [];
  const visitar = (n: ts.Node): void => {
    // Los logs no los ve nadie: siguen en castellano.
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === "console"
    ) {
      return;
    }
    // Un mensaje de error de la API: nunca una cadena ni una constante escrita a mano.
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "apiError"
    ) {
      const m = n.arguments[1];
      if (
        m &&
        (ts.isStringLiteral(m) ||
          ts.isNoSubstitutionTemplateLiteral(m) ||
          ts.isTemplateExpression(m) ||
          (ts.isIdentifier(m) && /^MSG_/.test(m.text)))
      ) {
        fuera.push(`${sf.getLineAndCharacterOfPosition(m.getStart()).line + 1}: ${m.getText(sf)}`);
      }
    }
    if (
      (ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        ts.isTemplateExpression(n)) &&
      !ts.isImportDeclaration(n.parent) &&
      !ts.isExportDeclaration(n.parent)
    ) {
      const texto = ts.isTemplateExpression(n)
        ? n
            .getText(sf)
            .slice(1, -1)
            .replace(/\$\{[^}]*\}/g, "{…}")
        : n.text;
      if (esFrase(texto) && /^[A-ZÁÉÍÓÚ¿¡{]/.test(texto) && PERMITIDO[rel(f)] !== texto) {
        fuera.push(`${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${texto}`);
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return fuera;
}

describe("ningún mensaje de la API se escribe a mano", () => {
  it("el detector ve uno (control)", () => {
    const tmp = path.join(RAIZ, "src/app/api/auth/csrf/route.ts");
    expect(existsSync(tmp)).toBe(true);
    expect(textosAManoEnRuta(tmp)).toEqual([]);
  });

  it("ninguna ruta (fuera del panel) escribe una frase: sale de `t()` o de un dato", () => {
    const fuera = RUTAS_API.flatMap((f) => textosAManoEnRuta(f).map((x) => `${rel(f)}:${x}`));
    expect(fuera, "una frase escrita a mano en la API").toEqual([]);
  });
});

/**
 * LOS SERVICIOS QUE DEVOLVÍAN TEXTO VISIBLE devuelven un DATO (P5b3): ni una frase escrita a mano
 * fuera de los logs, los errores internos y lo que NO entra en esta pieza (los correos, P7), nombrado
 * función a función.
 */
const SERVICIOS_CON_TEXTO = [
  "src/server/auth/password-policy.ts",
  "src/server/http/imagen-subida.ts",
  "src/server/services/creditos.ts",
  "src/server/services/empresas.ts",
  "src/server/services/feed.ts",
  "src/server/services/imagen.ts",
  "src/server/services/perfil.ts",
  "src/server/services/publicidad.ts",
  "src/server/services/publicidad-entrega.ts",
  "src/server/services/retirada.ts",
  "src/server/services/retos-empresa.ts",
  "src/lib/mensajes-error.ts",
  "src/lib/metodo-pago-cuerpo.ts",
  "src/lib/nivel-reto.ts",
  "src/lib/notificaciones-vista.ts",
  "src/lib/post-de-participacion.ts",
  "src/lib/publicidad.ts",
  "src/lib/retirada.ts",
  "src/lib/voto-cliente.ts",
  "src/lib/zona-horaria-pais.ts",
];
/**
 * Lo que NO entra en esta pieza, función a función: los que redactan CORREOS (P7) y lo que solo lee el
 * PANEL (no se traduce; donde el usuario ve lo mismo, `frases-compartidas` exige igualdad).
 */
const CORREOS_P7: Record<string, readonly string[] | undefined> = {
  "src/server/services/empresas.ts": ["avisarDecision"],
  "src/server/services/retos-empresa.ts": ["avisarDecisionReto", "caducarPropuestasVencidas"],
  // El ajuste de créditos que hace el equipo desde el panel.
  "src/server/services/creditos.ts": ["aplicarCreditosEnTx", "ajustarCreditosEmpresa"],
  // El vocabulario del panel (la P5b2 lo ata al diccionario con un test de igualdad).
  "src/lib/retirada.ts": ["ETIQUETA_ESTADO", "nombreDeMetodo"],
};

function frasesEnServicio(f: string): string[] {
  const fuente = readFileSync(path.join(RAIZ, f), "utf8");
  const sf = ts.createSourceFile(f, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fuera: string[] = [];
  const correos = new Set(CORREOS_P7[f] ?? []);
  const visitar = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === "console"
    ) {
      return;
    }
    if (ts.isNewExpression(n) && n.expression.getText(sf) === "Error") return;
    if (ts.isFunctionDeclaration(n) && n.name && correos.has(n.name.text)) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && correos.has(n.name.text)) return;
    if (
      (ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        ts.isTemplateExpression(n)) &&
      !ts.isImportDeclaration(n.parent)
    ) {
      const texto = ts.isTemplateExpression(n)
        ? n
            .getText(sf)
            .slice(1, -1)
            .replace(/\$\{[^}]*\}/g, "{…}")
        : n.text;
      // SQL y logs etiquetados no son frases de pantalla.
      const esSql = /^\s*(SELECT|INSERT|UPDATE|DELETE|SAVEPOINT|ROLLBACK|\()/.test(texto);
      if (esFrase(texto) && /^[A-ZÁÉÍÓÚ¿¡]/.test(texto.trim()) && !esSql) {
        fuera.push(`${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}: ${texto.trim()}`);
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return fuera;
}

describe("los servicios que devolvían frases devuelven un dato", () => {
  it("ninguno escribe una frase fuera de logs, errores internos y correos (P7)", () => {
    const fuera = SERVICIOS_CON_TEXTO.flatMap((f) => frasesEnServicio(f).map((x) => `${f}:${x}`));
    expect(fuera, "una frase escrita a mano en un servicio que llega a pantalla").toEqual([]);
  });

  it("el detector ve una (control): sin la excepción del correo, salen sus frases", () => {
    expect(SERVICIOS_CON_TEXTO.every((f) => existsSync(path.join(RAIZ, f)))).toBe(true);
    const guardadas = CORREOS_P7["src/server/services/empresas.ts"];
    CORREOS_P7["src/server/services/empresas.ts"] = [];
    try {
      expect(frasesEnServicio("src/server/services/empresas.ts").join(" | ")).toMatch(
        /Hemos revisado/,
      );
    } finally {
      CORREOS_P7["src/server/services/empresas.ts"] = guardadas!;
    }
  });
});

describe("las cifras de créditos en un mensaje van por la P1 (P5b3, aprobado el 27 nov)", () => {
  it("«12.485 créditos»; las de cuatro cifras, sin punto", async () => {
    const { frase, textosApiEnCastellano } = await import("../src/server/http/textos-api");
    expect(
      frase(textosApiEnCastellano(), {
        clave: "publicidadSaldoComprometido",
        params: { coste: 12485, saldo: 20000, comprometido: 1335, quedan: 11150 },
      }),
    ).toBe(
      "Esta campaña necesita 12.485 créditos de publicidad. Tienes 20.000, pero 1335 ya están comprometidos en tus otras campañas: te quedan 11.150.",
    );
  });

  it("y el servicio las pasa como NÚMERO, no como texto (si no, la P1 no las ve)", () => {
    const codigo = sinComentarios(
      readFileSync(path.join(RAIZ, "src/server/services/publicidad.ts"), "utf8"),
    );
    const saldo = codigo.slice(codigo.indexOf('"publicidadSaldoComprometido"'));
    expect(saldo.slice(0, 400)).not.toMatch(/String\((coste|empresa\.saldo|comprometido)/);
    expect(codigo).not.toMatch(/params: \{ coste: String\(/);
  });
});
