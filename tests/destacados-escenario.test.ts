/**
 * EL ESCENARIO DE /destacados — lo que no se puede deshacer en silencio.
 *
 * La vitrina pasa de ser "una lista con título" a ser un escenario: tejido de rayos de fondo,
 * titular grande y un CTA con brillo. Todo eso es barato de escribir y caro de mantener, porque las
 * tres formas de estropearlo no fallan: se ven raras semanas después, o se notan en la batería de
 * alguien que no va a escribir un parte.
 *
 *  - EL TEJIDO ES UNA CAPA, NO UN EFECTO POR TARJETA. Con cuarenta caras, un rayo por tarjeta son
 *    cuarenta animaciones a la vez. Aquí es un SVG que cubre el viewport y ya: el coste no crece
 *    con la gente destacada.
 *  - Y SOLO SE MONTA AQUÍ. En la portada la fila de destacados es una sección entre otras, con un
 *    hero y un vídeo detrás; un tejido animado encima la convierte en una feria.
 *  - SOLO SE ANIMA LA OPACIDAD. Ni `filter` ni `box-shadow`, que repintan la página entera en cada
 *    fotograma. Que ningún bucle del sistema lo haga lo vigila `glow-por-tema`; aquí se fija que
 *    ESTA capa tampoco los escriba, ni siquiera fuera de un bucle.
 *  - UN SOLO ACENTO DE ACCIÓN. El CTA. Ni el tejido ni los halos de nivel cuentan: no son acciones,
 *    son escenario e identidad.
 *
 * Para romperlo a propósito: montar `FondoRayos` en la portada (rojo), meter el rayo dentro de la
 * tarjeta (rojo), darle un `filter` a la capa (rojo), o poner un segundo botón principal (rojo).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.resolve(RAIZ, rel), "utf8");
/** Sin comentarios: un docblock que NOMBRE la capa no la monta. */
const codigo = (rel: string): string =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGINA = "src/app/(app)/(shell)/destacados/page.tsx";
const CAPA = "src/app/(app)/(shell)/destacados/fondo-rayos.tsx";
const TARJETA = "src/components/ui/tarjeta-destacado.tsx";
const CSS = "src/app/globals.css";

