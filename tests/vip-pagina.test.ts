/**
 * LA PÁGINA /vip — las decisiones que se pueden deshacer en silencio.
 *
 * Es la segunda pantalla del producto que PIDE DINERO, y la primera que pide dinero RECURRENTE. Lo
 * que se fija aquí no es cómo queda: es lo que no puede volver a pasar.
 *
 *  - QUIÉN ES VIP LO DICE EL CHOKEPOINT, nunca `?suscripcion=ok`. Ese parámetro lo escribe Stripe
 *    al devolver, o sea que lo puede teclear cualquiera en la barra de direcciones.
 *  - LA LISTA DE BENEFICIOS SALE DE `BENEFICIOS_VIP`, y nadie promete lo que no existe: ni
 *    "mensajes ilimitados", ni "sin anuncios", ni "acceso anticipado", NI SIQUIERA como
 *    "próximamente". Quien paga diez dólares al mes no distingue una intención de una promesa.
 *  - EL CTA SE COMPORTA COMO EL DE BOOST, y eso se comprueba comparando las dos condiciones
 *    CARÁCTER A CARÁCTER: si una de las dos pantallas cambia de criterio, la otra cae en rojo.
 *  - EL ORO DEL CTA ESTÁ EN UN SOLO SITIO (y no es `--df-action`): pasarlo al verde es una línea.
 *  - LA PUERTA DEL VIP VA EN ORO EN LAS DOS BARRAS, y del mismo sitio: en móvil el menú "Más" es su
 *    ÚNICA puerta.
 *  - CERO COLOR A MANO y cero cifras inventadas, como en /boosts.
 *
 * Para romperlo: elegir la tarjeta de "eres Mythic" con el parámetro de la URL (rojo), escribir un
 * beneficio a mano en la vista (rojo), poner "10$" en el botón (rojo), escribir el oro del CTA dos
 * veces o cambiarlo por `--df-action` sin tocar la línea del tono (rojo), pintar la fila del VIP en
 * verde (rojo), o cambiar la condición de pago de /boosts sin traerla aquí (rojo).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACENTO_VIP,
  NAV_DESTINOS,
  NAV_ESCRITORIO,
  NAV_MOVIL_MAS,
} from "../src/components/ui/logic";
import { BENEFICIOS_VIP, VIP_PRECIO_CENTS } from "../src/config/constants";
import { esVipActivo } from "../src/lib/vip";

const RAIZ = process.cwd();
const SHELL = ["src", "app", "(app)", "(shell)"];
const VIP = [...SHELL, "vip"];

/** Sin comentarios: un docblock que EXPLIQUE la regla no la aplica (y aquí varios la nombran). */
const sinComentarios = (src: string) =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const crudo = (f: string) => readFileSync(join(RAIZ, ...VIP, f), "utf8");
const leer = (f: string) => sinComentarios(crudo(f));
const leerRuta = (...p: string[]) => sinComentarios(readFileSync(join(RAIZ, ...p), "utf8"));

const VISTAS = [
  "page.tsx",
  "hero-vip.tsx",
  "beneficios-vip.tsx",
  "cta-vip.tsx",
  "aviso-suscripcion.tsx",
  "tarjeta-eres-vip.tsx",
  "cancelar-vip.tsx",
] as const;

describe("el detector mira el CÓDIGO, no el comentario que lo explica", () => {
  it("quitar comentarios cambia el fichero de verdad", () => {
    for (const f of VISTAS) {
      expect(leer(f).length, f).toBeLessThan(crudo(f).length);
    }
    // Control real: la página EXPLICA en prosa justo lo que este fichero prohíbe —habla de
    // `?suscripcion=ok` y de `--df-action`—. Si `leer` dejara de quitar comentarios, media
    // suite de abajo pasaría o fallaría por el texto y no por el código.
    expect(crudo("cta-vip.tsx")).toMatch(/--df-action/);
    expect(leer("cta-vip.tsx")).not.toMatch(/--df-action/);
  });
});

