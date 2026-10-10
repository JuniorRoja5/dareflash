/**
 * LA SECCIÓN "PERFILES BOOST" — que sea una sección MÁS, y que no se cuele donde no cabe.
 *
 * Lo que se fija:
 *  - REUSA LA CONSULTA de la portada, no una propia. Una copia habría duplicado el dedup, los
 *    filtros dentro del subquery y el orden: tres decisiones que no se ven desde fuera y que la
 *    copia habría dejado atrás en el primer arreglo.
 *  - ESTÁ EN LA BARRA DE ESCRITORIO Y NO EN LA DE MÓVIL. La barra inferior son cinco destinos y ya
 *    está llena; la entrada de móvil es el "ver todos" de la portada.
 *  - TIENE SU ICONO. `ICONO[clave]` con una clave que no existe no falla: pinta un hueco, y nadie
 *    lo nota hasta verlo.
 *  - ES PÚBLICA: un escaparate que exigiera sesión no sería un escaparate.
 *  - CERO COLOR A MANO y cero maqueta.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BOOST_DESTACADOS_TOPE } from "../src/config/constants";
import {
  destinoActivo,
  destinosDe,
  NAV_DESTINOS,
  NAV_ESCRITORIO,
  NAV_MOVIL,
  NAV_MOVIL_MAS,
} from "../src/components/ui/logic";

const RAIZ = process.cwd();
const crudo = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
/** Sin comentarios: un docblock que EXPLIQUE la regla no la aplica. */
const leer = (...p: string[]) =>
  crudo(...p)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SHELL = ["src", "app", "(app)", "(shell)"];
const PAGINA = [...SHELL, "destacados", "page.tsx"];
const TARJETA = ["src", "components", "ui", "tarjeta-destacado.tsx"];
const FILA = [...SHELL, "inicio", "boost-destacados.tsx"];
const NAV = ["src", "components", "ui", "navegacion.tsx"];

describe("es un destino del catálogo, como cualquier sección", () => {
  it("está en NAV_DESTINOS, con su ruta", () => {
    const d = NAV_DESTINOS.find((x) => x.clave === "destacados");
    expect(d, "destacados no está en NAV_DESTINOS").toBeDefined();
    expect(d?.href).toBe("/destacados");
    // Se llama "Boost" porque es la palabra del producto; la ruta dice lo que lista.
    expect(d?.nombre).toBe("Boost");
  });

  it("y el ACTIVO se resuelve igual que el resto", () => {
    expect(destinoActivo("/destacados")).toBe("destacados");
    expect(destinoActivo("/destacados/lo-que-sea")).toBe("destacados");
    // Una ruta que solo empieza parecido NO cuenta.
    expect(destinoActivo("/destacadosxyz")).not.toBe("destacados");
  });
});

