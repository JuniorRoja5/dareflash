/**
 * EL PIE LEGAL — que esté donde tiene que estar, y SOLO ahí.
 *
 * ┌─ EL FALLO QUE CIERRA ─────────────────────────────────────────────────────────────────────────────┐
 * │ `/privacidad` se escribió, se montó y quedó inalcanzable: la única puerta era el enlace de la    │
 * │ casilla del registro, que alguien con cuenta ya no vuelve a ver. Una ruta que existe, renderiza  │
 * │ y pasa sus tests, sin un solo camino desde el producto. Es el mismo patrón que dejó cinco        │
 * │ destinos sin puerta en móvil (`nav-movil-cobertura`): lo que falta no es la página, es el camino.│
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija, que es justo lo que se puede deshacer en silencio:
 *  - EL CENSO DE QUIÉN LO MONTA. Ni uno menos (una pantalla pierde la puerta) ni uno más donde
 *    estorba: el FEED es inmersivo a pantalla completa y el PANEL no es público.
 *  - `/terminos` NO SE ENLAZA MIENTRAS NO EXISTA, y este caso CAMBIA DE LADO el día que la página
 *    aparezca: entonces exige el enlace. Un enlace a una página que no está es un 404 justo donde
 *    alguien va a comprobar qué aceptó.
 *  - UN SOLO `padding-bottom`. Dos clases de lo mismo en el mismo elemento las resuelve el orden del
 *    CSS, no el del JSX: el hueco de la barra inferior se decide con un booleano, no apilando clases.
 *  - CERO COLOR A MANO y cero acento: leer la política no es la acción de ninguna pantalla.
 *
 * Para romperlo a propósito: quitar el `<PieLegal />` del shell (rojo), montarlo en el feed (rojo),
 * enlazar `/terminos` (rojo), o pintar el pie con `text-action` (rojo).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.resolve(RAIZ, rel), "utf8");
/** Sin comentarios: el pie EXPLICA en prosa por qué no enlaza los términos; explicarlo no es hacerlo. */
const codigo = (rel: string): string =>
  leer(rel)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PIE = "src/components/ui/pie-legal.tsx";

