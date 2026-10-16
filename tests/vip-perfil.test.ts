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
    // Un segundo sitio significaría dos `linearGradient` con el mismo id en la misma página el día
    // que las dos coincidan. El emblema compacto (sin degradado) es el que puede ir en todas.
    const montan = TODOS.filter((x) => x.codigo.includes("<EmblemaVipGrande")).map((x) => x.f);
    expect(montan).toEqual([PERFIL]);
  });

  it("una sola vez dentro de esa pantalla", () => {
    const perfil = sinComentarios(leer(PERFIL));
    expect([...perfil.matchAll(/<EmblemaVipGrande/g)]).toHaveLength(1);
  });

  it("el id del degradado es UNA constante, no un literal repetido", () => {
    // Escrito a mano en los cuatro `url(#…)`, cambiarlo en tres de ellos deja el cuarto apuntando
    // a un degradado que no existe: ese trozo del emblema se pinta negro y no falla nada.
    const identidad = sinComentarios(leer(IDENTIDAD));
    expect(identidad).toContain("export const ID_DEGRADADO_EMBLEMA");
    expect(identidad, "hay un id escrito a mano").not.toMatch(/id="df-vip/);
    expect(identidad, "hay un `url(#…)` escrito a mano").not.toMatch(/url\(#[a-z]/);
  });

  it("y los compactos SIGUEN sin degradado: salen veinte veces en un feed", () => {
    const identidad = sinComentarios(leer(IDENTIDAD));
    const sello = /function SelloVip\(\{[\s\S]*?\n\}/.exec(identidad)?.[0] ?? "";
    const gema = /function GemaVip\(\{[\s\S]*?\n\}/.exec(identidad)?.[0] ?? "";
    expect(sello.length, "no encuentro SelloVip").toBeGreaterThan(100);
    expect(gema.length, "no encuentro GemaVip").toBeGreaterThan(100);
    for (const [nombre, src] of [
      ["SelloVip", sello],
      ["GemaVip", gema],
    ] as const) {
      expect(src, `${nombre} usa un degradado`).not.toContain("Gradient");
      expect(src, `${nombre} referencia un id`).not.toContain("url(#");
    }
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
  it("no hay botón 'Dar un toque' en ninguna parte del código", () => {
    // La maqueta lo trae; el toque es una pieza posterior, y un botón que no hace nada es UI
    // muerta. `perfil-sin-botones-muertos` vigila los que SÍ existen; esto, que este no aparezca.
    const conToque = TODOS.filter((x) => /[Dd]ar un toque/.test(x.codigo)).map((x) => x.f);
    expect(conToque).toEqual([]);
  });
});
