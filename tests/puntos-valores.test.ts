/**
 * LOS VALORES DE PUNTOS FIRMADOS POR SERGIO, CLAVADOS CON CIFRAS ESCRITAS.
 *
 * ┌─ POR QUE LAS CIFRAS VAN A MANO AQUI ───────────────────────────────────────────────────────────┐
 * │ El resto de la suite usa `POINTS.WIN_CHALLENGE` simbolicamente —y hace bien: lo que prueba es   │
 * │ que el cierre paga lo que dice el catalogo, no cuanto vale—. Pero eso deja los IMPORTES sin     │
 * │ vigilancia: cambiar `WIN_CHALLENGE: 300` por `30` no pone rojo NADA, porque los dos lados de    │
 * │ cada aserto leen el mismo numero. Un valor economico que se puede mover sin que nada falle es   │
 * │ exactamente lo que este fichero existe para evitar.                                             │
 * │                                                                                                 │
 * │ Misma disciplina que `marca-v3-firmada` con la paleta: los tests de forma miden cualquier       │
 * │ paleta, y uno clava la que hay. Si Sergio decide otros numeros, se cambian AQUI tambien, y ese  │
 * │ segundo cambio es la señal de que la decision se tomo y no se colo.                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Tambien se fija la RETIRADA de las dos acciones que no se van a hacer. Ocultarlas no bastaba: una
 * clave muerta en `POINTS` invita a recablearla, y una etiqueta huerfana en `razones-puntos` hace
 * creer que la razon sigue viva.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACCIONES_PUNTOS, POINTS, RAZON_AJUSTE_ADMIN } from "../src/config/constants";
import { razonHumana, razonHumanaPropia, RAZONES_CONOCIDAS } from "../src/lib/razones-puntos";

describe("los importes firmados", () => {
  it("son EXACTAMENTE estos: cifras escritas, no leidas de POINTS", () => {
    expect(POINTS).toEqual({
      WIN_CHALLENGE: 300,
      TOP20: 100,
      VIDEOS_PUBLICADOS_HITO: 100,
      INVITE_FRIEND: 50,
      RACHA_7_DIAS: 50,
      VIDEO_50_LIKES: 10,
    });
  });

  it("y `toEqual` es la mitad del diente: ninguna clave de mas, ninguna de menos", () => {
    // Un `toMatchObject` dejaria pasar una clave resucitada; `toEqual` exige el conjunto exacto.
    // Esto lo deja dicho para quien venga a "relajar" el aserto de arriba.
    expect(Object.keys(POINTS).sort()).toEqual([
      "INVITE_FRIEND",
      "RACHA_7_DIAS",
      "TOP20",
      "VIDEOS_PUBLICADOS_HITO",
      "VIDEO_50_LIKES",
      "WIN_CHALLENGE",
    ]);
  });

  it("la invitacion paga lo MISMO por los dos lados, con una sola cifra", () => {
    // Las dos filas de referidos (quien invita y quien se registra) leen `INVITE_FRIEND`. Si alguien
    // le pone un importe propio a una de las dos, aparece un segundo numero que mantener.
    const referidos = ACCIONES_PUNTOS.filter((a) =>
      ["INVITE_FRIEND", "REGISTERED_WITH_REFERRAL"].includes(a.razon),
    );
    expect(referidos).toHaveLength(2);
    expect(referidos.map((a) => a.puntos)).toEqual([POINTS.INVITE_FRIEND, POINTS.INVITE_FRIEND]);
  });
});

describe("la tabla de /puntos tras la retirada", () => {
  it("tiene 7 filas y TODAS otorgan hoy: ni una `Proximamente`", () => {
    // Clavado a proposito, como los importes: es la decision de Sergio. El dia que se decida una
    // accion nueva por llegar, este numero sube Y alguien vuelve a mirar la rama atenuada de
    // `tabla-puntos.tsx`, que es justo lo que se quiere que pase.
    expect(ACCIONES_PUNTOS).toHaveLength(7);
    expect(ACCIONES_PUNTOS.filter((a) => !a.activa)).toEqual([]);
  });

  it("ninguna fila arrastra `fase` ni `nota`: eran de las filas futuras", () => {
    const residuos = ACCIONES_PUNTOS.filter((a) => a.fase !== undefined || a.nota !== undefined);
    expect(residuos.map((a) => a.razon)).toEqual([]);
  });

  it("toda razon del catalogo tiene copy en LAS DOS voces (panel y dueño)", () => {
    // Una razon sin copy se enseña como codigo crudo. `razones-puntos` ya lo vigila, pero al borrar
    // etiquetas es facil llevarse una de mas: aqui se nota en el mismo commit.
    for (const razon of RAZONES_CONOCIDAS) {
      expect(razonHumana(razon), `sin copy de panel: ${razon}`).not.toBe(razon);
      expect(razonHumanaPropia(razon), `sin copy de dueño: ${razon}`).not.toBe(razon);
    }
  });

  it("y el catalogo de razones es el de las acciones mas el ajuste manual, sin sobras", () => {
    expect([...RAZONES_CONOCIDAS].sort()).toEqual(
      [...ACCIONES_PUNTOS.map((a) => a.razon), RAZON_AJUSTE_ADMIN].sort(),
    );
  });
});

/**
 * Las dos acciones RETIRADAS, escritas PARTIDAS.
 *
 * No es coquetería: si este fichero contuviera los identificadores completos, un `grep` del
 * repositorio los encontraria aqui y el criterio de "cero resultados en todo el repo" no se podria
 * comprobar con un grep de verdad — y el propio barrido de abajo se encontraria a si mismo. Partidos,
 * el identificador completo no existe en ningun fichero y el test sigue buscandolo igual.
 */
