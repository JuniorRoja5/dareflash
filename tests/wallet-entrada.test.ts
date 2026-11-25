/**
 * DÓNDE VIVE EL MONEDERO, Y QUÉ NO SALE DE ÉL.
 *
 * ┌─ LO QUE ESTO CIERRA ──────────────────────────────────────────────────────────────────────────────┐
 * │ La pantalla nació como `/cobros` y como DESTINO DE LA BARRA, y las dos cosas estaban mal: la     │
 * │ barra es para lo que se hace a menudo —ver, participar, mirar tu perfil—, y cobrar no es eso.    │
 * │ Ocupaba un hueco de cinco a cambio de una acción que una persona hace, con suerte, una vez al    │
 * │ mes. Se movió a `/wallet` y se entra por las opciones del perfil.                                │
 * │                                                                                                  │
 * │ Un cambio así se deshace solo: basta con que alguien devuelva la clave al catálogo de la nav     │
 * │ "para que se encuentre mejor", o que deje el enlace viejo a `/cobros` en una pantalla que no se  │
 * │ volvió a abrir. Ninguna de las dos rompe nada que se vea.                                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y de paso, lo que el DTO ya garantiza en el servidor, aquí se mira en la superficie: los datos de
 * pago no se nombran en ninguna de las tres vistas del monedero, y solo hay UN sitio donde se
 * teclean —el formulario de métodos—, porque cada tecleo de un IBAN es una oportunidad de
 * equivocarse.
 *
 * Para romperlo a propósito: añadir "wallet" a `NAV_ESCRITORIO` (rojo), quitar el botón del perfil
 * (rojo), dejar un `href="/cobros"` en cualquier sitio (rojo), o pintar la dirección completa en la
 * lista de métodos (rojo).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { es } from "../src/textos/es";

import { NAV_DESTINOS, NAV_ESCRITORIO, NAV_MOVIL, NAV_MOVIL_MAS } from "../src/components/ui/logic";

const RAIZ = process.cwd();
const SHELL = join(RAIZ, "src", "app", "(app)", "(shell)");
const WALLET = join(SHELL, "wallet");

const crudo = (f: string) => readFileSync(join(WALLET, f), "utf8");
/** Sin comentarios: estos ficheros EXPLICAN por qué el IBAN no viaja; explicarlo no es impedirlo. */
const sinComentarios = (src: string) =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
const codigo = (f: string) => sinComentarios(crudo(f));

const VISTAS = [
  "page.tsx",
  "hero-monedero.tsx",
  "metodos-de-cobro.tsx",
  "pedir-cobro.tsx",
  "historial-retiradas.tsx",
  "informacion-cobro.tsx",
];

describe("la pantalla está en /wallet, y /cobros ya no existe", () => {
  it("las vistas del monedero están donde se dice", () => {
    for (const f of VISTAS) expect(existsSync(join(WALLET, f)), f).toBe(true);
  });

  it("y no queda una carpeta `cobros` que siga sirviendo la vieja", () => {
    // Un rename a medias deja DOS rutas vivas: la nueva y la que el buscador ya había indexado.
    expect(existsSync(join(SHELL, "cobros"))).toBe(false);
  });

  it("nadie enlaza a /cobros en todo `src`", () => {
    const sospechosos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "generated" && e.name !== "node_modules") recorrer(p);
        } else if (/\.(tsx?|css)$/.test(e.name)) {
          if (/["'`]\/cobros\b/.test(readFileSync(p, "utf8"))) {
            sospechosos.push(p.slice(RAIZ.length + 1));
          }
        }
      }
    };
    recorrer(join(RAIZ, "src"));
    expect(sospechosos, "queda un enlace a la ruta vieja").toEqual([]);
  });

  it("el detector funcionaría: encuentra la ruta NUEVA buscándola igual", () => {
    // Control del recorrido: si el barrido estuviera roto (mal filtro de extensión, directorio
    // equivocado), el caso de arriba pasaría en vacío y no diría nada.
    const encontrados: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "generated" && e.name !== "node_modules") recorrer(p);
        } else if (
          /\.(tsx?|css)$/.test(e.name) &&
          /["'`]\/wallet\b/.test(readFileSync(p, "utf8"))
        ) {
          encontrados.push(e.name);
        }
      }
    };
    recorrer(join(RAIZ, "src"));
    expect(encontrados.length).toBeGreaterThan(0);
  });
});

