/**
 * LA PANTALLA DE BOOSTS — las decisiones que se pueden deshacer en silencio.
 *
 * Es la primera pantalla del producto que PIDE DINERO, así que lo que se fija aquí no es cómo queda:
 * es lo que no puede volver a pasar.
 *
 *  - CERO COLOR A MANO. Todo por token `--df-*`. Un hex se ve bien en UN tema y mal en el otro, y el
 *    tema claro no lo mira nadie hasta que un usuario lo activa.
 *  - CERO CIFRAS INVENTADAS. El saldo, el límite diario y los precios salen de su fuente. Y la
 *    DURACIÓN del puesto destacado no se dice: todavía no está decidida en el código.
 *  - UN SOLO BOTÓN PRINCIPAL en toda la pantalla (`--df-action` es una acción por pantalla).
 *  - LA PÁGINA EXIGE SESIÓN y lee `env` DENTRO de la función: en el build no hay variables, y un
 *    `import { env }` arriba tumbaría el despliegue.
 *  - NUNCA OFFSET: la lista pagina por keyset, como el resto del producto.
 *  - "PAGO RECIBIDO" NO ES "YA TIENES TUS BOOSTS": el webhook llega después, así que el aviso de
 *    vuelta no puede afirmar un abono que la pantalla no ha visto.
 *
 * Para romperlo: escribir un `#ff2e88` en cualquiera de las vistas (rojo), poner el "3" del límite a
 * mano (rojo), prometer una duración (rojo), hacer principales los tres botones de comprar (rojo),
 * subir el `import { env }` al ámbito de módulo (rojo), o decirle al usuario que ya tiene sus boosts
 * al volver de Stripe (rojo).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BOOST_DAILY_LIMIT, PAQUETES_BOOST } from "../src/config/constants";

const RAIZ = process.cwd();
const BOOSTS = ["src", "app", "(app)", "(shell)", "boosts"];

const crudo = (f: string) => readFileSync(join(RAIZ, ...BOOSTS, f), "utf8");
/** Sin comentarios: un docblock que EXPLIQUE la regla no la aplica. */
const leer = (f: string) =>
  crudo(f)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const VISTAS = [
  "page.tsx",
  "hero-boosts.tsx",
  "paquetes-boost.tsx",
  "como-funciona.tsx",
  "historial-boosts.tsx",
  "aviso-compra.tsx",
  "activar-boost.tsx",
] as const;

describe("el detector mira el CÓDIGO, no el comentario que lo explica", () => {
  it("quitar comentarios cambia el fichero de verdad", () => {
    // Control. Los ficheros EXPLICAN en sus docblocks lo que este test exige (hablan del límite, de
    // los tokens, de la duración). Si `leer` dejara de quitarlos, todo lo de abajo pasaría aunque el
    // JSX estuviera vacío.
    for (const f of VISTAS) {
      expect(leer(f).length, f).toBeLessThan(crudo(f).length);
    }
    expect(crudo("como-funciona.tsx")).toMatch(/~1h/);
    expect(leer("como-funciona.tsx")).not.toMatch(/~1h/);
  });
});

