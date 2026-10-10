/**
 * LA PALETA CLARA, MEDIDA. El tema claro no se revisa "a ojo": se mide.
 *
 *  - CADA TOKEN DEL TEMA OSCURO TIENE SU CONTRAPARTIDA CLARA. Un token sin definir en claro no falla:
 *    hereda el valor oscuro y sale un texto oscuro sobre fondo oscuro, o un acento que no pega. Este
 *    test compara las dos listas.
 *  - SE LEE: contraste WCAG de cada color sobre el fondo donde se usa.
 *  - SE DISTINGUE: CIEDE2000 entre colores que significan COSAS DISTINTAS. La regla de oro del brief
 *    —ACCIÓN ≠ DINERO— deja de estar garantizada por el tono (magenta vs lima) en cuanto los dos se
 *    vuelven cálidos/verdes, así que aquí se afirma con un número.
 *
 * Para romperlo a propósito: poner `--df-action` y `--df-ok` con el mismo verde (rojo), aclarar
 * `--df-text-dim` hasta que no se lea (rojo), o borrar una línea del bloque claro (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contraste, deltaE, tono } from "./helpers/color";
// El lector de la paleta (y `hex`) está en `helpers/paleta`: lo comparten los tres tests que miden
// color. Estaba copiado aquí, en `paleta-niveles` y haría falta una tercera vez en `paleta-oscura`.
import { CLARO, CSS, hex, OSCURO } from "./helpers/paleta";

const C = {
  money: hex(CLARO, "--df-money"),
  action: hex(CLARO, "--df-action"),
  time: hex(CLARO, "--df-time"),
  alarm: hex(CLARO, "--df-alarm"),
  rank: hex(CLARO, "--df-rank"),
  silver: hex(CLARO, "--df-silver"),
  bronze: hex(CLARO, "--df-bronze"),
  ok: hex(CLARO, "--df-ok"),
  void: hex(CLARO, "--df-void"),
  surface: hex(CLARO, "--df-surface"),
  raised: hex(CLARO, "--df-raised"),
  text: hex(CLARO, "--df-text"),
  textDim: hex(CLARO, "--df-text-dim"),
};

describe("ningún token se queda sin contrapartida", () => {
  it("los trece colores del tema claro están definidos y son un hex", () => {
    const faltan = Object.entries(C)
      .filter(([, v]) => v === "")
      .map(([k]) => k);
    expect(faltan).toEqual([]);
  });

  it("el tema claro define EXACTAMENTE los mismos tokens que el oscuro", () => {
    expect([...CLARO.keys()].sort()).toEqual([...OSCURO.keys()].sort());
  });

  /**
   * REPETIR UN VALOR EN LOS DOS TEMAS SOLO VALE SI ESTÁ DECIDIDO, y aquí están las únicas
   * decisiones de esa clase. Cada una lleva su porqué: sin él, esta lista se convierte en el sitio
   * donde se aparcan los olvidos.
   */
  const REPETIDOS_A_PROPOSITO: Record<string, string> = {
    // Un QR no es interfaz, es una marca que lee una CÁMARA. Los lectores esperan módulos oscuros
    // sobre fondo claro y varios fallan con el patrón invertido, así que si estas dos tintas
    // siguieran al tema, en oscuro habría teléfonos que no cogerían el código — roto sin verse roto.
    "--df-qr-tinta": "el QR no sigue al tema: lo lee una cámara, no una persona",
    "--df-qr-fondo": "ídem: la placa del QR es clara en los dos temas",
    // POR TEMA DONDE TIENE QUE LEERSE; IGUAL DONDE NO. El tinte de la VITRINA sí cambia con el tema
    // (sobre blanco el verde se lava y necesita más), y por eso no está en esta lista. La ATMÓSFERA
    // es lo contrario: un velo para que el fondo no sea plano, que NO tiene que leerse en ninguno de
    // los dos. Ahí el mismo número es la decisión, no el olvido — y subirlo "para que se vea" es
    // justo el fallo que llevó el verde de la vitrina a /ranking y a las pantallas de acceso.
    "--df-glow-accion-fuerza": "la atmósfera no tiene que leerse en ningún tema; la vitrina sí",
  };

  it("y ninguno repite el valor del oscuro (sería un olvido, no una decisión)", () => {
    const iguales = [...CLARO.entries()]
      .filter(([k, v]) => OSCURO.get(k) === v)
      .map(([k]) => k)
      // El velo y las sombras se DERIVAN de la paleta, así que su texto puede parecerse; se comparan
      // por valor literal y estos sí cambian. Si alguno dejara de cambiar, saldría aquí.
      .filter((k) => k !== "--df-dur-fast")
      .filter((k) => !(k in REPETIDOS_A_PROPOSITO));
    expect(iguales).toEqual([]);
  });

  it("y las excepciones siguen existiendo: no se aparcan tokens que ya no están", () => {
    // Una excepción para un token borrado es una puerta abierta esperando a que alguien la use con
    // otro nombre parecido. Si se quita el QR, esta lista tiene que quedarse vacía con él.
    for (const nombre of Object.keys(REPETIDOS_A_PROPOSITO)) {
      expect(CLARO.has(nombre), `${nombre} ya no existe: quita su excepción`).toBe(true);
      expect(OSCURO.get(nombre), `${nombre} ya no se repite: quita su excepción`).toBe(
        CLARO.get(nombre),
      );
    }
  });
});

