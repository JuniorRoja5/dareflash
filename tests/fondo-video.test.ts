/**
 * FONDO DE VÍDEO DE LA HOME.
 *
 * El invariante DURO —"en móvil no se piden los bytes del .mp4"— no se puede medir aquí: hace falta un
 * navegador y su pestaña Network. Lo que SÍ se puede poner en rojo es lo que lo garantiza:
 *  - la DECISIÓN (pura) de si se monta el vídeo, con sus cuatro combinaciones;
 *  - que el <video> esté COLGADO de esa decisión y no de un `display:none`, que es justo el error que
 *    no evita la descarga;
 *  - y el montaje: dónde vive el fondo (un ancestro con `transform`/`overflow: clip` le rompe el
 *    `fixed`), los atributos de autoplay, y que la URL y el velo salgan de una fuente única.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { VIDEO_FONDO_HOME } from "../src/config/constants";
import {
  ANCHO_ESCRITORIO_PX,
  CONSULTA_ESCRITORIO,
  CONSULTA_MOVIMIENTO,
  debeMontarVideoFondo,
} from "../src/lib/fondo-video";

const raiz = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.join(raiz, rel), "utf8");

/** Sobre el CÓDIGO: un comentario que explica por qué no vale `display:none` no es un `display:none`. */
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const COMPONENTE = "src/components/ui/fondo-video.tsx";
const HOME = "src/app/(app)/(shell)/inicio/page.tsx";
const CSS = "src/app/globals.css";

describe("la decisión: solo escritorio y solo si el usuario acepta movimiento", () => {
  it.each([
    ["escritorio y movimiento permitido", true, true, true],
    ["móvil, aunque permita movimiento", false, true, false],
    ["escritorio, pero con movimiento reducido", true, false, false],
    ["móvil y movimiento reducido", false, false, false],
  ])("%s -> %s", (_caso, escritorio, permiteMovimiento, esperado) => {
    expect(debeMontarVideoFondo({ escritorio, permiteMovimiento })).toBe(esperado);
  });

  it("el corte de escritorio es el MISMO `lg` que ya usa la home", () => {
    // Un número paralelo (960, 1000…) haría que el vídeo apareciera en un ancho donde la maqueta
    // todavía es la de móvil.
    expect(ANCHO_ESCRITORIO_PX).toBe(1024);
    expect(CONSULTA_ESCRITORIO).toBe("(min-width: 1024px)");
  });

  it("se pregunta por `no-preference`: ante la duda, quieto", () => {
    // Con `(prefers-reduced-motion: reduce)` negado, un navegador que no soporte la consulta daría
    // "no coincide" -> se reproduciría. Preguntando por `no-preference` pasa lo contrario.
    expect(CONSULTA_MOVIMIENTO).toBe("(prefers-reduced-motion: no-preference)");
  });
});