describe("cero color escrito a mano", () => {
  it.each(VISTAS)("%s no lleva ni un hex ni un rgb()", (f) => {
    const src = leer(f);
    expect(src, "hex a mano").not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src, "rgb()/rgba() a mano").not.toMatch(/\brgba?\(/);
    expect(src, "hsl() a mano").not.toMatch(/\bhsla?\(/);
  });

  it("y todos los tokens que usa existen en globals.css", () => {
    const todo = VISTAS.map(leer).join("\n");
    const usados = [...todo.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!);
    expect(usados.length, "la pantalla no usa ni un token: algo va a pelo").toBeGreaterThan(5);
    const css = readFileSync(join(RAIZ, "src", "app", "globals.css"), "utf8");
    for (const v of new Set(usados)) {
      // `--font-display` lo define el layout con la fuente; el resto vive en la paleta.
      if (v === "--font-display") continue;
      expect(css, `${v} no existe en globals.css`).toContain(`${v}:`);
    }
  });
});

describe("la página es honesta con el servidor", () => {
  const page = leer("page.tsx");

  it("exige sesión y vuelve a /vip tras entrar", () => {
    expect(page).toContain('redirect("/entrar?siguiente=%2Fvip")');
  });

  it("no se cachea", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("lee `env` DENTRO de la función, nunca en ámbito de módulo", () => {
    // Un `import { env } from "@/config/env"` arriba se evaluaría en el build, que corre SIN
    // variables: excepción -> despliegue caído. Ver CLAUDE.md.
    expect(page, "env importado en ámbito de módulo").not.toMatch(
      /^import[\s\S]*?from "@\/config\/env"/m,
    );
    expect(page).toMatch(/await import\("@\/config\/env"\)/);
  });

  it("y `prisma` igual: import dinámico dentro del handler", () => {
    expect(page).not.toMatch(/^import[\s\S]*?from "@\/server\/db\/client"/m);
    expect(page).toMatch(/await import\("@\/server\/db\/client"\)/);
  });
});

/**
 * EL NÚCLEO DE LA PIEZA. "Eres VIP" es un estado de PAGO: si lo decidiera la URL, cualquiera se lo
 * daría escribiendo `?suscripcion=ok`, y —lo que es peor y no se ve— un VIP de verdad que llegara
 * sin el parámetro vería el botón de suscribirse otra vez.
 */
describe("quién es VIP lo dice el CHOKEPOINT, no la URL", () => {
  const page = leer("page.tsx");

  it("la tarjeta de «eres Mythic» se elige con `vip.activo`, y con NADA más", () => {
    // El patrón no puede empezar en una llave cualquiera (`[^{}?]`): si no, el motor casaría desde
    // un `{` lejano y el caso pasaría mirando otra cosa.
    const selector = /\{\s*([^{}?]+?)\s*\?\s*\(?\s*<TarjetaEresVip/.exec(page)?.[1];
    expect(selector, "no encuentro la decisión que monta la tarjeta").toBeTruthy();
    // Exactamente eso: un `|| vuelta === "ok"` añadido para "evitar el parpadeo tras pagar" cae
    // aquí, que es justo el atajo que se escribe solo.
    expect(selector).toBe("vip.activo");
  });

  it("y `vip` sale del chokepoint, no de mirar el estado a mano", () => {
    expect(page).toMatch(/await import\("@\/server\/services\/vip"\)/);
    expect(page).toMatch(/vipDe\(prisma, sesion\.userId\)/);
    expect(page, "la página compara el estado por su cuenta").not.toMatch(/estado\s*===/);
    expect(page, "la página compara la fecha por su cuenta").not.toMatch(/periodoFin/);
  });

  it("el parámetro de vuelta SOLO alimenta el aviso", () => {
    // `vuelta` se usa dos veces y las dos son el aviso: la condición que lo monta y su prop.
    const usos = [...page.matchAll(/\bvuelta\b/g)].length;
    expect(usos, "`vuelta` se usa en más sitios que el aviso").toBe(3); // declaración + las dos
    expect(page).toMatch(/<AvisoSuscripcion estado=\{vuelta\} \/>/);
  });

  it("y solo entiende los DOS valores que escribe el checkout", () => {
    expect(page).toMatch(/sp\["suscripcion"\] === "ok"/);
    expect(page).toMatch(/sp\["suscripcion"\] === "cancelada"/);
    // Composición: los dos valores los escribe la RUTA y los lee la PÁGINA. Si uno cambia de
    // nombre, la pantalla deja de decir si se ha cobrado y no falla nada.
    const ruta = readFileSync(
      join(RAIZ, "src", "app", "api", "vip", "checkout", "route.ts"),
      "utf8",
    );
    expect(ruta).toContain("/vip?suscripcion=ok");
    expect(ruta).toContain("/vip?suscripcion=cancelada");
  });

  it("el aviso de vuelta NO afirma que ya seas VIP", () => {
    // El webhook escribe la suscripción por otro camino: al pintar esto, la página puede seguir
    // enseñando el botón de suscribirse un centímetro más abajo.
    const aviso = leer("aviso-suscripcion.tsx");
    expect(aviso, "afirma un estado que no ha visto").not.toMatch(
      /ya eres|eres vip|ya tienes|activado|acreditad/i,
    );
    expect(aviso).toMatch(/Pago recibido/);
    // Y limpia la query, que es lo que de verdad trae el estado nuevo (un `refresh` la dejaría
    // pegada a la URL: el fallo que ya se cometió en el aviso de Boost).
    expect(aviso).toMatch(/router\.replace\(pathname/);
    expect(aviso, "vuelve el refresh que dejaba el aviso pegado").not.toMatch(/router\.refresh\(/);
  });
});

/**
 * "El CTA se comporta EXACTAMENTE como el de comprar un Boost". Eso no se puede fijar leyendo esta
 * pantalla sola: se fija comparándola con la otra. Si /boosts endurece su condición —un tercer
 * requisito, otro orden— y aquí no, las dos pantallas empiezan a decir cosas distintas sobre si se
 * puede pagar, y eso no rompe nada hasta que alguien se queja.
 */
describe("las puertas de pago son LAS MISMAS que las de /boosts", () => {
  const page = leer("page.tsx");
  const boosts = leerRuta(...SHELL, "boosts", "page.tsx");

  /** El lado derecho de una asignación `const X = …;`, normalizado de espacios. */
  const expr = (src: string, nombre: string) =>
    new RegExp(`const ${nombre} =([\\s\\S]*?);\\n`).exec(src)?.[1]?.replace(/\s+/g, " ").trim();

  it("los extractores encuentran las dos expresiones (si no, todo lo de abajo pasa en vacío)", () => {
    expect(expr(page, "pagosConfigurados")).toBeTruthy();
    expect(expr(boosts, "pagosConfigurados")).toBeTruthy();
    expect(expr(page, "motivoBloqueo")).toBeTruthy();
    expect(expr(boosts, "motivoBloqueo")).toBeTruthy();
  });

  it("«hay pagos» se decide igual en las dos", () => {
    expect(expr(page, "pagosConfigurados")).toBe(expr(boosts, "pagosConfigurados"));
  });

  it("«correo verificado» se decide igual en las dos", () => {
    expect(expr(page, "correoVerificado")).toBe(expr(boosts, "correoVerificado"));
  });

  it("y se combinan igual: las dos puertas, no una", () => {
    expect(expr(page, "puedeSuscribirse")).toBe(expr(boosts, "puedeComprar"));
    expect(expr(page, "puedeSuscribirse")).toBe("pagosConfigurados && correoVerificado");
  });

  it("el motivo del bloqueo tiene la MISMA forma y el MISMO orden", () => {
    // Lo único que puede diferir es de qué constante sale el copy (MSG_VIP_* / MSG_BOOST_*): el
    // resto —qué se mira primero— es la decisión, y tiene que ser la misma. Si no hay claves, da
    // igual el correo: no hay nada que intentar.
    const forma = (s?: string) => s?.replace(/MSG_(VIP|BOOST)_/g, "MSG_");
    expect(forma(expr(page, "motivoBloqueo"))).toBe(forma(expr(boosts, "motivoBloqueo")));
  });

  it("el botón se deshabilita y DICE por qué, atado para quien usa lector de pantalla", () => {
    const cta = leer("cta-vip.tsx");
    expect(cta).toMatch(/disabled=\{!puedeSuscribirse \|\| abriendo\}/);
    expect(cta).toMatch(/aria-describedby=\{puedeSuscribirse \? undefined : "vip-bloqueo"\}/);
    expect(cta).toMatch(/id="vip-bloqueo"/);
  });

  it("y el flujo es el mismo: POST al checkout y salida DURA a Stripe", () => {
    const cta = leer("cta-vip.tsx");
    expect(cta).toContain('postJsonCsrf<{ url?: string }>("/api/vip/checkout", {})');
    // `router.push` no puede salir del sitio: el destino es otro origen.
    expect(cta).toMatch(/window\.location\.assign\(r\.data\.url\)/);
    expect(cta, "intenta salir del sitio con el router").not.toMatch(/router\.(push|replace)/);
  });
});

describe("el oro del CTA está en UN solo sitio", () => {
  const cta = leer("cta-vip.tsx");

  it("el tono es una línea, con el relleno y su tinta juntos", () => {
    // Juntos porque se eligen juntos: cambiar el relleno sin la tinta deja el texto ilegible
    // sobre el fondo nuevo.
    expect(cta).toMatch(/const TONO_CTA = \{[^}]*fondo: "var\(--vip-gold\)"[^}]*\}/);
    expect(cta).toMatch(/const TONO_CTA = \{[^}]*tinta: "var\(--vip-tinta\)"[^}]*\}/);
  });

  it("y el token no se repite: cambiarlo es cambiar esa línea", () => {
    expect((cta.match(/--vip-gold/g) ?? []).length, "el oro está escrito más de una vez").toBe(1);
    expect((cta.match(/--vip-tinta/g) ?? []).length, "la tinta está escrita más de una vez").toBe(
      1,
    );
    // Y el resto del botón lee del tono, no del token.
    expect(cta).toMatch(/backgroundColor: TONO_CTA\.fondo/);
    expect(cta).toMatch(/color: TONO_CTA\.tinta/);
  });

  it("NUNCA el verde de acción: ese está reservado a «Subir vídeo»", () => {
    expect(cta, "el CTA del VIP se ha puesto en --df-action").not.toMatch(/--df-action/);
    expect(cta, "el CTA usa la variante principal del sistema").not.toMatch(/variante="principal"/);
  });
});

describe("cero promesas de lo que no existe", () => {
  /** Lo que la maqueta listaba y NO está construido. Ni como beneficio ni como "próximamente". */
  const DEUDA =
    /mensajes ilimitados|sin anuncios|acceso anticipado|retos exclusivos|efectos especiales|pr[óo]ximamente/i;

  it("la lista de la pantalla sale de `BENEFICIOS_VIP`, no escrita a mano", () => {
    const ben = leer("beneficios-vip.tsx");
    expect(ben).toContain("BENEFICIOS_VIP");
    expect(ben).toMatch(/BENEFICIOS_VIP\.map\(/);
    // Ni un beneficio escrito en el JSX: ahí es donde entraría el que no existe.
    for (const b of BENEFICIOS_VIP) {
      expect(ben, `«${b}» escrito a mano en la vista`).not.toContain(b);
    }
  });

  it("ninguna vista de /vip promete nada de la deuda", () => {
    const todo = VISTAS.map(leer).join("\n");
    expect(todo.match(DEUDA)?.[0], "hay una promesa de algo que no existe").toBeUndefined();
  });

  it("ni la constante", () => {
    expect(BENEFICIOS_VIP.length, "la lista se ha quedado vacía").toBeGreaterThan(3);
    for (const b of BENEFICIOS_VIP) expect(b, b).not.toMatch(DEUDA);
  });

  it("ni los chips del perfil, que prometían «acceso anticipado» por su cuenta", () => {
    // El chip estaba antes que la lista y nadie lo miraba: una promesa en el perfil de quien ya
    // paga no es menos promesa que una en la página de venta.
    const perfil = leerRuta(...SHELL, "perfil", "perfil-vista.tsx");
    const chips = /data-vip-perks[\s\S]*?\]\.map/.exec(perfil)?.[0];
    expect(chips, "no encuentro los chips del perfil").toBeTruthy();
    expect(chips!.match(DEUDA)?.[0]).toBeUndefined();
  });
});

describe("cero cifras inventadas", () => {
  it("el precio sale de `VIP_PRECIO_CENTS` y no está escrito en ninguna vista", () => {
    const todo = VISTAS.map(leer).join("\n");
    expect(leer("hero-vip.tsx")).toContain("VIP_PRECIO_CENTS");
    const dolares = VIP_PRECIO_CENTS / 100;
    expect(todo, `${VIP_PRECIO_CENTS} escrito a mano`).not.toMatch(
      new RegExp(`\\b${VIP_PRECIO_CENTS}\\b`),
    );
    expect(todo, `${dolares}$ escrito a mano`).not.toMatch(
      new RegExp(`\\b${dolares}\\s*\\$|\\$\\s*${dolares}\\b`),
    );
  });

  it("y la fecha de renovación es la de la suscripción, no un «día X de cada mes»", () => {
    const tarjeta = leer("tarjeta-eres-vip.tsx");
    expect(tarjeta).toMatch(/vip\.hasta/);
    expect(tarjeta, "se ha deducido una cadencia en vez de leer la fecha").not.toMatch(
      /cada mes|mensualmente|d[íi]a \d/i,
    );
  });

  it("la letra pequeña del hero dice lo que pasa al cancelar", () => {
    const hero = leer("hero-vip.tsx");
    expect(hero).toMatch(/Cancela cuando quieras/);
    expect(hero).toMatch(/acceso hasta fin de periodo/);
  });
});

describe("darse de baja no corta el acceso", () => {
  it("la ruta existe y la isla la llama", () => {
    expect(
      existsSync(join(RAIZ, "src", "app", "api", "vip", "cancelar", "route.ts")),
      "falta la ruta de cancelar",
    ).toBe(true);
    expect(leer("cancelar-vip.tsx")).toContain('"/api/vip/cancelar"');
  });

  it("la ruta NO escribe en nuestra base de datos: eso es del webhook", () => {
    // Escribir aquí CANCELADA sería adelantarse: si Stripe rechazara la operación, tendríamos una
    // suscripción marcada de baja que sigue cobrando.
    const ruta = sinComentarios(
      readFileSync(join(RAIZ, "src", "app", "api", "vip", "cancelar", "route.ts"), "utf8"),
    );
    expect(ruta, "la ruta escribe la suscripción por su cuenta").not.toMatch(
      /subscription\.(update|upsert|create|delete)/,
    );
    expect(ruta).toMatch(/cancel_at_period_end: true/);
  });

  it("y una CANCELADA con el periodo por delante SIGUE siendo VIP", () => {
    // La promesa de la pantalla, comprobada contra el chokepoint y no contra la prosa.
    const manana = new Date(Date.now() + 86_400_000);
    const ayer = new Date(Date.now() - 86_400_000);
    expect(esVipActivo({ estado: "CANCELADA", periodoFin: manana })).toBe(true);
    expect(esVipActivo({ estado: "CANCELADA", periodoFin: ayer })).toBe(false);
  });

  it("la isla no afirma que la baja ya esté hecha: enseña el mensaje del SERVIDOR", () => {
    const cancelar = leer("cancelar-vip.tsx");
    expect(cancelar).toMatch(/r\.data\.mensaje/);
    expect(cancelar, "se inventa un copy de éxito").not.toMatch(
      /suscripci[óo]n cancelada|ya no eres|baja completada/i,
    );
  });

  it("y nunca de un toque: hay confirmación", () => {
    const cancelar = leer("cancelar-vip.tsx");
    expect(cancelar).toMatch(/"confirmando"/);
    expect(cancelar).toMatch(/setFase\("confirmando"\)/);
  });
});

describe("la puerta del VIP en las dos barras", () => {
  const nav = leerRuta("src", "components", "ui", "navegacion.tsx");
  const menu = leerRuta("src", "components", "ui", "menu-mas-movil.tsx");
  const logic = leerRuta("src", "components", "ui", "logic.ts");

  it("es un destino del catálogo, con su acento en el DATO", () => {
    const vip = NAV_DESTINOS.find((d) => d.clave === "vip");
    expect(vip, "no hay destino vip").toBeTruthy();
    expect(vip!.href).toBe("/vip");
    expect("acento" in vip! && vip.acento).toBe("vip");
  });

  it("se le enseña a TODO el mundo, VIP incluido", () => {
    // Esconderlo a quien ya es VIP dejaría la baja sin puerta: /vip es donde se cancela.
    expect(nav, "la barra esconde la puerta por rol o por estado").not.toMatch(
      /esVip\s*\?|esVipActivo|suscripcion/,
    );
  });

  it("y está en las dos barras: la lateral y, DERIVADO, el menú de móvil", () => {
    expect([...NAV_ESCRITORIO]).toContain("vip");
    expect([...NAV_MOVIL_MAS]).toContain("vip");
  });

  it("el oro sale de `ACENTO_VIP`, el MISMO para las dos", () => {
    expect(ACENTO_VIP.color).toBe("var(--vip-gold)");
    // ATADO AL `style`, no "mencionado": un `toMatch(/ACENTO_VIP/)` lo cumple la línea del import
    // aunque la fila se haya quedado sin el estilo. Pasó al romperlo a propósito en móvil.
    expect(nav).toMatch(/style=\{[^}]*ACENTO_VIP/);
    expect(menu).toMatch(/style=\{[^}]*ACENTO_VIP/);
    // Escrito a mano en cualquiera de los dos, el día que cambie quedaría una en el valor viejo.
    expect(nav, "el oro está escrito a mano en la lateral").not.toMatch(/--vip-gold/);
    expect(menu, "el oro está escrito a mano en el menú").not.toMatch(/--vip-gold/);
    expect(logic).toMatch(/color: "var\(--vip-gold\)"/);
  });

  it("y NUNCA es el verde de acción", () => {
    expect(JSON.stringify(ACENTO_VIP)).not.toMatch(/--df-action/);
  });

  it("la fila lleva ICONO: un destino sin dibujo sale como un hueco y no lo caza nada", () => {
    const iconos = /const ICONO: Record<string, ReactNode> = \{[\s\S]*?\n\};/.exec(nav)?.[0];
    expect(iconos, "no encuentro el mapa de iconos").toBeTruthy();
    for (const clave of NAV_ESCRITORIO) {
      expect(iconos, `el destino ${clave} no tiene icono`).toMatch(
        new RegExp(`\\n  ${clave}: svg\\(`),
      );
    }
  });
});
