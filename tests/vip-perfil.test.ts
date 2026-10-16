/**
 * EL PERFIL VIP, LO QUE NO SE VE EN UN RENDER (Fase 8 · P3). Estructural: fija decisiones que se
 * pueden deshacer sin que falle nada y sin que se note en una captura.
 *
 *  - El tratamiento completo lo monta UNA pantalla y SOLO detrás del gate de VIP.
 *  - El emblema grande —el único de la marca con degradado— sale de UN solo sitio.
 *  - El movimiento sale de TOKENS y no se salta `prefers-reduced-motion`.
 *  - Lo que la maqueta pedía y aquí NO va (el botón "Dar un toque") sigue sin ir.
 *
 * Para romperlo a propósito: montar `EmblemaVipGrande` en una segunda pantalla (rojo), escribir
 * `animation: … !important` en una clase `.df-vip-*` (rojo), o clavar una duración en vez de usar
 * su token (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const SRC = path.join(RAIZ, "src");
const leer = (rel: string): string => readFileSync(path.join(SRC, rel), "utf8");
const CSS = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");

/** Sin comentarios: un comentario no monta nada ni anima nada. */
const sinComentarios = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const TODOS = ficheros(SRC)
  .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
  .filter((f) => !f.startsWith("generated/"))
  .map((f) => ({ f, codigo: sinComentarios(leer(f)) }));

const PERFIL = "app/(app)/(shell)/perfil/perfil-vista.tsx";
const IDENTIDAD = "components/ui/identidad-usuario.tsx";

describe("el emblema grande: uno, y solo donde toca", () => {
  it("se recorrió `src` de verdad (si no, lo de abajo no busca nada)", () => {
    expect(TODOS.length).toBeGreaterThan(100);
  });

  it("lo DEFINE un solo fichero: el módulo de identidad", () => {
    const definen = TODOS.filter((x) => x.codigo.includes("export function EmblemaVipGrande")).map(
      (x) => x.f,
    );
    expect(definen).toEqual([IDENTIDAD]);
  });

  it("y lo MONTA una sola pantalla: el perfil", () => {
    // La marca compacta va en todas; el hero, en una. Dos heroes en la misma página serían dos
    // veces la misma declaración de "soy VIP" en un sitio donde ya está dicha.
    const montan = TODOS.filter((x) => x.codigo.includes("<EmblemaVipGrande")).map((x) => x.f);
    expect(montan).toEqual([PERFIL]);
  });

  it("una sola vez dentro de esa pantalla", () => {
    const perfil = sinComentarios(leer(PERFIL));
    expect([...perfil.matchAll(/<EmblemaVipGrande/g)]).toHaveLength(1);
  });

  /**
   * ESTOS DOS CASOS CAMBIARON DE FORMA CON EL LETTERMARK, y no se borraron.
   *
   * Decían: "el id del degradado es una constante" y "los compactos no llevan degradado, porque
   * un `<linearGradient>` repite su `id` veinte veces en un feed". Desde que la marca son LETRAS
   * en una píldora, no hay SVG, no hay `id` y ese fallo concreto ya no se puede cometer.
   *
   * Lo que SÍ sigue valiendo es la decisión de debajo —**la marca es UNA pieza, no tres dibujos
   * que mantener sincronizados**— y eso es lo que fijan ahora. Un dibujo propio por tamaño es
   * exactamente cómo el sello y la gema acabaron divergiendo antes.
   */
  it("la marca es UNA pieza: los tres tamaños salen del mismo componente", () => {
    const identidad = sinComentarios(leer(IDENTIDAD));
    expect(identidad).toContain("export function MarcaVip");

    // El hero y el de la esquina son envoltorios de la misma pieza, no dibujos aparte. Se mira
    // el CUERPO de cada función, acotado por su cierre: con una ventana de N caracteres, el
    // `<MarcaVip` de la función SIGUIENTE entraba en el rango y el caso pasaba en verde aunque el
    // hero se hubiera reescrito con su propio `<span>`. Lo descubrió el diente.
    for (const nombre of ["EmblemaVipGrande", "MarcaVipEsquina"]) {
      const cuerpo =
        new RegExp(`export function ${nombre}\\([\\s\\S]*?\\n\\}`).exec(identidad)?.[0] ?? "";
      expect(cuerpo.length, `no encuentro ${nombre}`).toBeGreaterThan(40);
      expect(cuerpo, `${nombre} dejó de reusar la marca y tiene dibujo propio`).toContain(
        "<MarcaVip",
      );
    }
    // Y los tamaños son UNA tabla, no clases sueltas repartidas por el fichero.
    expect(identidad).toContain("const TAMANO_MARCA");
  });

  it("y no queda ni un SVG con `id` en la identidad: el problema del feed desapareció", () => {
    // Un `<linearGradient id>` dentro de una pieza que sale veinte veces en un feed son veinte
    // ids iguales (HTML inválido, y hay navegadores que pintan todos con el primero). Con letras
    // no hay id que repetir; este caso fija que no vuelva a entrar uno por la puerta de atrás.
    const identidad = sinComentarios(leer(IDENTIDAD));
    expect(identidad, "volvió un degradado con id").not.toContain("Gradient");
    expect(identidad, "volvió un `url(#…)`").not.toContain("url(#");
    expect(identidad, "volvió un `id=` en la identidad").not.toMatch(/\sid=/);
  });
});

