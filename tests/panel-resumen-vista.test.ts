/**
 * LA PORTADA DEL PANEL — que siga diciendo la verdad, y que el dinero no se escape de ADMIN.
 *
 * ┌─ EL FALLO QUE CIERRA ─────────────────────────────────────────────────────────────────────────────┐
 * │ Esta pantalla tenía una tarjeta "Premios pagados · Fase 7" que siguió ahí DESPUÉS de construirse │
 * │ el monedero: un hueco honesto que, pasada su fase, pasó a decir "esto aún no se mide" sobre algo │
 * │ que ya se medía. No falla nada —es la forma honesta de no tener un dato— y por eso puede         │
 * │ sobrevivir años. Un placeholder caducado miente igual que una cifra inventada.                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija:
 *  - CERO `próximamente` EN LA PORTADA: todas sus cifras salen de una consulta de verdad.
 *  - NINGÚN NÚMERO SE ESCRIBE NI SE OPERA EN EL JSX. Los calculan los servicios.
 *  - EL DINERO SE PINTA CON LA PRIMITIVA DEL DINERO (céntimos), no como un recuento con otro color:
 *    "5000" no es cinco mil euros, y `TarjetaMetrica` cuenta cosas.
 *  - EL DINERO ES DE ADMIN POR CONSTRUCCIÓN: `metricasDinero` solo se llama desde páginas cuya
 *    SECCIÓN exige ADMIN, y el Resumen no comprueba el rol a mano (lo decide la lista de secciones).
 *
 * Para romperlo a propósito: devolver un `<TarjetaProximamente>` a la portada (rojo), escribir
 * `valor={12}` (rojo), pintar un importe con `TarjetaMetrica` (rojo), o llamar a `metricasDinero`
 * desde una página de sección MODERATOR (rojo, con el nombre del fichero delante).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { seccionParaRuta, SECCIONES_PANEL } from "../src/app/panel/secciones";

const RAIZ = process.cwd();
const PANEL = join(RAIZ, "src", "app", "panel");
const leer = (...t: string[]): string => readFileSync(join(...t), "utf8");
/** Sin comentarios: la portada EXPLICA en prosa por qué se fue el `próximamente`. */
const soloCodigo = (f: string): string =>
  f.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGINA = soloCodigo(leer(PANEL, "page.tsx"));
const TARJETAS = soloCodigo(leer(PANEL, "tarjetas.tsx"));

/** Todas las páginas del panel, con su ruta pública. */
function paginasDelPanel(): Array<{ fichero: string; ruta: string }> {
  const salida: Array<{ fichero: string; ruta: string }> = [];
  const recorrer = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (e === "page.tsx") {
        const rel = relative(RAIZ, p).split(sep).join("/");
        const ruta =
          "/" +
          rel
            .replace(/^src\/app\//, "")
            .replace(/\/page\.tsx$/, "")
            // Un segmento dinámico (`[id]`) pertenece a la sección de su padre.
            .replace(/\/\[[^\]]+\]/g, "");
        salida.push({ fichero: rel, ruta });
      }
    }
  };
  recorrer(PANEL);
  return salida;
}

describe("la portada no tiene un solo hueco de maqueta", () => {
  it("ni `TarjetaProximamente` ni `RanuraProximamente`", () => {
    expect(PAGINA, "ha vuelto un `próximamente` a la portada").not.toMatch(
      /<(TarjetaProximamente|RanuraProximamente)/,
    );
    // Y tampoco por el import, que es lo que queda cuando alguien borra el JSX a medias.
    expect(PAGINA).not.toMatch(/TarjetaProximamente|RanuraProximamente/);
  });

  it("y el mecanismo del hueco SIGUE existiendo para quien lo necesite", () => {
    // Que la portada no lo use no significa que se pueda borrar: la honestidad vive en el tipo, y
    // otras pantallas pueden necesitarlo. Lo que no vale es un hueco caducado.
    expect(TARJETAS).toMatch(/export function TarjetaProximamente/);
    expect(TARJETAS).toMatch(/export function RanuraProximamente/);
  });
});