/** Quién monta el pie, en todo `src`. El censo es el test. */
function montadores(): string[] {
  const out: string[] = [];
  const andar = (dir: string): void => {
    for (const e of readdirSync(path.resolve(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (rel.includes("/generated")) continue;
      if (e.isDirectory()) andar(rel);
      else if (/\.tsx$/.test(rel) && rel !== PIE && /<PieLegal\b/.test(codigo(rel))) out.push(rel);
    }
  };
  andar("src");
  return out.sort();
}

describe("el censo de quién monta el pie", () => {
  it("son exactamente estos tres sitios", () => {
    // UNO POR SUPERFICIE, y cada uno por su razón:
    //  · el shell, que es TODA la app de usuario menos el feed: la puerta para quien ya tiene cuenta;
    //  · /entrar, que es donde se PIDE el consentimiento —ahí es donde más falta hace—;
    //  · /privacidad, para que la propia página legal no sea un callejón sin vuelta.
    expect(montadores()).toEqual([
      "src/app/(app)/(shell)/layout.tsx",
      "src/app/entrar/page.tsx",
      "src/app/privacidad/page.tsx",
    ]);
  });

  it("y NO está en el feed ni en el panel", () => {
    // El feed vive fuera de `(shell)` precisamente para ser inmersivo: un pie debajo del vídeo es
    // una banda de texto en una pantalla que no tiene ninguna. El panel no es público.
    const fuera = montadores().filter((f) => f.includes("/feed") || f.includes("/panel"));
    expect(fuera).toEqual([]);
    expect(existsSync(path.resolve(RAIZ, "src/app/panel/layout.tsx"))).toBe(true);
    expect(codigo("src/app/panel/layout.tsx")).not.toMatch(/PieLegal/);
  });

  it("el shell lo monta UNA vez, después del contenido", () => {
    const shell = codigo("src/app/(app)/(shell)/layout.tsx");
    expect(shell.match(/<PieLegal/g) ?? []).toHaveLength(1);
    expect(shell.indexOf("<PieLegal")).toBeGreaterThan(shell.indexOf("{children}"));
    // Y con el hueco de la barra inferior: sin esto, en móvil el pie queda DETRÁS de la nav fija.
    expect(shell).toMatch(/<PieLegal\s+sobreNavMovil/);
  });

  it("y las páginas públicas lo montan SIN ese hueco: ahí no hay barra inferior", () => {
    for (const rel of ["src/app/entrar/page.tsx", "src/app/privacidad/page.tsx"]) {
      expect(codigo(rel), rel).toMatch(/<PieLegal\s*\/>/);
    }
  });
});

describe("el pie enlaza la política y nada más", () => {
  const src = codigo(PIE);

  it("enlaza /privacidad", () => {
    expect(src).toMatch(/href="\/privacidad"/);
  });

  it("no lleva un solo color escrito a mano, ni el acento", () => {
    expect(src, "hexadecimal a mano").not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src, "rgb()/hsl() a mano").not.toMatch(/\b(rgba?|hsla?)\s*\(/);
    // `--df-action` marca lo que se HACE. Leer la política no es la acción de ninguna pantalla, y un
    // pie con el acento compite con el CTA de la página que lo lleva debajo.
    expect(src, "el pie usa el acento").not.toMatch(/\b(text|bg|border)-action\b/);
  });

  it("y el hueco de la barra se decide con UN booleano, no apilando dos `pb-`", () => {
    // Dos `padding-bottom` en el mismo elemento no los resuelve el orden de las clases, sino el del
    // CSS generado: el JSX se lee bien y la pantalla sale mal. Por eso es una rama, no un `className`.
    const clases = /className=\{`([\s\S]*?)`\}/.exec(src)?.[1] ?? "";
    expect(clases, "no encuentro la clase del pie").toContain("pt-6");
    // Sin lo interpolado: la rama SÍ lleva su `pb-`, y es la única que debe llevarlo.
    const fijas = clases.replace(/\$\{[\s\S]*?\}/g, " ");
    expect((fijas.match(/\bpb-\d/g) ?? []).length, "hay un `pb-` fijo además del de la rama").toBe(
      0,
    );
    expect(src).toMatch(/sobreNavMovil \? "pb-28 lg:pb-6" : "pb-6"/);
  });
});

describe("`/terminos` se nombra, pero no se enlaza mientras no exista", () => {
  const existe = existsSync(path.resolve(RAIZ, "src/app/terminos/page.tsx"));

  it("si la página no está, el pie no enlaza a ella; si está, la enlaza", () => {
    const src = codigo(PIE);
    if (existe) {
      // HA LLEGADO EL TEXTO FINAL. Este caso cambia de lado: ahora lo que falla es NO enlazarlo, y
      // además hay que quitar el "(pronto)", que ya es mentira.
      expect(src, "`/terminos` ya existe: enlázalo en el pie").toMatch(/href="\/terminos"/);
      expect(src, 'quita el "(pronto)": la página ya existe').not.toMatch(/\(pronto\)/);
      return;
    }
    expect(src, "enlaza a `/terminos`, que no existe").not.toMatch(/href="\/terminos"/);
    // Se NOMBRA igual: que el documento esté por llegar es una información, y esconderlo deja la
    // duda de si existe en algún sitio que no encuentras.
    expect(src).toMatch(/T[ée]rminos/);
    expect(src).toMatch(/\(pronto\)/);
  });
});

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia el pie", () => {
    // Control real: el docblock del pie EXPLICA el caso de `/terminos` nombrando la ruta con una
    // barra delante, y en el código esa ruta no aparece.
    expect(leer(PIE)).toMatch(/`\/terminos`/);
    expect(codigo(PIE).length).toBeLessThan(leer(PIE).length);
    expect(codigo(PIE)).not.toMatch(/`\/terminos`/);
  });
});
