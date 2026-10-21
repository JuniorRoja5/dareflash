/**
 * EL RETO EXCLUSIVO, POR FUERA (Fase 8 · P7) — lo que no se ve en un render ni en la base de datos.
 *
 * Fija cuatro decisiones que se pueden deshacer en silencio:
 *  - NADIE ESCONDE UN RETO EXCLUSIVO. Ninguna consulta pública filtra por `soloVip`: se ve, y lo
 *    que se bloquea es participar. Un `where` de más lo volvería invisible justo para el público al
 *    que quiere convencer, y no fallaría nada.
 *  - EL MARCO DORADO ES DEL RETO EXCLUSIVO Y DE NADIE MÁS, y el oro sale de `--vip-gold`: ni el del
 *    podio (`--df-rank`) ni el verde de acción.
 *  - EL MOVIMIENTO DEL MARCO cumple las mismas reglas que el del perfil: solo `transform`, sin
 *    `!important` (o se saltaría `prefers-reduced-motion`) y con la duración en su token.
 *  - LAS RUTAS DEL PANEL PASAN EL FORMULARIO ENTERO al schema. Enumerando campos a mano fue como
 *    `nivelMinimo` se perdió: el admin elegía nivel y todos los retos salían abiertos.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CTA_RETO_SOLO_VIP,
  ETIQUETA_RETO_SOLO_VIP,
  MSG_RETO_SOLO_VIP,
} from "../src/config/constants";

const RAIZ = process.cwd();
const SHELL = ["src", "app", "(app)", "(shell)"];

/** Sin comentarios: aquí varios docblocks EXPLICAN justo lo que se prohíbe. */
const sinComentarios = (src: string) =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
const crudo = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const leer = (...p: string[]) => sinComentarios(crudo(...p));

const PUBLICO = ["src", "server", "services", "retos-publico.ts"];
const TARJETA = [...SHELL, "retos", "tarjeta-reto.tsx"];
const CHAPA = [...SHELL, "retos", "chapa-exclusivo.tsx"];
const PARTICIPAR = [...SHELL, "retos", "[codigo]", "participar.tsx"];
const DETALLE = [...SHELL, "retos", "[codigo]", "page.tsx"];
const CSS = ["src", "app", "globals.css"];
const RUTA_CREAR = ["src", "app", "api", "panel", "retos", "route.ts"];
const RUTA_EDITAR = ["src", "app", "api", "panel", "retos", "[id]", "editar", "route.ts"];

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia los ficheros", () => {
    for (const f of [TARJETA, CHAPA, PARTICIPAR, PUBLICO]) {
      expect(leer(...f).length, f.join("/")).toBeLessThan(crudo(...f).length);
    }
    // Control real: la tarjeta EXPLICA en prosa que el premio no va en oro, y nombra el token.
    expect(crudo(...TARJETA)).toMatch(/--vip-gold/);
    expect(leer(...TARJETA)).not.toMatch(/--vip-gold/);
  });
});

describe("nadie esconde un reto exclusivo", () => {
  const publico = leer(...PUBLICO);

  it("ninguna consulta pública filtra por `soloVip`", () => {
    // El flag se SELECCIONA (va en el DTO), pero no puede aparecer nunca en un `where`.
    const wheres = [...publico.matchAll(/where:\s*\{[\s\S]*?\}/g)].map((m) => m[0]);
    expect(wheres.length, "no encuentro los `where` del servicio").toBeGreaterThan(2);
    for (const w of wheres) {
      expect(w, "un `where` filtra por soloVip: el reto exclusivo se escondería").not.toMatch(
        /soloVip/,
      );
    }
    expect(publico, "el DTO dejó de traer el flag").toContain("soloVip: true");
  });

  it("y el filtro de borrados sigue siendo el único compartido", () => {
    // Si alguien añadiera `soloVip` a `NO_BORRADO`, el flag se colaría en TODAS las consultas de
    // golpe — que es la forma más silenciosa de esconder los exclusivos.
    const noBorrado = /export const NO_BORRADO = \{[^}]*\}/.exec(publico)?.[0] ?? "";
    expect(noBorrado.length, "no encuentro NO_BORRADO").toBeGreaterThan(20);
    expect(noBorrado).not.toMatch(/soloVip/);
  });
});