describe("en escritorio sí, en móvil NO", () => {
  it("está en la barra lateral", () => {
    expect([...NAV_ESCRITORIO]).toContain("destacados");
    expect(destinosDe(NAV_ESCRITORIO).map((d) => d.clave)).toContain("destacados");
  });

  it("no está en la barra inferior de móvil, pero SÍ en su menú «Más»", () => {
    // Antes la frase era "la barra está llena y se llega por el «ver todos» de la portada". Dejó de
    // ser cierta al construirse el menú: ahora Boost tiene su puerta de móvil como cualquier otro
    // destino, y el enlace de la portada es un atajo, no la única vía. La barra son CUATRO destinos
    // más el botón del menú; un quinto destino la apretaría por debajo del objetivo táctil.
    expect([...NAV_MOVIL]).not.toContain("destacados");
    expect(NAV_MOVIL).toHaveLength(4);
    expect([...NAV_MOVIL_MAS], "Boost se quedó sin puerta en móvil").toContain("destacados");
  });

  it("la lateral NO la trata aparte: pinta la lista y ya", () => {
    const nav = leer(...NAV);
    // Un <Link href="/destacados"> suelto al lado del bucle sería una segunda forma de llegar, con
    // su propio estilo y su propio "activo" que nadie actualizaría.
    expect(nav).not.toContain('"/destacados"');
    expect(nav).toContain("destinosDe(NAV_ESCRITORIO)");
  });

  it("y tiene su propio icono, pintado por clave", () => {
    expect(leer(...NAV)).toMatch(/^\s{2}destacados: svg\(/m);
  });

  it("el icono es una figura DISTINTA de las otras siete", () => {
    // ┌─ ESTE CASO EMPEZÓ SIENDO UN VERDE FALSO ──────────────────────────────────────────────────┐
    // │ La primera versión comparaba solo los atributos `d="…"`, y el icono de Ranking son tres   │
    // │ `<rect>`: copiarlo en `destacados` pasaba en verde. Un guard que vigila una forma de       │
    // │ dibujar y no las otras da por buena justamente la copia más fácil de hacer.                │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    // Ahora se compara el CUERPO ENTERO de cada icono, normalizado. A 20 px, dos iconos con el
    // mismo dibujo son el mismo icono, lo dibuje un `path` o un `rect`.
    const nav = leer(...NAV);
    const inicios = [...nav.matchAll(/^ {2}([a-z]+): svg\(/gm)];
    expect(inicios.length, "no encuentro los iconos del catálogo").toBeGreaterThan(6);

    const cuerpos = inicios.map((m, i) => {
      const desde = m.index + m[0].length;
      const hasta = i + 1 < inicios.length ? inicios[i + 1]!.index : nav.length;
      return {
        clave: m[1],
        dibujo: nav.slice(desde, hasta).replace(/\s+/g, " ").trim(),
      };
    });
    // Control: si el recorte fallara, los cuerpos saldrían vacíos y "todos distintos" pasaría por
    // vacuidad en cuanto hubiera uno solo.
    for (const c of cuerpos) expect(c.dibujo.length, c.clave).toBeGreaterThan(20);

    const dibujos = cuerpos.map((c) => c.dibujo);
    expect(new Set(dibujos).size, "hay dos iconos con el mismo dibujo").toBe(dibujos.length);
  });
});

describe("la página reusa la consulta compartida", () => {
  const page = leer(...PAGINA);

  it("llama a `destacadosVigentes`, no a un SELECT propio", () => {
    expect(page).toContain("destacadosVigentes");
    expect(page, "hay SQL escrito en la página").not.toMatch(/\$queryRaw|SELECT /i);
  });

  it("con el tope compartido, no con un número escrito a mano", () => {
    expect(page).toContain("BOOST_DESTACADOS_TOPE");
    expect(page, "el tope está escrito a mano").not.toMatch(
      new RegExp(`limite:\\s*${BOOST_DESTACADOS_TOPE}`),
    );
  });

  it("y el tope lo aplica también el servicio: un solo número", () => {
    const serv = leer("src", "server", "services", "boost-destacados.ts");
    expect(serv).toContain("BOOST_DESTACADOS_TOPE");
    expect(serv, "vuelve el 100 a pelo en el recorte").not.toMatch(/\),\s*100\s*\)/);
  });

  it("es PÚBLICA: no exige sesión ni redirige a /entrar", () => {
    // Un escaparate que pide sesión no es un escaparate: quien paga por aparecer quiere que lo vea
    // cualquiera, incluido quien todavía no tiene cuenta.
    expect(page, "la vitrina exige sesión").not.toMatch(/getCurrentUser|requireUser|\/entrar/);
  });

  it("no se cachea: quién está destacado depende del reloj", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("y `prisma` entra por import dinámico, no en ámbito de módulo", () => {
    expect(page).not.toMatch(/^import[\s\S]*?from "@\/server\/db\/client"/m);
    expect(page).toMatch(/await import\("@\/server\/db\/client"\)/);
  });
});

describe("una sola tarjeta para los dos sitios", () => {
  it("la fila de la portada y la vitrina pintan el MISMO componente", () => {
    // Con dos copias, la segunda se queda atrás en cuanto se toque una. Es lo que le pasó al hero
    // de /referidos frente al de /puntos.
    for (const [donde, src] of [
      ["la portada", leer(...FILA)],
      ["la sección", leer(...PAGINA)],
    ] as const) {
      expect(src, `${donde} no usa la primitiva`).toContain("<TarjetaDestacado");
    }
  });

  it("y lo que cambia entre los dos es el TAMAÑO, no qué se enseña de alguien", () => {
    const tarjeta = leer(...TARJETA);
    expect(tarjeta).toMatch(/tamano === "vitrina"/);
    // La cara, el nombre y el nivel son los mismos en los dos tamaños.
    expect(tarjeta).toContain("<Avatar");
    expect(tarjeta).toContain("<InsigniaNivel");
    expect(tarjeta).toContain("nombreMostrado");
  });

  it("el nivel se DERIVA de los puntos: no llega como dato", () => {
    const tarjeta = leer(...TARJETA);
    expect(tarjeta).toMatch(/puntos=\{puntos\}/);

    // ┌─ SE MIRA LA FIRMA, NO EL FICHERO ENTERO ──────────────────────────────────────────────────┐
    // │ Antes prohibía `/nivel[:=]/` en todo el fuente, y eso no dice "no llega como dato": dice  │
    // │ "no se nombra". Se puso rojo el día que la tarjeta empezó a DERIVAR el nivel para pintar  │
    // │ el halo de cada persona —un `data-nivel=` calculado aquí mismo—, que es justo lo que este │
    // │ caso quiere que pase. Lo que importa es que no entre por la PUERTA, así que se mira la    │
    // │ lista de props; y se exige además el lado positivo, que antes faltaba: que se derive.     │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    const firma = /export function TarjetaDestacado\(([\s\S]*?)\)\s*\{/.exec(tarjeta)?.[1];
    expect(firma, "no encuentro la firma de la tarjeta").toBeTruthy();
    expect(firma!, "el nivel viaja como prop y puede discrepar").not.toMatch(/nivel/i);
    expect(tarjeta, "el nivel ya no se deriva de los puntos").toMatch(/nivelPorPuntos\(puntos\)/);
  });

  it("la POSICIÓN es opcional: la vitrina larga no numera", () => {
    // Numerar hasta el cuarenta sugeriría un ranking que no existe: el orden es cronológico.
    expect(leer(...TARJETA)).toMatch(/posicion\?: number/);
    expect(leer(...PAGINA), "la vitrina numera").not.toMatch(/posicion=/);
    expect(leer(...FILA), "la fila de cinco debería numerar").toMatch(/posicion=\{i \+ 1\}/);
  });
});

describe("cero color a mano y cero maqueta", () => {
  it.each([
    ["la vitrina", PAGINA],
    ["la tarjeta", TARJETA],
    ["la fila", FILA],
  ])("%s no lleva ni un hex ni un rgb()", (_, ruta) => {
    const src = leer(...ruta);
    expect(src, "hex a mano").not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src, "rgb()/rgba() a mano").not.toMatch(/\brgba?\(/);
    expect(src, "hsl() a mano").not.toMatch(/\bhsla?\(/);
  });

  it("y el color que usan sale de tokens que existen", () => {
    const todo = [PAGINA, TARJETA, FILA].map((r) => leer(...r)).join("\n");
    const vars = [...todo.matchAll(/var\((--df-[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(vars.length, "no usan ni un token: algo se ha escrito a pelo").toBeGreaterThan(2);
    const css = crudo("src", "app", "globals.css");
    for (const v of new Set(vars)) expect(css, `${v} no existe`).toContain(`${v}:`);
  });

  it("ningún perfil inventado se cuela en la vitrina", () => {
    const todo = [PAGINA, TARJETA, FILA].map((r) => leer(...r)).join("\n");
    for (const n of ["sara_p", "laia10", "nico_skate", "bea", "rae"]) {
      expect(todo, `vuelve ${n}`).not.toContain(n);
    }
  });

  it("la duración que promete sale de la constante", () => {
    const page = leer(...PAGINA);
    expect(page).toContain("BOOST_DURACION_MIN");
    expect(page).toContain("duracionBoostHumana");
    expect(page, "la duración está escrita a mano").not.toMatch(
      /\b\d+\s*(h\b|hora|horas|min\b|minuto|minutos)/i,
    );
  });
});

describe("la portada manda aquí", () => {
  it("el «ver todos» de la fila lleva a la sección", () => {
    expect(leer(...FILA)).toContain('href="/destacados"');
  });

  it("y sigue habiendo un enlace aparte para DESTACARSE", () => {
    // Son dos trabajos: mirar la lista y pagar por salir en ella. Un solo enlace obligaría a elegir.
    expect(leer(...FILA)).toContain('href="/boosts"');
  });
});

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia los ficheros de verdad", () => {
    for (const ruta of [PAGINA, TARJETA, FILA, NAV]) {
      expect(leer(...ruta).length, ruta.join("/")).toBeLessThan(crudo(...ruta).length);
    }
    // Control: la fila MENCIONA la maqueta vieja en su docblock para explicar que se fue. Si `leer`
    // dejara de quitar comentarios, el caso de "ningún perfil inventado" fallaría por la
    // explicación en vez de por el código.
    expect(crudo(...FILA)).toContain("nico_skate");
    expect(leer(...FILA)).not.toContain("nico_skate");
  });
});
