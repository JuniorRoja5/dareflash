/**
 * EL FORMATEADOR ÚNICO (Fase 11 · P1): toda fecha, hora, importe y número que ve una persona sale de
 * `src/lib/formato.ts`, con idioma y zona obligatorios; a un usuario o una empresa no se le dice «UTC».
 *
 * Lo que se fija:
 *  1. EL CENSO: fuera de `lib/formato` no queda ni un `toLocale…` ni un `Intl.*Format` en `src/` (el
 *     código, sin comentarios). Uno nuevo se pone rojo NOMBRANDO el fichero.
 *  2. «UTC» NO SE VE en las pantallas de usuario o empresa (ni en sus mensajes de API ni en el copy de
 *     `constants`). El panel sí lo dice (`fechaPanel`), y por eso queda fuera.
 *  3. LAS VARIANTES CON NOMBRE PROPIO, solo donde tocan: `formatearDiaClave` (claves de día UTC),
 *     `fechaPanel`/`numeroPanel` (solo el panel), `IDIOMA_DEL_EQUIPO` y `IDIOMA_SIN_PETICION`.
 *  4. EL MECANISMO DE ZONA: el layout pone el script de la cookie y el proveedor; la cookie se valida.
 *  5. LA SALIDA EN ESPAÑOL NO CAMBIA: cada estilo da exactamente lo que daba la llamada que sustituye.
 *
 * El 6º diente —llamar al formateador sin idioma o sin zona NO COMPILA— vive en
 * `formato-tipos.test.ts`, y lo comprueba `tsc` (el pre-commit), no vitest.
 *
 * Para romperlo a propósito: añadir un `toLocaleString("es-ES")` en un componente (rojo el 1, con su
 * fichero); escribir «medianoche UTC» en una pantalla de usuario (rojo el 2).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  componentesEnZona,
  estiloSinHora,
  formatearDecimal,
  formatearDiaClave,
  formatearFecha,
  formatearFechaParaQuienMira,
  formatearImporte,
  formatearMarcador,
  formatearNumero,
  horaDelReinicioDiario,
  partesDeImporte,
  ZONA_MADRID,
  ZONA_UTC,
  zonaHoraria,
} from "../src/lib/formato";
import { SCRIPT_ZONA, ZONA_COOKIE, zonaDesdeCookie } from "../src/lib/zona-espectador";

const RAIZ = path.resolve(__dirname, "..");
const SRC = path.join(RAIZ, "src");

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" ? [] : ficheros(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}
const rel = (f: string) => path.relative(RAIZ, f).split(path.sep).join("/");
/** Sin comentarios: el docblock que EXPLICA la regla no puede contar como infracción. */
const soloCodigo = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const TODOS = ficheros(SRC).map((f) => ({
  rel: rel(f),
  codigo: soloCodigo(readFileSync(f, "utf8")),
}));

// ---------------------------------------------------------------------------------------------------
// 1. El censo
// ---------------------------------------------------------------------------------------------------