describe("el tratamiento solo se monta detrás del gate de VIP", () => {
  it("todas las clases `df-vip-*` del perfil cuelgan de `esVip`", () => {
    // El gate real es `TarjetaIdentidad`, que devuelve el nodo de siempre cuando no es VIP. Aquí
    // se fija que exista y que sea el que decide: sin esa rama, el marco saldría para todos.
    const perfil = sinComentarios(leer(PERFIL));
    expect(perfil).toMatch(/function TarjetaIdentidad\([\s\S]*?if \(!esVip\) \{/);
    // Y el emblema, la palabra y el aro, cada uno con su condición.
    for (const trozo of ["<EmblemaVipGrande", "data-vip-palabra", "df-vip-aro", "<PerksVip"]) {
      const i = perfil.indexOf(trozo);
      expect(i, `no está ${trozo}`).toBeGreaterThan(-1);
      // Hacia atrás hasta 400 caracteres tiene que haber un `esVip ?`: es la forma que usa el
      // fichero para todos ellos.
      expect(perfil.slice(Math.max(0, i - 400), i), `${trozo} no cuelga de esVip`).toMatch(
        /esVip \?/,
      );
    }
  });

  it("y ninguna OTRA pantalla monta las clases de la tarjeta VIP", () => {
    const fuera = TODOS.filter((x) => x.f !== PERFIL)
      .filter((x) => /df-vip-(marco|borde|tarjeta|aro|emblema)/.test(x.codigo))
      .map((x) => x.f);
    expect(fuera).toEqual([]);
  });
});

describe("el movimiento: por tokens y apagable", () => {
  /** El cuerpo de una regla CSS por su selector exacto. */
  const regla = (selector: string): string => {
    const i = CSS.indexOf(`\n${selector} {`);
    expect(i, `no está la regla ${selector}`).toBeGreaterThan(-1);
    return CSS.slice(i, CSS.indexOf("\n}", i));
  };

  const CON_ANIMACION = [
    ".df-vip-marco::after",
    ".df-vip-borde::before",
    ".df-vip-tarjeta::before",
    ".df-vip-emblema",
    ".df-vip-aro::after",
  ];

  it("ninguna clase de la tarjeta lleva `!important`", () => {
    // La regla global de `prefers-reduced-motion` apaga animaciones con `!important` sobre `*`,
    // `*::before` y `*::after`. Un `!important` aquí le ganaría y la tarjeta seguiría girando para
    // quien ha pedido que no se mueva nada — y no fallaría ningún otro test.
    for (const sel of CON_ANIMACION) {
      expect(regla(sel), `${sel} se declara con !important`).not.toContain("!important");
    }
  });

  it("las duraciones salen de su token, no clavadas", () => {
    // Clavar `6s` aquí y dejar el token sin usar es cómo dos capas que tienen que ir
    // SINCRONIZADAS —el borde y su bloom— acaban desfasadas en cuanto alguien toca una.
    for (const [sel, token] of [
      [".df-vip-borde::before", "--vip-dur-giro"],
      [".df-vip-aro::after", "--vip-dur-giro"],
      [".df-vip-tarjeta::before", "--vip-dur-barrido"],
      [".df-vip-emblema", "--vip-dur-flote"],
    ] as const) {
      expect(regla(sel), `${sel} no usa ${token}`).toContain(`var(${token})`);
    }
    expect(CSS, "una duración escrita a pelo en una animación VIP").not.toMatch(
      /animation:\s*df-vip-[\w-]+\s+\d/,
    );
  });

  it("el bloom NO gira, y es la decisión que evita que se coma la pantalla", () => {
    // Girar obliga a que la capa sea un cuadrado mayor que la diagonal; desenfocado, eso deja de
    // ser el halo de una tarjeta. Si alguien le vuelve a poner la animación, cae aquí.
    expect(regla(".df-vip-marco::after"), "el bloom gira otra vez").not.toContain("animation:");
    expect(regla(".df-vip-marco::after"), "el bloom perdió la silueta de la tarjeta").toContain(
      "inset: -14px",
    );
  });

  it("el barrido es INVISIBLE en reposo, que es lo que ve quien pide no moverse", () => {
    // `prefers-reduced-motion` apaga la animación y el elemento se queda en su estado BASE. Con el
    // reposo visible, la franja se quedaba clavada encima de la tarjeta para siempre — y encima
    // DENTRO, porque el `skewX` sobre una tarjeta de 2000 px la mete 300 px hacia el centro aunque
    // su caja esté fuera. Se vio en una captura con la preferencia puesta, y en ningún test.
    expect(regla(".df-vip-tarjeta::before"), "el barrido se ve en reposo").toMatch(
      /^\s+opacity: 0;$/m,
    );
    const barrido = /@keyframes df-vip-barrido \{[\s\S]*?\n\}/.exec(CSS)?.[0] ?? "";
    // Y el ciclo tiene que apagarlo en los DOS extremos, no solo al principio.
    expect(
      [...barrido.matchAll(/opacity: 0;/g)],
      "el barrido no se apaga en los dos extremos",
    ).toHaveLength(2);
  });

  it("y el barrido se mueve con `transform`, no con `left`", () => {
    // `left` repinta en cada fotograma; `transform` lo resuelve el compositor. Es la misma regla
    // que vigila `glow-por-tema` para todos los bucles.
    const barrido = /@keyframes df-vip-barrido \{[\s\S]*?\n\}/.exec(CSS)?.[0] ?? "";
    expect(barrido.length, "no está el barrido").toBeGreaterThan(50);
    expect(barrido).toContain("transform:");
    expect(barrido, "el barrido vuelve a animar `left`").not.toMatch(/^\s+left:/m);
  });
});

describe("lo que NO entra en esta pieza", () => {
  /**
   * ESTE CASO CAMBIÓ DE FORMA EN P4, y no se borró.
   *
   * En P3 decía "no hay ningún 'Dar un toque' en el código": el botón estaba en la maqueta, la
   * pieza que lo hacía funcionar no existía todavía, y un botón que no hace nada es UI muerta. En
   * P4 el toque existe de verdad, así que esa frase ya no es la decisión — pero la decisión que
   * había DEBAJO sigue siendo la misma: **ese botón no puede existir sin su endpoint**.
   *
   * Reescrito así, el día que alguien borre la ruta y deje el botón, cae aquí. Borrarlo habría
   * perdido eso.
   */
  it("el botón del toque va cableado a su endpoint: no es UI muerta", () => {
    const conToque = TODOS.filter((x) => /[Dd]ar un toque/.test(x.codigo))
      .map((x) => x.f)
      .sort();
    expect(conToque, "el texto del botón se escribió en un sitio nuevo").toEqual(
      // Dos, y cada uno con su trabajo: la PIEZA (su etiqueta) y el catálogo de copy (los
      // mensajes que manda el servidor). Un tercero sería el botón escrito a mano otra vez.
      ["components/ui/dar-toque.tsx", "config/constants.ts"].sort(),
    );
    const boton = sinComentarios(leer("components/ui/dar-toque.tsx"));
    expect(boton, "el botón no llama a ninguna ruta").toContain('"/api/toques"');
    // Y con CSRF, como toda mutación: `route-csrf` vigila la ruta; esto, al que la llama.
    expect(boton).toContain("postJsonCsrf");
    expect(
      TODOS.some((x) => x.f === "app/api/toques/route.ts"),
      "el botón llama a una ruta que no existe",
    ).toBe(true);
  });

  it("y el perfil solo lo monta en el de OTRA persona, con su id", () => {
    // Sin `userId` no hay a quién tocar, y en el propio no tiene sentido (el servidor lo rechaza
    // igual). Las tres condiciones van juntas a propósito: cada una sola deja pasar un caso raro.
    const perfil = sinComentarios(leer(PERFIL));
    expect(perfil).toMatch(/!esPropio && puedeTocar && userId \?/);
  });
});