/** Todos los fuentes de `src`, para los censos de abajo. */
const FUENTES: string[] = [];
const andar = (dir: string): void => {
  for (const e of readdirSync(path.resolve(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (rel.includes("/generated")) continue;
    if (e.isDirectory()) andar(rel);
    else if (/\.tsx?$/.test(rel)) FUENTES.push(rel);
  }
};
andar("src");

describe("el tejido de rayos es UNA capa, y solo de esta pantalla", () => {
  it("se recorrió `src` de verdad (si no, los censos de abajo no buscan nada)", () => {
    expect(FUENTES.length).toBeGreaterThan(100);
    expect(FUENTES).toContain(PAGINA);
  });

  it("solo la vitrina lo monta", () => {
    const montan = FUENTES.filter((f) => f !== CAPA && /<FondoRayos\b/.test(codigo(f)));
    expect(montan, "el escenario se coló en otra pantalla").toEqual([PAGINA]);
  });

  it("y solo la capa y el CSS nombran su clase", () => {
    const usan = FUENTES.filter((f) => codigo(f).includes("df-rayos"));
    expect(usan, "alguien más pinta el tejido").toEqual([CAPA]);
    expect(leer(CSS)).toContain(".df-rayos");
  });

  it("la capa pinta UN solo elemento, no uno por nada", () => {
    // Un `.map` sobre gente dentro de esta capa sería el efecto por tarjeta disfrazado de fondo.
    const c = codigo(CAPA);
    expect((c.match(/className="df-rayos"/g) ?? []).length).toBe(1);
    expect(c, "la capa depende de datos: ya no es un fondo").not.toMatch(
      /props|perfiles|destacados/i,
    );
  });

  it("la TARJETA no lleva rayos: el escenario es del fondo", () => {
    expect(codigo(TARJETA)).not.toMatch(/df-rayos|FondoRayos|chispea/);
  });

  it("es HERMANA del contenedor, nunca hija (si no, `fixed` deja de cubrir)", () => {
    // El contenedor anima `transform` con `df-rise`, y eso le crea bloque contenedor a un `fixed`.
    const v = codigo(PAGINA);
    const capa = v.indexOf("<FondoRayos");
    const contenedor = v.indexOf('<div className="df-rise');
    expect(capa).toBeGreaterThan(-1);
    expect(contenedor).toBeGreaterThan(-1);
    expect(capa, "el tejido quedó dentro del contenedor").toBeLessThan(contenedor);
  });
});

describe("el tejido es barato: solo opacidad", () => {
  it("la capa no escribe `filter` ni `box-shadow` en ninguna parte", () => {
    expect(codigo(CAPA)).not.toMatch(/filter|box-?shadow|drop-shadow/i);

    // TODOS los bloques de `.df-rayos`, uno a uno. La primera versión de este caso recortaba "las
    // reglas del tejido" con un regex de región y solo cogía el primero —el de la capa—, así que
    // un `filter` en `.df-rayos path` pasaba de largo: el diente salió VERDE. La regla no estaba
    // mal; estaba mirando el sitio equivocado.
    const bloques = [...leer(CSS).matchAll(/(\.df-rayos[^{]*)\{([^}]*)\}/g)];
    expect(bloques.length, "no encuentro las reglas del tejido").toBeGreaterThanOrEqual(3);
    for (const [, selector, cuerpo] of bloques) {
      expect(cuerpo, `${selector!.trim()} repinta en cada fotograma`).not.toMatch(
        /filter:|box-shadow:/,
      );
    }
  });

  it("su animación existe y cambia SOLO la opacidad", () => {
    const kf = /@keyframes df-chispea\s*\{([\s\S]*?)\n\}/.exec(leer(CSS))?.[1];
    expect(kf, "no está `@keyframes df-chispea`").toBeTruthy();
    const propiedades = [...new Set([...kf!.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]!))];
    expect(propiedades).toEqual(["opacity"]);
  });

  it("y su color sale del token, no de un valor a mano", () => {
    // `currentColor` en el SVG y `--df-action` en la clase: los atributos de presentación de un SVG
    // no admiten `var()` de forma fiable (misma trampa que el logotipo).
    expect(codigo(CAPA)).not.toMatch(/stroke=|fill=|#[0-9a-f]{3,8}\b/i);
    expect(leer(CSS)).toMatch(/\.df-rayos\s*\{[^}]*color:\s*var\(--df-action\)/);
  });

  it("la opacidad va por TEMA: sobre blanco un trazo verde necesita más", () => {
    const de = (sel: string): string => {
      const i = leer(CSS).indexOf(sel);
      const cuerpo = leer(CSS).slice(i, leer(CSS).indexOf("\n}", i));
      return /--df-rayos-opacidad:\s*([\d.]+)/.exec(cuerpo)?.[1] ?? "";
    };
    const oscuro = Number(de(':root,\n[data-theme="dark"]'));
    const claro = Number(de('[data-theme="light"]'));
    expect(oscuro, "falta la opacidad del tema oscuro").toBeGreaterThan(0);
    expect(claro, "falta la del tema claro").toBeGreaterThan(0);
    expect(claro, "en claro el tejido tiene que pesar más").toBeGreaterThan(oscuro);
  });
});

describe("la vitrina sigue pidiendo UNA sola cosa", () => {
  it("un único botón principal en toda la pantalla", () => {
    const principales = codigo(PAGINA).match(/variante="principal"/g) ?? [];
    expect(principales.length, "hay más de un acento de acción").toBe(1);
  });

  it("y su brillo no late: un bucle más competiría con el tejido", () => {
    // La maqueta lo latía animando `box-shadow`. Aquí el realce se abre al pasar por encima.
    const v = codigo(PAGINA);
    expect(v).toContain("hover:shadow-[var(--df-glow-hover)]");
    expect(v, "el CTA volvió a animarse en bucle").not.toMatch(/animate-|animation:/);
  });

  it("el titular y su promesa están, y la duración NO está escrita a mano", () => {
    const v = codigo(PAGINA);
    expect(v).toMatch(/Bajo los focos/);
    expect(v).toMatch(/ahora mismo/);
    expect(v, "la duración se escribió a mano").toContain(
      "duracionBoostHumana(BOOST_DURACION_MIN)",
    );
  });

  it("y el vacío sigue siendo honesto: ni una cifra inventada cuando no hay nadie", () => {
    const v = codigo(PAGINA);
    expect(v).toMatch(/perfiles\.length === 0/);
    expect(v).toMatch(/no hay ning[úu]n perfil destacado/i);
  });
});