describe("el <video> cuelga de la decisión, no de una clase de CSS", () => {
  it("solo se renderiza cuando la decisión dice que sí", () => {
    const src = soloCodigo(leer(COMPONENTE));
    expect(src).toContain("debeMontarVideoFondo({");
    expect(src).toMatch(/\{conVideo \?[\s\S]*?<video/);
  });

  it("NO se esconde con CSS: eso no evita la descarga", () => {
    // `hidden`, `display:none` o un `lg:block` ocultan el elemento pero el navegador puede bajarse el
    // vídeo igual. Es exactamente el fallo que este montaje evita.
    const src = soloCodigo(leer(COMPONENTE));
    const video = src.slice(src.indexOf("<video"), src.indexOf("</video") + 1 || undefined);
    expect(video).not.toMatch(/\bhidden\b|display:\s*none|lg:block/);
  });

  it("el primer render del cliente coincide con el del servidor (sin aviso de hidratación)", () => {
    // Si el estado inicial fuera `true`, el cliente pintaría un <video> que el HTML del servidor no
    // tiene: aviso de hidratación y parpadeo.
    expect(leer(COMPONENTE)).toContain("useState(false)");
  });

  it("lleva los atributos que el autoplay EXIGE", () => {
    const src = leer(COMPONENTE);
    // Sin `muted` el navegador bloquea el autoplay; sin `playsInline` iOS se lo lleva a pantalla
    // completa; sin `loop` el fondo se queda congelado en el último fotograma.
    for (const attr of ["autoPlay", "muted", "loop", "playsInline"]) {
      expect(src).toContain(attr);
    }
  });

  it("no arrastra un póster: el telón ya cubre el hueco", () => {
    expect(soloCodigo(leer(COMPONENTE))).not.toContain("poster=");
  });
});

describe("montaje: el `fixed` tiene que resolverse contra el viewport", () => {
  it("el fondo es HERMANO del contenedor de página, no un hijo", () => {
    // Ese contenedor lleva `overflow-x-clip` y el hero `df-rise` (anima transform). Cualquiera de los
    // dos le crea bloque contenedor a un `position: fixed` — la misma trampa que la capa del feed.
    // Sobre el CÓDIGO: el comentario que hay junto al montaje NOMBRA `overflow-x-clip`, y buscarlo en
    // el fuente crudo encontraba esa mención antes que la clase de verdad.
    const src = soloCodigo(leer(HOME));
    expect(src.indexOf("<FondoVideo")).toBeGreaterThan(-1);
    expect(src.indexOf("<FondoVideo")).toBeLessThan(src.indexOf("overflow-x-clip"));
  });

  it("es decoración: ni la leen los lectores de pantalla ni se come clics", () => {
    const src = leer(COMPONENTE);
    expect(src).toContain("aria-hidden");
    expect(src).toContain("pointer-events-none");
    // Detrás de TODO el contenido.
    expect(src).toContain("-z-10");
  });
});

describe("fuente única: la URL y el velo", () => {
  it("la URL vive en constantes y NO incrustada en el JSX", () => {
    expect(VIDEO_FONDO_HOME).toBe("https://dareflash-assets.b-cdn.net/fondo-home.mp4");
    expect(leer(HOME)).toContain("VIDEO_FONDO_HOME");
    expect(soloCodigo(leer(COMPONENTE))).not.toContain("b-cdn.net");
  });

  it("la URL NO pasa por `env`: el build de producción corre sin variables", () => {
    // Es un asset PÚBLICO, así que no hay secreto que proteger; meterlo en `env` solo añadiría una
    // variable capaz de tumbar el arranque si falta.
    const constantes = leer("src/config/constants.ts");
    const bloque = constantes.slice(constantes.indexOf("VIDEO_FONDO_HOME"));
    expect(bloque.slice(0, 200)).not.toContain("process.env");
  });

  it("el oscurecido es un TOKEN derivado de la paleta, no un rgba a mano", () => {
    const css = leer(CSS);
    expect(css).toContain("--df-velo-fondo:");
    // Hasta el `);` que cierra ESTE token: un corte por longitud se colaba en el siguiente, que sí
    // lleva un `rgb(...)` — y hacía fallar al test por lo que declara el token de al lado.
    const desde = css.indexOf("--df-velo-fondo:");
    const velo = css.slice(desde, css.indexOf(");", desde) + 2);
    // Derivado de `--color-void`: si la paleta cambia, el velo cambia con ella.
    expect(velo).toContain("var(--color-void)");
    expect(velo).not.toMatch(/rgb\(|#[0-9a-f]{3,8}/i);
    // Y el componente lo USA en vez de escribir su propia opacidad.
    expect(leer(COMPONENTE)).toContain("var(--df-velo-fondo)");
  });

  it("el fondo no mete un segundo magenta de acción que compita con el CTA", () => {
    // El vídeo ya trae sus rayos horneados; el velo es oscuro y liso. `--df-glow-accion` aquí pondría
    // un magenta grande detrás del único CTA magenta de la pantalla.
    expect(soloCodigo(leer(COMPONENTE))).not.toContain("glow-accion");
  });
});

describe("el fondo base no puede tapar la capa", () => {
  it("`body` NO repinta un fondo opaco: lo pinta `html`", () => {
    // ESTO se coló hasta la revisión. El orden de pintado del contexto de apilado raíz es: fondo de
    // `html` -> hijos con z-index NEGATIVO -> bloques en flujo. El fondo de `body` cae en el último
    // grupo, así que un `background-color` ahí se pinta ENCIMA de la capa `-z-10` y el vídeo no se ve.
    // Reproducido y confirmado en Chromium real antes de arreglarlo.
    const css = leer(CSS);
    const body = css.slice(css.indexOf("\n  body {"), css.indexOf("}", css.indexOf("\n  body {")));
    expect(body).not.toContain("background");
    // Y el lienzo lo sigue dando `html`: quitarlo de los dos dejaría la página en blanco.
    const html = css.slice(css.indexOf("\n  html {"), css.indexOf("}", css.indexOf("\n  html {")));
    expect(html).toContain("background-color: var(--color-void)");
  });
});