describe("se entra por el perfil, NO por la barra", () => {
  it("el monedero no es un destino del catálogo de la nav", () => {
    // El catálogo es de donde salen las dos barras: si la clave entra ahí, vuelve a la barra.
    // Las claves se comparan como STRING a propósito: el tipo literal de `NAV_DESTINOS` ya prueba
    // hoy que "wallet" no está —`tsc` rechaza la comparación—, y de un test que no compila nadie se
    // entera el día que la clave sí exista.
    const claves: readonly string[] = NAV_DESTINOS.map((d) => d.clave);
    const hrefs: readonly string[] = NAV_DESTINOS.map((d) => d.href);
    expect(hrefs).not.toContain("/wallet");
    expect(claves).not.toContain("wallet");
    expect(claves).not.toContain("cobros");
  });

  it("ni está en escritorio, ni en la barra de móvil, ni en el menú Más", () => {
    for (const lista of [NAV_ESCRITORIO, NAV_MOVIL, NAV_MOVIL_MAS]) {
      expect([...lista]).not.toContain("wallet");
      expect([...lista]).not.toContain("cobros");
    }
  });

  it("y el perfil propio tiene el botón que lleva allí", () => {
    // Si no está en la nav Y tampoco aquí, el monedero queda inalcanzable: una ruta que existe,
    // renderiza y pasa sus tests, sin una sola puerta. Es el fallo de `nav-movil-cobertura`, pero
    // para un destino que a propósito no está en la nav.
    const perfil = sinComentarios(readFileSync(join(SHELL, "perfil", "perfil-vista.tsx"), "utf8"));
    expect(perfil, "el perfil ya no lleva al monedero").toContain('href="/wallet"');
    // La etiqueta sale del diccionario desde la P5b2a: la clave en el perfil, el texto en `perfil`.
    expect(perfil).toContain('t("monedero")');
    expect(es.perfil.monedero).toMatch(/Mi monedero/);
  });
});

describe("los datos de pago no se nombran en la superficie", () => {
  it("ninguna vista menciona `datosPago`: lo que no llega no se puede pintar", () => {
    for (const f of VISTAS) {
      expect(codigo(f), `${f} nombra el dato cifrado`).not.toMatch(/datosPago/);
    }
  });

  it("la lista de métodos enseña la PISTA, no el destino", () => {
    const src = codigo("metodos-de-cobro.tsx");
    expect(src).toMatch(/m\.pista/);
    // Un `m.direccion` o `m.iban` ni existe en el DTO —no compilaría—, pero el día que alguien lo
    // añada "para que se vea mejor", esto es lo que se pone rojo primero.
    expect(src).not.toMatch(/m\.(iban|direccion|titular)/);
  });

  it("el botón dice REEMPLAZAR, porque editar sería una promesa que no se puede cumplir", () => {
    // ┌─ LA PALABRA ES PARTE DE LA DECISIÓN DE SEGURIDAD ───────────────────────────────────────┐
    // │ Los datos de pago se guardan cifrados y NO vuelven del servidor ni para su dueño. Por    │
    // │ eso el formulario no puede venir relleno, y por eso "Editar" mentía antes de que nadie   │
    // │ pulsara: prometía encontrar el IBAN escrito. Lo que ocurre es que se escribe otro y      │
    // │ sustituye al anterior. El día que alguien "mejore" el copy a "Editar", lo siguiente que  │
    // │ parecerá razonable es devolver el dato para rellenarlo — y ahí se acabó la puerta.       │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    // Desde la P5b2a la palabra vive en el diccionario (`cobros.reemplazar`): el botón pinta ESA clave,
    // y lo que se juzga es el código MÁS las frases del espacio.
    const src = `${codigo("metodos-de-cobro.tsx")}\n${Object.values(es.cobros).join("\n")}`;
    expect(es.cobros.reemplazar).toBe("Reemplazar");
    expect(src).toMatch(/>\s*\{t\("reemplazar"\)\}\s*</);
    // La palabra entera, no solo la del botón: la primera versión de este caso ataba la FORMA
    // `>Editar<` y dejaba pasar un `"Editar este método"` en el título del formulario, que promete
    // exactamente lo mismo. (`editando`/`setEditando` no casan: `\b` exige el corte después de
    // "Editar", y ahí sigue una "n".)
    expect(src, "el copy volvió a prometer que el formulario viene relleno").not.toMatch(
      /\bEditar\b/,
    );
  });

  it("y SOLO ahí se teclea un destino: el formulario de cobro no lo vuelve a pedir", () => {
    const pedir = codigo("pedir-cobro.tsx");
    expect(pedir, "el formulario de cobro vuelve a pedir el destino").not.toMatch(
      /id="(iban|direccion|titular)"/,
    );
    // Lo que manda es el id de un método guardado.
    expect(pedir).toMatch(/metodoPagoId/);
    expect(codigo("metodos-de-cobro.tsx")).toMatch(/id="iban"/);
  });
});

