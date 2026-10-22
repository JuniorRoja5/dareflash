/**
 * NINGUNA LISTA QUE CRECE VUELVE A PAGINAR POR POSICIÓN.
 *
 * ┌─ LAS DOS FORMAS DE PAGINAR MAL, Y POR QUÉ SON LA MISMA ─────────────────────────────────────┐
 * │ `OFFSET`/`skip` cuenta filas desde el principio: si alguien inserta o borra algo entre dos   │
 * │ páginas, la segunda empieza una fila corrida y se salta —o repite— lo que haya en la         │
 * │ frontera. Y cuesta más cuanto más adentro se va, porque la base tiene que recorrer y tirar   │
 * │ todo lo que salta.                                                                            │
 * │                                                                                               │
 * │ El `cursor` de Prisma parece lo contrario y tiene el mismo defecto por otro sitio: se ANCLA   │
 * │ A UNA FILA. Prisma la busca en la tabla para saber desde dónde seguir, así que si esa fila    │
 * │ desaparece entre páginas —moderación, borrado, baneo— la consulta se descoloca. En el feed    │
 * │ devolvía la página siguiente VACÍA, que para un scroll infinito significa "se acabó".         │
 * │                                                                                               │
 * │ Lo que sí aguanta es el keyset POR VALORES: la posición es una tupla de orden, y un valor no  │
 * │ necesita que su fila siga viva.                                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Este test es ESTRUCTURAL: no comprueba un resultado, fija la decisión. Los tests de cada lista
 * comprueban que la paginación funciona; este impide que alguien la reescriba de la otra forma y
 * que el verde de los demás lo tape.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

/** Todos los `.ts`/`.tsx` bajo un directorio. Recorrido a mano, como el resto de estructurales. */
function fuentesDe(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const full = join(dir, entrada);
    if (statSync(full).isDirectory()) out.push(...fuentesDe(full));
    else if (entrada.endsWith(".ts") || entrada.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FUENTES = [...fuentesDe(join(RAIZ, "src", "server")), ...fuentesDe(join(RAIZ, "src", "app"))];

/** Quita comentarios: lo que se afirma es sobre el CÓDIGO. Este fichero EXPLICA `skip` sin usarlo. */
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Los `skip:` que SÍ pueden quedarse, cada uno con su motivo. No son paginación: son "sáltate los N
 * primeros y quédate con el resto", que es una operación distinta y acotada.
 */
const SKIP_PERMITIDO: Record<string, string> = {
  "src/server/auth/session.ts":
    "poda de sesiones: conserva las N más recientes y borra el resto. Ni lista ni página.",
};

describe("paginación: por valores, nunca por posición", () => {
  it("no hay un solo `skip:` de Prisma fuera de los justificados", () => {
    const culpables: string[] = [];
    for (const absoluto of FUENTES) {
      const rel = relative(RAIZ, absoluto).split("\\").join("/");
      if (!soloCodigo(readFileSync(absoluto, "utf8")).includes("skip:")) continue;
      if (rel in SKIP_PERMITIDO) continue;
      culpables.push(rel);
    }
    expect(
      culpables,
      "un `skip:` nuevo: si es paginación, va por keyset; si no lo es, justifícalo en SKIP_PERMITIDO",
    ).toEqual([]);
  });

  it("y la excepción sigue existiendo (una lista blanca que sobra miente)", () => {
    // Sin esto, el día que la poda de sesiones cambie de forma, la entrada se quedaría ahí
    // autorizando un `skip:` que ya nadie escribe — y el siguiente entra por esa puerta.
    for (const rel of Object.keys(SKIP_PERMITIDO)) {
      const fuente = soloCodigo(readFileSync(join(RAIZ, rel), "utf8"));
      expect(fuente, `${rel} ya no usa \`skip:\`: quítalo de SKIP_PERMITIDO`).toContain("skip:");
    }
  });

  it("nadie usa el `cursor` de Prisma, que se ancla a una fila que puede desaparecer", () => {
    const culpables: string[] = [];
    for (const absoluto of FUENTES) {
      const codigo = soloCodigo(readFileSync(absoluto, "utf8"));
      // `cursor: {` es la forma de Prisma. Los nuestros son cadenas opacas (`cursor: "…"`,
      // `cursor: opts.cursor`), así que no chocan con esto.
      if (/\bcursor:\s*\{/.test(codigo)) culpables.push(relative(RAIZ, absoluto));
    }
    expect(culpables, "eso es el cursor por FILA de Prisma; el keyset va por valores").toEqual([]);
  });

  it("ni `OFFSET` en el SQL escrito a mano", () => {
    // SOLO en los ficheros con SQL crudo, y SOLO en mayúsculas: sin acotarlo, `underline-offset-2`
    // y `offsetParent` lo ponían rojo con la paginación perfecta. Un guard que grita por cualquier
    // cosa se acaba desactivando, y entonces ya no guarda nada.
    const conSqlCrudo = FUENTES.filter((f) => {
      const fuente = readFileSync(f, "utf8");
      return fuente.includes("$queryRaw") || fuente.includes("$executeRaw");
    });
    expect(
      conSqlCrudo.length,
      "el escáner ya no encuentra SQL crudo: ¿sigue mirando donde debe?",
    ).toBeGreaterThan(0);

    const culpables = conSqlCrudo
      .filter((f) => /\bOFFSET\b/.test(soloCodigo(readFileSync(f, "utf8"))))
      .map((f) => relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });
});

/**
 * Y EL HELPER COMPARTIDO SIGUE TENIENDO LAS DOS RAMAS.
 *
 * `dondeDesde` es el trozo que más se copia mal: se escribe el `lt` de la fecha y se olvida el
 * desempate por id, y entonces dos filas del mismo milisegundo se repiten o se saltan al cruzar la
 * frontera. Como lo usan casi todas las listas, romperlo aquí las rompe todas a la vez — y eso es
 * justo lo que hace que merezca un test propio en vez de confiar en que alguna lo note.
 */
describe("el keyset compartido", () => {
  it("compara la fecha Y desempata por id", async () => {
    const { dondeDesde } = await import("../src/lib/cursor-tiempo");
    const donde = dondeDesde({ creadoMs: 1_700_000_000_000, id: "abc" }) as {
      OR?: unknown[];
    };

    expect(donde.OR, "le falta una rama: o la fecha o el desempate").toHaveLength(2);
    expect(donde.OR?.[0]).toEqual({ createdAt: { lt: new Date(1_700_000_000_000) } });
    expect(donde.OR?.[1]).toEqual({
      createdAt: new Date(1_700_000_000_000),
      id: { lt: "abc" },
    });
  });

  it("sin cursor no filtra nada (primera página)", async () => {
    const { dondeDesde } = await import("../src/lib/cursor-tiempo");
    expect(dondeDesde(null)).toEqual({});
  });

  it("`conKeysetTiempo` NO pisa el `OR` del filtro: lo mete en un AND", async () => {
    const { conKeysetTiempo } = await import("../src/lib/cursor-tiempo");
    // El caso real: `VIDEO_VISIBLE` trae su propio `OR`. Con spread, uno de los dos se pierde SIN
    // avisar y la página 2 deja de filtrar lo que filtraba la 1.
    const filtro = { status: "PUBLISHED", OR: [{ a: 1 }, { b: 2 }] };
    const compuesto = conKeysetTiempo(filtro, { creadoMs: 1, id: "x" }) as {
      AND?: unknown[];
    };

    expect(compuesto.AND).toHaveLength(2);
    expect(compuesto.AND?.[0]).toBe(filtro);
    expect((compuesto.AND?.[1] as { OR?: unknown[] }).OR).toHaveLength(2);
  });

  it("y sin cursor devuelve el filtro TAL CUAL (ni un AND de uno)", async () => {
    const { conKeysetTiempo } = await import("../src/lib/cursor-tiempo");
    const filtro = { status: "PUBLISHED" };
    expect(conKeysetTiempo(filtro, null)).toBe(filtro);
  });
});