/**
 * LA GUÍA DE ESTILO NO MIENTE — y la comprobación es EXHAUSTIVA, por un fallo real.
 *
 * Este bloque miraba una sola forma de tabla: `u / hex / hexClaro`, los seis colores semánticos. La
 * página tenía ADEMÁS una tabla de superficies con otra forma —`u / n / t`— que nadie comprobaba,
 * y se quedó con los tres valores del tema anterior mientras el swatch de al lado se pintaba del
 * token nuevo: la página de referencia de la paleta contradiciéndose a sí misma. Salieron a la luz
 * porque estaban en MAYÚSCULA, pero en minúscula habrían pasado igual — el problema no era el caso,
 * era que el guard solo sabía mirar la tabla que conocía.
 *
 * Así que ahora, además de comprobar cada etiqueta contra su token, NO PUEDE QUEDAR UN SOLO HEX de
 * la página sin explicar: o es la etiqueta de un token verificado, o está en la lista de literales
 * con su porqué. Una tercera tabla con una cuarta forma ya no se cuela.
 */
describe("la guía de estilo no miente", () => {
  const GUIA = readFileSync(
    path.resolve(__dirname, "..", "src", "app", "style-guide", "page.tsx"),
    "utf8",
  );

  /** Hex que la guía escribe SIN ser la etiqueta de un token de la paleta, y por qué. */
  const LITERALES: Record<string, string> = {
    // El CONTRAEJEMPLO tachado: "VOTAR" en blanco sobre el relleno de acción, con la leyenda de que
    // el blanco falla AA. Es la regla enseñándose al revés a propósito, no un color del sistema.
    "#ffffff": "el contraejemplo tachado: blanco sobre el relleno, que es justo lo que no se hace",
  };

  /** Los seis colores semánticos: etiqueta de los DOS temas. */
  const SEMANTICOS = [
    ...GUIA.matchAll(/u:\s*"([a-z]+)",\s*hex:\s*"(#[0-9a-f]{6})",\s*hexClaro:\s*"(#[0-9a-f]{6})"/g),
  ];
  /** Las superficies: etiqueta del tema oscuro (la guía se mira en oscuro). */
  const SUPERFICIES = [...GUIA.matchAll(/u:\s*"([a-z]+)",\s*n:\s*"(#[0-9a-f]{6})"/g)];

  it("se encontraron las dos tablas (si no, lo de abajo no compara nada)", () => {
    expect(SEMANTICOS.length, "la tabla de colores semánticos").toBeGreaterThanOrEqual(6);
    expect(SUPERFICIES.length, "la tabla de superficies").toBeGreaterThanOrEqual(3);
  });

  it("cada color semántico coincide con globals.css, en los DOS temas", () => {
    for (const [, token, oscuro, claro] of SEMANTICOS) {
      expect(OSCURO.get(`--df-${token}`), `${token} (oscuro)`).toBe(oscuro);
      expect(CLARO.get(`--df-${token}`), `${token} (claro)`).toBe(claro);
    }
  });

  it("y cada SUPERFICIE también: la etiqueta dice el valor que pinta el swatch", () => {
    // El swatch va con `var(--color-x)`, así que se repinta solo; la etiqueta de al lado no. Esa es
    // justo la pareja que puede discrepar sin que se rompa nada.
    for (const [, token, oscuro] of SUPERFICIES) {
      expect(OSCURO.get(`--df-${token}`), `${token} (superficie, oscuro)`).toBe(oscuro);
    }
  });

  it("y no queda NINGÚN hex sin explicar en toda la página", () => {
    const verificados = new Set<string>([
      ...SEMANTICOS.flatMap((m) => [m[2]!, m[3]!]),
      ...SUPERFICIES.map((m) => m[2]!),
    ]);
    const sueltos = [...GUIA.matchAll(/#[0-9a-fA-F]{6}\b/g)]
      .map((m) => m[0])
      .filter((h) => !verificados.has(h) && !(h.toLowerCase() in LITERALES));
    expect(
      [...new Set(sueltos)].sort(),
      "o lo publica como etiqueta de un token, o va a la lista de literales con su porqué",
    ).toEqual([]);
  });

  it("y los literales permitidos siguen ahí: no se aparcan permisos muertos", () => {
    for (const h of Object.keys(LITERALES)) {
      expect(GUIA.toLowerCase(), `${h} ya no está en la guía: quita su permiso`).toContain(h);
    }
  });
});

describe("se lee (contraste WCAG)", () => {
  const minimos: [string, string, string, number][] = [
    ["texto sobre el fondo de página", C.text, C.void, 7],
    ["texto sobre tarjeta", C.text, C.surface, 7],
    ["texto secundario sobre tarjeta", C.textDim, C.surface, 4.5],
    ["texto secundario sobre el fondo", C.textDim, C.void, 4.5],
    ["el blanco del CTA sobre el relleno de acción", "#ffffff", C.action, 4.5],
    ["acción como texto", C.action, C.surface, 4.5],
    ["dinero como texto (los importes)", C.money, C.surface, 4.5],
    ["dinero sobre el fondo de página", C.money, C.void, 4.5],
    ["confirmación como texto", C.ok, C.surface, 4.5],
    ["tiempo como texto", C.time, C.surface, 4.5],
    ["alarma como texto", C.alarm, C.surface, 4.5],
    // El oro y sus hermanos NO son texto pequeño en ninguna parte: son la corona y el aro del podio
    // (gráfico) y la cifra del pedestal (texto grande). El mínimo de los dos casos es 3:1.
    ["el oro del podio, gráfico y cifra grande", C.rank, C.surface, 3],
    ["plata del podio", C.silver, C.surface, 3],
    ["bronce del podio", C.bronze, C.surface, 3],
    // Y donde sí hay texto pequeño —el puesto 1/2/3 de una fila— el número va SOBRE el oro.
    ["el puesto 1/2/3 sobre el chip de oro", C.text, C.rank, 4.5],
  ];
  for (const [nombre, a, b, minimo] of minimos) {
    it(`${nombre} >= ${minimo}:1`, () => {
      expect(Number(contraste(a, b).toFixed(2))).toBeGreaterThanOrEqual(minimo);
    });
  }

  it("las superficies se distinguen entre sí, que es como se da profundidad sin sombras", () => {
    expect(contraste(C.surface, C.void)).toBeGreaterThan(1.02);
    expect(contraste(C.raised, C.surface)).toBeGreaterThan(1.05);
  });
});

describe("se distingue (CIEDE2000): cada color sigue teniendo UN trabajo", () => {
  const pares: [string, string, string, number][] = [
    ["ACCIÓN vs DINERO (la regla de oro del brief)", C.action, C.money, 20],
    ["acción vs confirmación (los dos verdes)", C.action, C.ok, 15],
    // Los dos dorados: el del dinero (texto) y el del podio (relleno). Que se distingan es
    // exactamente lo que obligó a que el puesto vaya SOBRE el oro y no EN oro.
    ["dinero vs oro del podio (los dos dorados)", C.money, C.rank, 15],
    ["dinero vs tiempo (los dos cálidos)", C.money, C.time, 15],
    ["tiempo vs alarma", C.time, C.alarm, 15],
    ["oro del podio vs plata", C.rank, C.silver, 15],
    ["oro del podio vs bronce", C.rank, C.bronze, 15],
    ["plata vs bronce", C.silver, C.bronze, 15],
  ];
  for (const [nombre, a, b, minimo] of pares) {
    it(`${nombre}: ΔE >= ${minimo}`, () => {
      expect(Number(deltaE(a, b).toFixed(2))).toBeGreaterThanOrEqual(minimo);
    });
  }

  it("la confirmación SIGUE siendo verde: no se vuelve dorada ni roja", () => {
    // Tono Lab en grados: el verde-menta/teal del brief vive entre 120° y 200°.
    expect(tono(C.ok)).toBeGreaterThan(120);
    expect(tono(C.ok)).toBeLessThan(200);
  });

  it("el puesto del podio va SOBRE el oro en claro, no EN oro (estructural)", () => {
    // Si alguien devuelve el número a `color: var(--df-rank)`, en claro queda en 3,25:1: legible a
    // duras penas y contra la regla que se acordó al elegir los dos dorados.
    // SIN COMENTARIOS: un comentario que mencione la clase no la pinta. (Lo aprendimos con el guard
    // del panel, que se daba por satisfecho con su propio comentario.)
    const fila = readFileSync(
      path.resolve(__dirname, "..", "src", "components", "ui", "fila-puesto.tsx"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(fila).toContain("df-puesto-podio");
    expect(fila).not.toContain("var(--color-rank)");
    expect(CSS).toMatch(/\[data-theme="light"\]\s*\.df-puesto-podio\s*\{[^}]*background-color/);
  });

  it("la acción es VERDE y el dinero DORADO (el encargo de Sergio, no una casualidad)", () => {
    expect(tono(C.action)).toBeGreaterThan(120);
    expect(tono(C.action)).toBeLessThan(180);
    expect(tono(C.money)).toBeGreaterThan(55);
    expect(tono(C.money)).toBeLessThan(100);
  });
});