describe("la pantalla usa tokens, no colores", () => {
  it("ni un hex en las tres vistas", () => {
    // La regla de marca: un comentario nombra el token, nunca el color. Un hex aquí sobrevive al
    // siguiente repintado sin que nada falle.
    for (const f of VISTAS) {
      expect(crudo(f).match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], f).toEqual([]);
    }
  });

  it("el saldo lo pinta la primitiva del dinero, no un tamaño escrito a mano", () => {
    // `ImportePremio` es el tratamiento del dinero: Archivo Expanded, `--df-money` y el entero
    // mandando. Si el hero se pinta su propia cifra, el saldo y el premio de un reto —que son la
    // misma cantidad en dos pantallas— empiezan a verse distintos.
    const hero = codigo("hero-monedero.tsx");
    expect(hero).toMatch(/<ImportePremio/);
    expect(hero).toMatch(/tamano="heroe"/);
    expect(hero, "el hero escribe su propio tamaño de fuente").not.toMatch(/fontSize|text-\[clamp/);
  });

  it("y el halo del hero es el del ELEMENTO, no el glow de la vitrina", () => {
    // `--df-glow-vitrina` tiene dueño (`.df-rescoldo`) y una fuerza decidida para esa pantalla:
    // engancharse ahí es exactamente el fallo que `glow-por-tema` dejó cerrado.
    const hero = codigo("hero-monedero.tsx");
    expect(hero).toContain("df-halo");
    expect(hero).toContain('"--df-halo-color": "var(--df-money)"');
    expect(hero).not.toContain("--df-glow-vitrina");
  });

  it("el movimiento es SOLO `opacity`/`transform`, que es lo que el compositor sabe apagar", () => {
    // La regla global de `prefers-reduced-motion` mata animaciones y transiciones con `!important`
    // sobre `*`. Lo que se le escapa es el movimiento hecho desde JS, y una transición sobre una
    // propiedad que repinta (`height`, `background-position`) cuesta cada fotograma aunque nadie la
    // vea. Aquí solo se transiciona la ANCHURA de la barra del recorrido (una vez, al abrir) y el
    // giro de la flecha, que es un `transform`.
    for (const f of VISTAS) {
      const src = codigo(f);
      expect(src, `${f} anima desde JS`).not.toMatch(
        /requestAnimationFrame|\.animate\(|setInterval/,
      );
    }
  });
});

describe("la configuración del cobro NO depende del saldo", () => {
  const pagina = codigo("page.tsx");

  it("`MetodosDeCobro` se monta sin condición ninguna", () => {
    // ┌─ EL INVARIANTE QUE ESTABA DEL REVÉS ────────────────────────────────────────────────────┐
    // │ Estuvo escondido tras `saldo > 0` razonando que pedirle el IBAN a quien no tiene dinero  │
    // │ es pedirle un dato para nada. Pero guardar un método NO mueve dinero: esconderlo solo    │
    // │ conseguía que la primera vez que alguien gana se encontrara con DOS pasos justo cuando   │
    // │ quiere cobrar. Con saldo cero, dejarlo listo es lo único útil que se puede hacer aquí.   │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    const montaje = /<MetodosDeCobro[\s\S]{0,120}?\/>/.exec(pagina)?.[0];
    expect(montaje, "ya no se monta `MetodosDeCobro`").toBeTruthy();

    // Lo que se mira es si hay una CONDICIÓN delante: `{algo ? <MetodosDeCobro …`.
    const antes = pagina.slice(Math.max(0, pagina.indexOf("<MetodosDeCobro") - 120));
    expect(antes.slice(0, 120), "vuelve a estar detrás de una condición").not.toMatch(/\?\s*$/);
    expect(pagina, "ha vuelto la puerta del saldo a la configuración").not.toMatch(/hayDinero/);
  });

  it("y la puerta del saldo sigue puesta en PEDIR EL COBRO", () => {
    // La otra mitad: aflojar la de arriba no puede aflojar esta. Sin método no hay a dónde mandar
    // el dinero, y por debajo del mínimo no se pide.
    expect(pagina).toMatch(/\{llegaAlMinimo && metodos\.length > 0 \?\s*\(?\s*<PedirCobro/);
  });
});

describe("el mínimo es una regla, no un botón escondido", () => {
  it("la vista lo decide con la MISMA función pura que define la regla", () => {
    // Antes comparaba a mano contra la constante. `puedePedirCobro` es esa comparación con nombre:
    // un sitio donde está escrita, y el resto la usa.
    expect(codigo("page.tsx")).toMatch(/puedePedirCobro\(saldo\)/);
    const lib = sinComentarios(readFileSync(join(RAIZ, "src", "lib", "retirada.ts"), "utf8"));
    expect(lib).toMatch(/function puedePedirCobro[\s\S]{0,120}RETIRADA_MINIMA_CENTS/);
  });

  it("y la RUTA lo exige igual, con la misma constante", () => {
    // Esconder el formulario no es una regla: quien llame al endpoint a mano se lo salta. Y el
    // mínimo se lee de la constante en los dos sitios, porque dos números son dos números libres de
    // discrepar.
    const ruta = sinComentarios(
      readFileSync(join(RAIZ, "src", "app", "api", "retiradas", "route.ts"), "utf8"),
    );
    expect(ruta).toMatch(/min\(RETIRADA_MINIMA_CENTS\)/);
  });
});

describe("la información que hay que leer antes de cobrar", () => {
  const info = codigo("informacion-cobro.tsx");
  /** El texto como lo lee una persona: sin saltos de línea del JSX ni llaves de interpolación. */
  const plano = info.replace(/\{"\s*"\}/g, " ").replace(/\s+/g, " ");

  it("los dos textos están, literales", () => {
    // Desde la P5b2a viven en el diccionario, palabra por palabra, y la sección los pinta.
    expect(es.monedero.comoFuncionaTexto).toBe(
      "Al pedir un cobro, ese importe sale de tu saldo al momento, el equipo lo revisa y te lo envía por el método que elijas. Puede tardar unos días. Si lo rechazamos, el dinero vuelve entero a tu monedero.",
    );
    expect(es.monedero.comisionesTexto).toContain(
      // La marca la pone `t` desde `config/marca` (Fase 11 · PM1); el texto pintado es el mismo.
      "Las comisiones del banco corren por tu cuenta, no por la de {marca}. Recibirás el importe solicitado menos esas comisiones: si pides",
    );
    expect(plano).toContain('t("comoFuncionaTexto")');
    expect(plano).toContain('t("comisionesTexto"');
  });

  it("y las cifras del ejemplo de comisiones salen del formateador, no escritas a mano", () => {
    // "$50.00" escrito en el texto se queda clavado el día que cambie la moneda o el formato.
    expect(info).toMatch(/importeConMoneda\(5000, idioma\)/);
    expect(info).toMatch(/importeConMoneda\(4890, idioma\)/);
    expect(plano, "el importe del ejemplo está escrito a mano").not.toMatch(/\$\s?50\.00/);
    expect(es.monedero.comisionesTexto, "el importe del ejemplo está escrito a mano").not.toMatch(
      /\$\s?50\.00|\d/,
    );
  });

  it("todo va dentro del desplegable: ya no queda un aviso que no se pueda plegar", () => {
    // Hubo uno FUERA, siempre visible y en `--df-alarm`: el de la red de la cripto, el único que
    // costaba dinero irrecuperable si no se leía. Se fue con la cripto (Fase 11 · PC). Sin él, nada
    // de esta sección merece la alarma, y el desplegable es lo primero que hay.
    const desplegable = info.indexOf("<details");
    expect(desplegable, "ya no hay desplegable que mirar").toBeGreaterThan(-1);
    expect(info.slice(0, desplegable), "hay un bloque fuera del desplegable").not.toMatch(
      /<(div|p|h3)\b/,
    );
    expect(info, "vuelve a haber un aviso en color de alarma").not.toMatch(/\balarm\b/);
  });
});

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia todas las vistas", () => {
    for (const f of VISTAS) {
      expect(codigo(f).length, f).toBeLessThan(crudo(f).length);
    }
    // Control real: `pedir-cobro` EXPLICA en prosa por qué la clave se genera una vez por
    // intención, y esa palabra no aparece en el código (la variable se llama `clave`).
    expect(crudo("pedir-cobro.tsx")).toMatch(/idempotencia/i);
    expect(codigo("pedir-cobro.tsx")).not.toMatch(/idempotencia/i);
  });
});