const RETIRADAS = ["REGISTER_FROM" + "_VIDEO_LINK", "VIDEO_100" + "_EXTERNAL_VIEWS"] as const;

const EXTENSIONES = new Set([".ts", ".tsx", ".prisma", ".sql", ".json", ".md"]);

/** Todos los ficheros de codigo del repo, saltandose lo generado y lo que no es fuente. */
function ficheros(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "generated"].includes(entrada)) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) out.push(...ficheros(ruta));
    else if (EXTENSIONES.has(extname(ruta))) out.push(ruta);
  }
  return out;
}

describe("las dos acciones retiradas no sobreviven en ningun rincon", () => {
  it("no quedan en src, tests ni prisma — ni como clave, ni como etiqueta, ni en un comentario", () => {
    const raiz = process.cwd();
    const todos = ["src", "tests", "prisma"].flatMap((d) => ficheros(join(raiz, d)));
    // Control: el barrido encuentra algo que SI existe. Sin esto, un `ficheros()` que devolviera
    // la lista vacia dejaria el caso en verde para siempre.
    expect(todos.length).toBeGreaterThan(100);
    expect(todos.some((f) => readFileSync(f, "utf8").includes("WIN_CHALLENGE"))).toBe(true);

    const supervivientes = todos.flatMap((f) => {
      const texto = readFileSync(f, "utf8");
      return RETIRADAS.filter((r) => texto.includes(r)).map((r) => `${f} -> ${r}`);
    });
    expect(supervivientes).toEqual([]);
  });

  it("ni como razon conocida: el ledger no las volveria a traducir", () => {
    for (const r of RETIRADAS) {
      expect(RAZONES_CONOCIDAS).not.toContain(r);
      // Y si una fila VIEJA del ledger las tuviera, se enseñaria el codigo crudo a proposito (ver el
      // docblock de `razones-puntos`): feo y arreglable, nunca una etiqueta inventada.
      expect(razonHumana(r)).toBe(r);
      expect(razonHumanaPropia(r)).toBe(r);
    }
  });
});