describe("ninguna cifra se escribe en la vista", () => {
  it("todo `valor=` viene de una variable del servidor, sin aritmética", () => {
    const valores = PAGINA.match(/valor=\{[^}]*\}/g) ?? [];
    expect(valores.length, "no hay tarjetas que mirar").toBeGreaterThan(4);
    // Un `valor={12}` o `valor={algo * 2}` cae aquí.
    for (const v of valores) expect(v).toMatch(/^valor=\{[A-Za-z_$][\w$]*(\.\w+)?\}$/);
  });

  it("y todo `cents=` también", () => {
    const importes = PAGINA.match(/cents=\{[^}]*\}/g) ?? [];
    expect(importes.length, "no hay importes que mirar").toBeGreaterThan(2);
    for (const c of importes) expect(c).toMatch(/^cents=\{[A-Za-z_$][\w$]*(\.\w+)?\}$/);
  });
});

describe("el dinero se pinta como dinero", () => {
  it("los importes van en `TarjetaDinero`, que recibe CÉNTIMOS", () => {
    expect(PAGINA).toMatch(/<TarjetaDinero/);
    const props = /export function TarjetaDinero\(\{([^}]*)\}/.exec(TARJETAS)?.[1] ?? "";
    expect(props, "no encuentro `TarjetaDinero`").toContain("cents");
    // Y usa la primitiva del dinero del producto, no un tamaño y un color escritos aquí.
    const cuerpo = TARJETAS.slice(TARJETAS.indexOf("export function TarjetaDinero"));
    expect(cuerpo).toMatch(/<ImportePremio/);
  });

  it("y `TarjetaMetrica` NO puede pintar un importe: cuenta cosas, y va neutra", () => {
    // Tuvo un `acento` que la ponía en `--df-money` "para cuando hubiera dinero". Cuando llegó, no
    // servía —un importe no es un número con otro color— y nadie lo había usado. Un permiso aparcado
    // es el camino corto a pintar un recuento con el color del dinero.
    const cuerpo = TARJETAS.slice(
      TARJETAS.indexOf("export function TarjetaMetrica"),
      TARJETAS.indexOf("export function TarjetaDinero"),
    );
    expect(cuerpo.length, "no encuentro `TarjetaMetrica`").toBeGreaterThan(100);
    expect(cuerpo, "`TarjetaMetrica` vuelve a poder pintar dinero").not.toMatch(
      /\b(text|bg|border)-money\b/,
    );
    expect(cuerpo).not.toContain("acento");
  });
});

describe("el dinero del panel es de ADMIN por construcción", () => {
  it("la sección del Resumen exige ADMIN", () => {
    expect(SECCIONES_PANEL.find((s) => s.href === "/panel")?.rol).toBe("ADMIN");
  });

  it("`metricasDinero` solo se llama desde páginas de sección ADMIN", () => {
    const culpables = paginasDelPanel()
      .filter(({ fichero }) => soloCodigo(leer(RAIZ, fichero)).includes("metricasDinero"))
      .filter(({ ruta }) => seccionParaRuta(ruta)?.rol !== "ADMIN")
      .map((p) => `${p.fichero} (${p.ruta})`);
    // Si esto falla: una pantalla que alcanza un moderador está pidiendo las cifras de dinero. El
    // arreglo no es un `if` en la vista, es no llamarlo desde ahí.
    expect(culpables, "una página de moderador pide las métricas de dinero").toEqual([]);
  });

  it("y el detector NO está roto: encuentra a quien SÍ lo llama", () => {
    // Sin este control, un `includes` mal escrito dejaría el caso de arriba verde para siempre.
    const llamantes = paginasDelPanel().filter(({ fichero }) =>
      soloCodigo(leer(RAIZ, fichero)).includes("metricasDinero"),
    );
    expect(llamantes.map((l) => l.fichero)).toEqual(["src/app/panel/page.tsx"]);
  });

  it("la portada no comprueba el rol a mano: lo decide la lista de secciones", () => {
    expect(PAGINA).not.toMatch(/role\s*===\s*["']ADMIN["']/);
    expect(PAGINA).not.toMatch(/\besAdmin\b/);
    // El guard de la sección se EJECUTA (un `requireSeccion` sin `await` renderiza igual).
    expect(PAGINA).toMatch(/await requireSeccion\("\/panel"\)/);
  });
});

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia la portada", () => {
    const crudo = leer(PANEL, "page.tsx");
    expect(crudo.length).toBeGreaterThan(PAGINA.length);
    // Control real: la portada EXPLICA en prosa el placeholder que se fue, nombrándolo.
    expect(crudo).toMatch(/Premios pagados/);
    expect(PAGINA).not.toMatch(/Premios pagados/);
  });
});