describe("cero color escrito a mano", () => {
  it.each(VISTAS)("%s no lleva ni un hex ni un rgb()", (f) => {
    const src = leer(f);
    expect(src, "hex a mano").not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(src, "rgb()/rgba() a mano").not.toMatch(/\brgba?\(/);
    expect(src, "hsl() a mano").not.toMatch(/\bhsla?\(/);
  });

  it("y el color que usa viene SIEMPRE de un token del sistema", () => {
    // Los `style` inline de esta sección existen (aro del medallón, mezcla del acento), pero todos
    // leen `var(--df-…)`. Lo que se prohíbe es inventar el valor, no usar `style`.
    const conColor = VISTAS.map(leer).join("\n");
    const varsUsadas = [...conColor.matchAll(/var\((--df-[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(
      varsUsadas.length,
      "la sección no usa ni un token: algo se ha escrito a pelo",
    ).toBeGreaterThan(5);
    const css = readFileSync(join(RAIZ, "src", "app", "globals.css"), "utf8");
    for (const v of new Set(varsUsadas)) {
      expect(css, `${v} no existe en globals.css`).toContain(`${v}:`);
    }
  });
});

describe("cero cifras inventadas", () => {
  it("el límite diario sale de BOOST_DAILY_LIMIT, no escrito a mano", () => {
    const hero = leer("hero-boosts.tsx");
    const como = leer("como-funciona.tsx");
    expect(hero).toContain("BOOST_DAILY_LIMIT");
    expect(como).toContain("BOOST_DAILY_LIMIT");
    // Y el valor de hoy NO aparece como literal al lado de "día": así, si el límite cambia a 5, no
    // queda un "3 al día" escrito en ninguna de las dos.
    for (const [f, src] of [
      ["hero-boosts.tsx", hero],
      ["como-funciona.tsx", como],
    ] as const) {
      expect(src, f).not.toMatch(new RegExp(`${BOOST_DAILY_LIMIT}\\s*(veces )?al d[íi]a`));
    }
  });

  it("los PRECIOS no están escritos en ninguna vista", () => {
    // Salen del catálogo vía `paquetesEnVenta`. Un "15 $" a mano es el segundo catálogo de siempre.
    const todo = VISTAS.map(leer).join("\n");
    for (const p of Object.values(PAQUETES_BOOST)) {
      expect(todo, `${p.precioCents} escrito a mano`).not.toMatch(
        new RegExp(`\\b${p.precioCents}\\b`),
      );
      expect(todo, `$${p.precioCents / 100} escrito a mano`).not.toMatch(
        new RegExp(`\\$\\s*${p.precioCents / 100}\\b`),
      );
    }
    expect(leer("paquetes-boost.tsx")).toContain("paquetesEnVenta");
  });

  it("el saldo del hero es el DATO, no un número de maqueta", () => {
    const hero = leer("hero-boosts.tsx");
    expect(hero).toMatch(/\{saldo\.toLocaleString/);
    // La cifra grande no puede ser un literal: una maqueta con "12" se queda puesta.
    expect(hero).not.toMatch(/>\s*\d+\s*</);
  });

  it("la DURACIÓN sale de BOOST_DURACION_MIN, nunca escrita en la pantalla", () => {
    // ESTA REGLA CAMBIÓ DE FORMA, no de fondo. Mientras la activación no existió, la duración NO se
    // decía: el esquema la dejaba en "~1h", que es una nota para nosotros y no un número decidido,
    // así que escribirla habría sido inventarse una promesa de producto. Ahora está decidida en
    // constants y se dice — pero DERIVADA, porque "1 hora" a mano se queda mintiendo el día que
    // pase a 90 minutos.
    const todo = VISTAS.map(leer).join("\n");
    expect(todo, "la duración no sale de la constante").toContain("BOOST_DURACION_MIN");
    expect(todo, "la frase no se deriva: se ha escrito a mano").toContain("duracionBoostHumana");
    // Y sigue sin haber ni un número junto a una unidad de tiempo en ninguna vista.
    expect(todo, "promete minutos u horas con una cifra escrita").not.toMatch(
      /\b\d+\s*(h\b|hora|horas|min\b|minuto|minutos)/i,
    );
    expect(todo, "promete una duración en palabras").not.toMatch(/durante (una|un|1)\s/i);
  });
});

describe("un solo botón principal en toda la pantalla", () => {
  /**
   * AHORA HAY DOS CANDIDATOS AL MAGENTA —destacar y comprar— y sólo puede haber uno. Esto NO se
   * puede fijar contando `variante="principal"` en el código: los dos están escritos, y cuál se
   * PINTA depende del saldo. Lo que se comprueba aquí es que la decisión existe y de qué depende; el
   * recuento de verdad, sobre el árbol renderizado, está en `tests/render/boost-activar` (el test de
   * composición). Los dos juntos son la red: sin el de render, poner los tres paquetes en magenta
   * pasaría de largo.
   */
  it("el de los paquetes NO es fijo: lo deciden `mejorPrecio` y si cede el acento", () => {
    const paq = leer("paquetes-boost.tsx");
    expect(paq).toMatch(/conAcento\(p\.mejorPrecio\) \? "principal" : "secundario"/);
    expect(paq).toMatch(/mejorPrecio && !cedeElAcento/);
  });

  it("y el de destacar NO SE PINTA sin saldo: por eso puede ser fijo", () => {
    // Si el componente no volviera `null`, con saldo cero habría dos magentas en pantalla.
    const act = leer("activar-boost.tsx");
    expect(act).toMatch(/if \(sinSaldo\) return null;/);
    expect(act).toMatch(/const sinSaldo = saldo <= 0;/);
  });

  it("la página decide quién lo lleva, y lo decide por el SALDO", () => {
    const page = leer("page.tsx");
    expect(page).toMatch(/const destacarEsLaAccion = saldo > 0;/);
    expect(page).toMatch(/cedeElAcento=\{destacarEsLaAccion\}/);
  });
});

describe("la página es honesta con el servidor", () => {
  const page = leer("page.tsx");

  it("exige sesión y vuelve a /boosts tras entrar", () => {
    expect(page).toContain('redirect("/entrar?siguiente=%2Fboosts")');
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

  it("las dos puertas de compra se resuelven en el servidor", () => {
    // Que el botón esté deshabilitado no protege nada —la barrera es la ruta—, pero pintar un botón
    // que va a fallar sí es un fallo de esta pantalla.
    expect(page).toContain("STRIPE_SECRET_KEY");
    expect(page).toContain("emailVerified");
    expect(page).toMatch(/puedeComprar\s*=\s*pagosConfigurados && correoVerificado/);
  });

  it("pagina por KEYSET, nunca por OFFSET", () => {
    expect(page, "cursor fuera").toContain("cursor");
    expect(page, "vuelve el OFFSET").not.toMatch(/(?<![-\w])offset\b/i);
    expect(page, "vuelve el skip de Prisma").not.toMatch(/\bskip\s*:/);
    expect(page).toContain("PasosKeyset");
  });

  it("y solo entiende los DOS valores de `?compra=` que escribe el checkout", () => {
    expect(page).toMatch(/"ok"/);
    expect(page).toMatch(/"cancelada"/);
    const ruta = readFileSync(
      join(RAIZ, "src", "app", "api", "boost", "checkout", "route.ts"),
      "utf8",
    );
    // Composición: los dos valores los escribe la ruta y los lee la página. Si uno cambia de nombre,
    // la pantalla deja de decir si se ha cobrado y nada falla.
    expect(ruta).toContain("/boosts?compra=ok");
    expect(ruta).toContain("/boosts?compra=cancelada");
  });
});

describe("la vuelta de Stripe no miente", () => {
  const aviso = leer("aviso-compra.tsx");

  it("«pago recibido» NO dice que los boosts ya estén", () => {
    // El webhook acredita por otro camino: al pintar esto, el saldo puede ser el de antes. Afirmar
    // el abono aquí es desmentirse a sí misma tres centímetros más arriba, en el hero.
    expect(aviso, "afirma un abono que no ha visto").not.toMatch(
      /acreditad|añadid|a[ñn]adido|ya tienes|se han sumado/i,
    );
    expect(aviso).toMatch(/Pago recibido/);
  });

  it("ni repite un número de boosts", () => {
    // Un "+5 Boosts" aquí sería la cifra del paquete comprado... que esta pantalla no sabe cuál es.
    const copy = [...aviso.matchAll(/>([^<>{}]{10,})</g)].map((m) => m[1]).join(" ");
    // SIN ESTA LÍNEA EL CASO PASA EN VACÍO: si el extractor dejara de encontrar texto (otro
    // marcado, otro formateo), `copy` sería "" y "no contiene cifras" sería cierto por vacuidad.
    expect(copy.length, "el extractor de copy no encuentra nada que mirar").toBeGreaterThan(40);
    expect(copy, "hay cifras en el copy de la vuelta").not.toMatch(/\d/);
  });

  it("y ofrece una salida que LIMPIA la query, no un refresco que la deja puesta", () => {
    // ESTA ASERCIÓN EXIGÍA `router.refresh()`, y era un bug vestido de invariante: `refresh()` no
    // quita `?compra=ok`, así que el aviso volvía al recargar y seguía puesto con el saldo ya al
    // día. Lo que de verdad lo cierra es navegar al pathname sin parámetros — y eso, además, trae
    // el saldo fresco, porque la página se renderiza por petición.
    expect(aviso).toMatch(/router\.replace\(pathname/);
    expect(aviso, "vuelve el refresh que dejaba el aviso pegado a la URL").not.toMatch(
      /router\.refresh\(/,
    );
    expect(aviso).toMatch(/Actualizar/);
  });

  it("el pendiente del botón es el de la TRANSICIÓN, no un estado propio", () => {
    // El otro bug: `setActualizando(true)` y nadie lo bajaba, porque `refresh()` no remonta. Y no
    // vale confiar en el desmontaje: una navegación que solo cambia la query NO recrea el segmento
    // (ver `router.bfcacheId` en la doc de Next), así que el estado de cliente se conserva.
    expect(aviso).toMatch(/useTransition\(\)/);
    expect(aviso, "vuelve el booleano que se quedaba colgado").not.toMatch(/setActualizando/);
  });

  it("CANCELAR no se pinta como un error, y también se puede quitar de la URL", () => {
    // Quien cierra el formulario cambió de idea. Un rojo le dice que algo se rompió por su culpa.
    const bloqueCancelada = /estado === "cancelada"[\s\S]*?\n  \}/.exec(aviso)?.[0] ?? "";
    expect(bloqueCancelada.length, "no encuentro la rama de cancelada").toBeGreaterThan(50);
    expect(bloqueCancelada, "la cancelación va en color de alarma").not.toContain("--df-alarm");
    expect(bloqueCancelada).toMatch(/No se te ha cobrado nada/);
    // Sin botón se quedaba pegada a `?compra=cancelada` igual que la otra.
    expect(bloqueCancelada).toMatch(/onClick=\{descartar\}/);
  });
});

/**
 * EL GUARD DE DOS LADOS, DESPUÉS DE DISPARARSE.
 *
 * Mientras no hubo activación, este bloque exigía el aviso "Activar un Boost todavía no está
 * disponible" Y que NO existieran la ruta ni el servicio. El segundo lado es el que importaba: al
 * construir la activación se puso rojo y obligó a venir aquí a retirar el aviso, en vez de dejarlo
 * puesto mintiendo al revés — que es lo que habría pasado con un guard de un solo lado.
 *
 * Ahora el bloque vigila lo contrario: que el aviso se haya ido y que lo que lo sustituyó exista de
 * verdad. Volver a escribir "todavía no está disponible" sobre algo que funciona cae en rojo.
 */
describe("activar existe, y la pantalla ya no dice lo contrario", () => {
  it("el aviso de «todavía no disponible» se retiró", () => {
    const todo = VISTAS.map(leer).join("\n");
    expect(todo, "la pantalla sigue diciendo que activar no existe").not.toMatch(
      /todav[íi]a no est[áa] disponible|pr[óo]ximamente/i,
    );
  });

  it("y la activación está construida de verdad: ruta, servicio y botón", () => {
    expect(
      existsSync(join(RAIZ, "src", "app", "api", "boost", "activar", "route.ts")),
      "falta la ruta de activar",
    ).toBe(true);
    expect(
      existsSync(join(RAIZ, "src", "server", "services", "boost-activacion.ts")),
      "falta el servicio de activación",
    ).toBe(true);
    // Y el botón llama a esa ruta: un servicio sin puerta no activa nada.
    expect(leer("activar-boost.tsx")).toContain('"/api/boost/activar"');
  });

  it("el botón gasta crédito interno: NO pasa por Stripe", () => {
    // El dinero se movió al comprar. Si esto llamara al checkout, destacar cobraría otra vez.
    const act = leer("activar-boost.tsx");
    expect(act).not.toMatch(/stripe|checkout/i);
  });
});

describe("el historial propio no enseña lo que no es suyo", () => {
  const servicio = readFileSync(
    join(RAIZ, "src", "server", "services", "boost-historial.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("el servicio NO pagina por OFFSET, ni con un `skip` inocente", () => {
    // Un `skip: 0` no hace daño HOY y es la puerta: el siguiente que toque esto lo verá y pondrá
    // ahí una cuenta. La paginación de este repositorio es por keyset, y punto.
    expect(servicio, "vuelve el skip de Prisma").not.toMatch(/\bskip\s*:/);
    expect(servicio, "vuelve el OFFSET").not.toMatch(/(?<![-\w])offset\b/i);
    // Y el desempate por `id` sigue ahí: sin él, dos filas con el mismo milisegundo se pierden o
    // repiten (es el caso de empate del test de comportamiento).
    expect(servicio).toMatch(/orderBy:\s*\[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  });

  it("la vista no puede pintar un refId ni un handle de admin: no los recibe", () => {
    const vista = leer("historial-boosts.tsx");
    expect(vista).not.toMatch(/refId|refType/);
    // El `select` de Prisma es la puerta: si vuelven ahí, vuelven al DTO.
    const select = /select:\s*\{[\s\S]*?\}/.exec(servicio)?.[0] ?? "";
    expect(select.length, "no encuentro el select del historial").toBeGreaterThan(20);
    expect(select, "el select vuelve a traer la referencia").not.toMatch(/refType|refId/);
  });
});