describe("el marco dorado: del reto exclusivo y de nadie más", () => {
  const tarjeta = leer(...TARJETA);

  it("el reto NORMAL se devuelve antes, sin envoltorio ni clases de marco", () => {
    // El candado de la identidad, aplicado aquí: como el oro no llega por ningún otro camino, no
    // puede aparecer en un reto que no es exclusivo.
    expect(tarjeta).toMatch(/if \(!reto\.soloVip\) \{\s*return \(/);
    const normal = /if \(!reto\.soloVip\) \{[\s\S]*?\n  \}/.exec(tarjeta)?.[0] ?? "";
    expect(normal.length, "no encuentro la rama del reto normal").toBeGreaterThan(80);
    expect(normal, "el reto normal lleva marco dorado").not.toMatch(/df-reto-exclusivo/);
    expect(normal, "el reto normal lleva la chapa").not.toMatch(/ChapaExclusivo/);
  });

  it("y la chapa y el marco cuelgan de `soloVip`, no de otra cosa", () => {
    expect(tarjeta).toMatch(/\{reto\.soloVip \?[\s\S]{0,120}<ChapaExclusivo/);
    expect(tarjeta).toMatch(/data-reto-exclusivo/);
  });

  it("el oro es el del VIP: nunca el del podio ni el verde de acción", () => {
    const todo = [leer(...CHAPA), leer(...PARTICIPAR), leer(...TARJETA)].join("\n");
    expect(todo, "usa el oro del PODIO").not.toMatch(/--df-rank/);
    expect(todo, "usa el verde de acción").not.toMatch(/--df-action/);
  });

  it("el PREMIO sigue en `--df-money`: la maqueta lo pedía en oro y está medido que no", () => {
    // En claro, `--vip-gold` y `--df-money` están a ΔE 4,6 (el mismo color a la vista), así que el
    // premio en oro solo existiría en oscuro; y en oscuro queda a ΔE 6,4 del oro del PODIO. El
    // dinero se pinta como el dinero en todo el producto.
    expect(tarjeta).toContain("<Marcador");
    const marcador = /<Marcador[\s\S]*?\/>/.exec(tarjeta)?.[0] ?? "";
    expect(marcador.length, "no encuentro el marcador").toBeGreaterThan(40);
    expect(marcador, "al marcador se le ha pasado un color").not.toMatch(/color|vip|oro/i);
  });
});

describe("el movimiento del marco juega con las mismas reglas que el del perfil", () => {
  const css = crudo(...CSS);
  /** El cuerpo de una regla por su selector exacto. */
  const regla = (sel: string): string => {
    const i = css.indexOf(`\n${sel} {`);
    expect(i, `no está la regla ${sel}`).toBeGreaterThan(-1);
    return css.slice(i, css.indexOf("\n}", i));
  };

  it("ninguna de las tres clases lleva `!important`", () => {
    // La regla global de `prefers-reduced-motion` apaga animaciones con `!important` sobre `*`: un
    // `!important` aquí le ganaría y el marco seguiría girando para quien pidió que no se mueva.
    for (const sel of [
      ".df-reto-exclusivo",
      ".df-reto-exclusivo::after",
      ".df-reto-exclusivo-borde",
      ".df-reto-exclusivo-borde::before",
      ".df-reto-exclusivo-cara",
    ]) {
      expect(regla(sel), `${sel} lleva !important`).not.toContain("!important");
    }
  });

  it("el borde gira con `transform` y con la duración en su token", () => {
    const borde = regla(".df-reto-exclusivo-borde::before");
    expect(borde).toContain("animation: df-vip-giro var(--vip-dur-giro)");
    expect(borde).toContain("transform: translate(-50%, -50%)");
  });

  it("el cuadrado que gira se dimensiona desde el ANCHO (la tarjeta es apaisada en lg)", () => {
    // Con el `height: 200%` del perfil —pensado para una COLUMNA— las esquinas de una banda
    // apaisada se quedarían descubiertas media vuelta de cada giro.
    const borde = regla(".df-reto-exclusivo-borde::before");
    expect(borde).toContain("width: 200%");
    expect(borde).toContain("aspect-ratio: 1");
    expect(borde, "vuelve el cuadrado medido desde el alto").not.toMatch(/height:\s*200%/);
  });

  it("y lo que acota la altura de la tarjeta sigue en su sitio: el título a DOS líneas", () => {
    // La cuenta del cuadrado vale mientras la tarjeta no sea 1,73 veces más alta que ancha. Lo que
    // lo garantiza es que la portada tiene proporción fija y el título está recortado. Si alguien
    // quita el `line-clamp-2`, hay que volver al CSS.
    expect(leer(...TARJETA), "el título dejó de estar recortado a dos líneas").toContain(
      "line-clamp-2",
    );
  });

  it("el bloom NO gira: un cuadrado desenfocado girando se come la rejilla", () => {
    expect(regla(".df-reto-exclusivo::after"), "el bloom gira").not.toContain("animation:");
    // Y vive en una capa negativa con contexto propio, o el fondo se lo come (la lección del aro).
    expect(regla(".df-reto-exclusivo")).toContain("isolation: isolate");
    expect(regla(".df-reto-exclusivo::after")).toContain("z-index: -1");
  });
});

describe("el CTA del exclusivo lleva a /vip, en humano", () => {
  const participar = leer(...PARTICIPAR);

  it("no-VIP: enlace a /vip con el copy del catálogo, no un botón muerto", () => {
    expect(participar).toContain('href="/vip"');
    expect(participar).toContain("CTA_RETO_SOLO_VIP");
    expect(participar).toContain("MSG_RETO_SOLO_VIP");
    expect(CTA_RETO_SOLO_VIP).toMatch(/VIP/);
    // Cero jerga: lo que se lee no puede ser el código del error.
    expect(MSG_RETO_SOLO_VIP).not.toMatch(/SOLO_VIP|409/);
  });

  it("el NIVEL se dice ANTES que el VIP: no se vende una suscripción contra una pared", () => {
    // El mismo orden que aplica el servidor (ver `motivoDeBloqueoDelReto`).
    expect(participar.indexOf("avisoNivel")).toBeLessThan(participar.indexOf("vetoVip"));
  });

  it("y el veto lo resuelve el CHOKEPOINT en el servidor, no la vista", () => {
    const detalle = leer(...DETALLE);
    expect(detalle).toContain("esVipActivoDe");
    // Sin pegarse al formato: prettier parte la línea en cuanto crece.
    expect(detalle).toMatch(/const vetoVip =\s*reto\.soloVip && usuario !== null/);
    // La vista no decide por su cuenta: no hay una segunda lectura del estado de la suscripción.
    expect(detalle, "la vista mira el estado a mano").not.toMatch(/estado === "ACTIVA"/);
  });

  it("la chapa usa la MARCA compartida y el literal del catálogo", () => {
    const chapa = leer(...CHAPA);
    expect(chapa).toContain("<MarcaVip");
    expect(chapa).toContain("ETIQUETA_RETO_SOLO_VIP");
    expect(ETIQUETA_RETO_SOLO_VIP.length).toBeGreaterThan(3);
  });
});

/**
 * EL FALLO QUE ESTA PIEZA SE ENCONTRÓ DE CAMINO, convertido en guard.
 *
 * Las dos rutas del panel construían el objeto del schema campo a campo, y `nivelMinimo` nunca se
 * añadió a esa lista: el formulario lo mandaba, el schema lo aceptaba con su default, y TODOS los
 * retos se creaban y editaban como `rookie` — o sea, sin restricción— eligiera lo que eligiera el
 * admin. No fallaba nada porque el default es válido.
 */
describe("las rutas del panel pasan el formulario ENTERO al schema", () => {
  it.each([
    ["crear", RUTA_CREAR],
    ["editar", RUTA_EDITAR],
  ])("%s no enumera los campos a mano", (_nombre, ruta) => {
    const src = leer(...ruta);
    expect(src).toContain("camposDelFormulario(form)");
    // La forma vieja: un `campo("…")` por cada clave. Si vuelve, vuelve el agujero.
    expect(src, "vuelve la lista de campos escrita a mano").not.toMatch(/campo\("title"\)/);
  });

  it("y el helper solo deja pasar texto (la portada no es un campo del dominio)", () => {
    const helper = leer("src", "server", "http", "form.ts");
    expect(helper).toMatch(/typeof valor === "string"/);
  });
});