const FORMATEO =
  /\.toLocale(?:Date|Time)?String\(|\bIntl\.(?:DateTimeFormat|NumberFormat|RelativeTimeFormat|PluralRules|ListFormat)\b/;

describe("1 · un solo sitio formatea", () => {
  it("el detector distingue (si no, el censo no prueba nada)", () => {
    expect(FORMATEO.test('n.toLocaleString("es-ES")')).toBe(true);
    expect(FORMATEO.test("d.toLocaleDateString()")).toBe(true);
    expect(FORMATEO.test('new Intl.NumberFormat("en-US")')).toBe(true);
    expect(FORMATEO.test("Intl.DateTimeFormat().resolvedOptions()")).toBe(true);
    expect(FORMATEO.test("formatearNumero(n, idioma)")).toBe(false);
  });

  it("fuera de `lib/formato`, ningún `toLocale…` ni `Intl.*Format` en src/", () => {
    expect(TODOS.length).toBeGreaterThan(300);
    const fuera = TODOS.filter(
      (f) => f.rel !== "src/lib/formato.ts" && FORMATEO.test(f.codigo),
    ).map((f) => f.rel);
    expect(fuera).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
// 2. «UTC» no se le dice a un usuario ni a una empresa
// ---------------------------------------------------------------------------------------------------

/** «UTC» dentro de un TEXTO: una cadena, una plantilla o el texto de JSX. No el código (`ZONA_UTC`). */
const UTC_EN_TEXTO =
  /(["'`])(?:(?!\1)[^\\\n]|\\.)*\bUTC\b(?:(?!\1)[^\\\n]|\\.)*\1|>[^<{}]*\bUTC\b[^<{}]*</;

/** Lo que ve un usuario o una empresa: sus pantallas, sus componentes, sus rutas y el copy. */
const DE_USUARIO = (r: string) =>
  r.startsWith("src/app/(app)/") ||
  r.startsWith("src/components/") ||
  r.startsWith("src/app/api/") ||
  r === "src/config/constants.ts";

/** Código que NOMBRA la zona UTC sin enseñarla (constantes de cálculo, no copy). */
const CODIGO_NO_COPY = [/RESET_TIMEZONE = "UTC"/];

describe("2 · a un usuario o una empresa no se le dice «UTC»", () => {
  it("el detector distingue texto de código", () => {
    expect(UTC_EN_TEXTO.test('"se reinicia a medianoche UTC."')).toBe(true);
    expect(UTC_EN_TEXTO.test("<p>Hasta (UTC)</p>")).toBe(true);
    expect(UTC_EN_TEXTO.test("formatearFecha(x, idioma, ZONA_UTC, estilo)")).toBe(false);
    expect(UTC_EN_TEXTO.test("Date.UTC(2026, 0, 1)")).toBe(false);
  });

  it("ninguna pantalla, componente, ruta o copy de usuario/empresa contiene «UTC» en un texto", () => {
    const culpables = TODOS.filter((f) => DE_USUARIO(f.rel))
      .filter((f) => {
        let c = f.codigo;
        for (const re of CODIGO_NO_COPY) c = c.replace(re, "");
        return UTC_EN_TEXTO.test(c);
      })
      .map((f) => f.rel);
    expect(culpables).toEqual([]);
  });

  it("y el panel SÍ lo dice: `fechaPanel` pone « UTC» a toda hora", async () => {
    const { fechaPanel } = await import("../src/app/panel/formato-panel");
    expect(fechaPanel("2026-11-13T14:30:00Z", "diaFijoMesHora")).toMatch(/ UTC$/);
    // Un día no tiene zona que leer: sin hora, sin la marca.
    expect(fechaPanel("2026-11-13T14:30:00Z", "numericaFija")).not.toMatch(/UTC/);
  });
});

// ---------------------------------------------------------------------------------------------------
// 3. Las variantes con nombre propio, solo donde tocan
// ---------------------------------------------------------------------------------------------------

const usan = (re: RegExp) => TODOS.filter((f) => re.test(f.codigo)).map((f) => f.rel);

describe("3 · el censo de las variantes con nombre propio", () => {
  it("`fechaPanel` y `numeroPanel`: solo el panel", () => {
    const fuera = usan(/\b(?:fechaPanel|numeroPanel)\(/).filter(
      (r) => !r.startsWith("src/app/panel/"),
    );
    expect(fuera).toEqual([]);
  });

  it("`IDIOMA_DEL_EQUIPO`: el panel y lo que se escribe al admin", () => {
    const PERMITIDOS = [
      "src/lib/formato.ts",
      "src/app/panel/formato-panel.ts",
      "src/server/services/resumen-admin.ts",
      "src/server/jobs/aviso-capacidad.ts",
    ];
    expect(usan(/\bIDIOMA_DEL_EQUIPO\b/).filter((r) => !PERMITIDOS.includes(r))).toEqual([]);
  });

  it("`IDIOMA_SIN_PETICION`: solo los correos que no nacen de una petición, y nombrados", () => {
    const PERMITIDOS = ["src/lib/formato.ts", "src/server/services/publicidad-moderacion.ts"];
    expect(usan(/\bIDIOMA_SIN_PETICION\b/).filter((r) => !PERMITIDOS.includes(r))).toEqual([]);
  });

  it("`formatearDiaClave`: solo donde se pinta una CLAVE de día UTC (campañas, métricas, series)", () => {
    const PERMITIDOS = [
      "src/lib/formato.ts",
      "src/app/(app)/(shell)/empresa/publicidad/page.tsx",
      "src/app/(app)/(shell)/empresa/publicidad/[id]/page.tsx",
      "src/app/(app)/(shell)/empresa/publicidad/[id]/informe-campana.tsx",
      "src/app/(app)/(shell)/empresa/publicidad/[id]/acciones-campana.tsx",
      "src/app/panel/retos/[id]/rendimiento-tiempo.tsx",
      "src/server/services/publicidad-moderacion.ts",
      "src/server/services/resumen-admin.ts",
    ];
    expect(usan(/\bformatearDiaClave\(/).filter((r) => !PERMITIDOS.includes(r))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
// 4. El mecanismo de zona
// ---------------------------------------------------------------------------------------------------

describe("4 · la zona de quien mira: cookie escrita en el navegador, validada y leída en servidor", () => {
  const layout = soloCodigo(readFileSync(path.join(SRC, "app", "layout.tsx"), "utf8"));

  it("el layout raíz pone el script de la cookie en el <head> y el proveedor alrededor del cuerpo", () => {
    expect(layout).toMatch(/<script dangerouslySetInnerHTML=\{\{ __html: SCRIPT_ZONA \}\} \/>/);
    expect(layout).toMatch(/<FormatoProvider idioma=\{idioma\} zona=\{zona\}>/);
  });

  it("el script lee la zona del navegador y escribe la cookie, sin romper nada si falla", () => {
    expect(SCRIPT_ZONA).toContain("Intl.DateTimeFormat().resolvedOptions().timeZone");
    expect(SCRIPT_ZONA).toContain(`${ZONA_COOKIE}=`);
    expect(SCRIPT_ZONA).toMatch(/^try\{[\s\S]*\}catch\(e\)\{\}$/);
    expect(SCRIPT_ZONA.length).toBeLessThan(400);
  });

  it("la cookie se VALIDA: una zona de verdad pasa; basura, vacío o inyección dan null", () => {
    expect(zonaDesdeCookie(encodeURIComponent("Europe/Madrid"))).toBe("Europe/Madrid");
    expect(zonaDesdeCookie("America%2FArgentina%2FBuenos_Aires")).toBe(
      "America/Argentina/Buenos_Aires",
    );
    for (const raro of [undefined, "", "Marte/Olympus", "%E0%A4%A", "UTC;alert(1)", "../etc"]) {
      expect(zonaDesdeCookie(raro), String(raro)).toBeNull();
    }
    expect(zonaHoraria(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// 5. La salida en español no cambia
// ---------------------------------------------------------------------------------------------------

describe("5 · lo que se ve en español es EXACTAMENTE lo de antes", () => {
  const instante = new Date("2026-11-05T14:07:00.000Z");
  const antes = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-ES", { ...o, timeZone: "UTC" }).format(instante);

  it("números corrientes, decimales y marcador", () => {
    expect(formatearNumero(1234, "es")).toBe((1234).toLocaleString("es-ES"));
    expect(formatearNumero(12345, "es")).toBe((12345).toLocaleString("es-ES"));
    expect(formatearDecimal(2, "es", 1)).toBe("2,0");
    // El marcador agrupa SIEMPRE, con coma: decisión de marca.
    expect(formatearMarcador(1234, "es")).toBe("1,234");
  });

  it("importes en céntimos, USD, «$1,250.00» (invariante 5)", () => {
    expect(formatearImporte(125000, "es")).toBe("$1,250.00");
    expect(
      partesDeImporte(125000, "es")
        .map((p) => p.value)
        .join(""),
    ).toBe("$1,250.00");
  });

  it("cada estilo de fecha da lo mismo que las opciones que sustituye", () => {
    const Z = ZONA_UTC;
    expect(formatearFecha(instante, "es", Z, "numerica")).toBe(
      instante.toLocaleDateString("es-ES", { timeZone: "UTC" }),
    );
    expect(formatearFecha(instante, "es", Z, "numericaFija")).toBe(
      antes({ day: "2-digit", month: "2-digit", year: "numeric" }),
    );
    expect(formatearFecha(instante, "es", Z, "diaMesAno")).toBe(
      antes({ day: "numeric", month: "short", year: "numeric" }),
    );
    expect(formatearFecha(instante, "es", Z, "diaFijoMesAno")).toBe(
      antes({ day: "2-digit", month: "short", year: "numeric" }),
    );
    expect(formatearFecha(instante, "es", Z, "diaFijoMesHora")).toBe(
      antes({ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    );
    expect(formatearFecha(instante, "es", Z, "medioHora")).toBe(
      antes({ dateStyle: "medium", timeStyle: "short" }),
    );
    expect(formatearFecha(instante, "es", Z, "diaMesLargoAno")).toBe(
      antes({ day: "numeric", month: "long", year: "numeric" }),
    );
  });

  it("una CLAVE de día UTC es su día en cualquier zona (el «día 7» de una campaña no es el 6)", () => {
    expect(formatearDiaClave("2026-11-07", "es", "diaMes")).toBe("7 nov");
    expect(formatearDiaClave(new Date("2026-11-07T00:00:00.000Z"), "es", "diaMesAno")).toBe(
      "7 nov 2026",
    );
  });

  it("para quien mira: con zona, su hora; SIN zona, ni una hora inventada", () => {
    const madrid = formatearFechaParaQuienMira(instante, "es", ZONA_MADRID, "diaMesAnoHora");
    expect(madrid).toContain("15:07"); // Madrid en noviembre: UTC+1
    const sinZona = formatearFechaParaQuienMira(instante, "es", null, "diaMesAnoHora");
    expect(sinZona).toBe(formatearFecha(instante, "es", ZONA_UTC, estiloSinHora("diaMesAnoHora")));
    expect(sinZona).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("la hora del reinicio diario, en la de quien mira, con su horario de verano", () => {
    const invierno = new Date("2026-11-13T10:00:00.000Z");
    const verano = new Date("2026-07-13T10:00:00.000Z");
    expect(horaDelReinicioDiario(invierno, "es", ZONA_MADRID)).toBe("01:00");
    expect(horaDelReinicioDiario(verano, "es", ZONA_MADRID)).toBe("02:00");
    expect(horaDelReinicioDiario(invierno, "es", zonaHoraria("Asia/Tokyo")!)).toBe("09:00");
    expect(horaDelReinicioDiario(invierno, "es", zonaHoraria("America/Bogota")!)).toBe("19:00");
    expect(horaDelReinicioDiario(invierno, "es", ZONA_UTC)).toBe("00:00");
  });

  it("las cifras de un instante en una zona, para calcular", () => {
    expect(componentesEnZona("2026-11-13T23:30:00Z", ZONA_MADRID)).toEqual({
      ano: 2026,
      mes: 11,
      dia: 14,
      hora: 0,
      minuto: 30,
    });
  });
});
