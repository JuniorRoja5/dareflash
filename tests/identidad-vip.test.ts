/**
 * LA IDENTIDAD SE PINTA EN UN SOLO SITIO. Dos mitades, y las dos con dientes:
 *
 *  - EL CANDADO ESTRUCTURAL: fuera del panel, NINGUNA superficie pinta un nombre por su cuenta.
 *    Ni escribiendo un `@{usuario}` en el JSX, ni importando `@/lib/identidad` para resolverlo a
 *    mano. Todo —el nombre, el handle secundario y hasta el texto de un `aria-label`— sale de
 *    `components/ui/identidad-usuario`.
 *  - LA PUERTA DEL COLOR: lo que llega a una declaración CSS pasa por `lib/color-nombre`, y lo que
 *    pasa es la forma COMPLETA de un token nuestro. Nada más.
 *
 * ┌─ POR QUÉ EL CANDADO Y NO "acordarse de usar el componente" ──────────────────────────────────┐
 * │ Porque el fallo no es ruidoso. Una superficie nueva que escriba `<span>@{u.username}</span>` │
 * │ funciona perfectamente: pinta el nombre. Lo único que pasa es que a un VIP no se le ve el    │
 * │ sello NI el color JUSTO AHÍ, y nadie lo descubre hasta que lo dice el que paga. Son nueve    │
 * │ superficies hoy y van a ser más; "acordarse" nueve veces no es una garantía, es una          │
 * │ estadística.                                                                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EL PANEL QUEDA FUERA, Y ES A PROPÓSITO ─────────────────────────────────────────────────────┐
 * │ `src/app/panel/**` es gobierno: el admin mira cuentas, no un escaparate. Ahí un nombre es un │
 * │ identificador y pintarlo con el color que eligió su dueño —o con un sello— estorbaría a      │
 * │ quien está moderando. Así que el panel escribe sus `@{username}` a mano y este guard no lo   │
 * │ mira. Lo que NO se puede es ampliar esa excepción a una pantalla de usuario.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Para romperlo a propósito: escribir `<span>@{u.username}</span>` en cualquier vista de usuario
 * (rojo), importar `nombreMostrado` desde una vista (rojo), o quitarle a `NombreUsuario` la
 * comprobación de `esVip` antes de aplicar el color (rojo en el fichero de render).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { COLORES_NOMBRE_VIP, TOKEN_CSS } from "../src/config/constants";
import { colorDeNombre, esTokenSeguro, estiloNombreVip } from "../src/lib/color-nombre";
import { colorNombreSchema } from "../src/server/services/perfil";

const SRC = path.resolve(__dirname, "..", "src");
const leer = (rel: string): string => readFileSync(path.join(SRC, rel), "utf8");

/** El ÚNICO fichero que puede pintar un nombre. Todo lo demás pasa por él. */
const MODULO = "components/ui/identidad-usuario.tsx";

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** Sin comentarios: un comentario que menciona `@{username}` no pinta nada. */
const sinComentarios = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Todo lo de usuario: `app` y `components`, menos el panel y menos el propio módulo. */
const SUPERFICIES = [...ficheros(path.join(SRC, "app")), ...ficheros(path.join(SRC, "components"))]
  .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
  .filter((f) => !f.startsWith("app/panel/") && f !== MODULO)
  .map((f) => ({ f, codigo: sinComentarios(leer(f)) }));

describe("el candado: nadie pinta un nombre fuera del componente compartido", () => {
  it("se recorrieron las superficies de verdad (si no, lo de abajo no busca nada)", () => {
    // Sin esto, un fallo en el recorrido deja la lista vacía y los tres casos de abajo pasan en
    // verde sin mirar un solo fichero: el guard diría que todo está bien sin haber comprobado nada.
    expect(SUPERFICIES.length).toBeGreaterThan(50);
    expect(SUPERFICIES.some((x) => x.f.includes("feed-vertical"))).toBe(true);
  });

  it("ninguna escribe un `@{…username}` en el JSX", () => {
    const culpables = SUPERFICIES.filter((x) =>
      /@\{[^}]*\b(username|handle|usuario)\b[^}]*\}/i.test(x.codigo),
    ).map((x) => x.f);
    expect(culpables, "usa `<HandleUsuario>`: es la única puerta del handle").toEqual([]);
  });

  it("ninguna importa `@/lib/identidad`: la identidad entra por UNA puerta", () => {
    // Incluido el texto para un `aria-label`. La puerta cerrada del todo es lo que hace la regla
    // comprobable: distinguir un `nombreMostrado` que va a un atributo de uno que va al JSX no se
    // puede hacer con fiabilidad en cuanto alguien lo guarda antes en una variable.
    const culpables = SUPERFICIES.filter((x) => x.codigo.includes('from "@/lib/identidad"')).map(
      (x) => x.f,
    );
    expect(culpables, "usa `textoNombre`/`conHandleSecundario` del módulo de identidad").toEqual(
      [],
    );
  });

  it("y el módulo sí la importa: el helper no se ha duplicado por el camino", () => {
    // Al revés también importa: si el módulo dejara de usar `nombreMostrado` y escribiera su
    // propia regla, habría DOS formas de decidir qué nombre se enseña.
    expect(leer(MODULO)).toContain('from "@/lib/identidad"');
  });

  it("las superficies que enseñan gente montan `NombreUsuario`", () => {
    // El candado de arriba prohíbe la forma vieja; este exige la nueva. Sin él, una vista podría
    // "cumplir" simplemente dejando de pintar el nombre.
    const conNombre = [
      "components/feed/comentarios-video.tsx",
      "components/ui/marca-boost.tsx",
      "components/ui/fila-puesto.tsx",
      "components/ui/tarjeta-destacado.tsx",
      "app/(app)/(shell)/ranking/podio-ranking.tsx",
      "app/(app)/(shell)/retos/[codigo]/participaciones-reto.tsx",
      "app/(app)/(shell)/perfil/perfil-vista.tsx",
      "app/(app)/(shell)/buscador-barra.tsx",
      "app/(app)/(shell)/buscar/buscar-cliente.tsx",
      "app/(app)/(shell)/referidos/page.tsx",
    ];
    for (const f of conNombre) {
      expect(sinComentarios(leer(f)), `${f} ya no monta NombreUsuario`).toContain("<NombreUsuario");
    }
  });

  it("el feed pinta sus DOS maquetas con la misma pieza", () => {
    // Móvil (sobre el vídeo) y escritorio (panel lateral) ya divergieron una vez. Las dos salen de
    // `AutorFeed`, y `AutorFeed` recibe el nombre SIN resolver: así no puede pintarlo por su cuenta.
    const feed = sinComentarios(leer("components/feed/feed-vertical.tsx"));
    expect([...feed.matchAll(/<AutorFeed/g)]).toHaveLength(2);
    expect(feed).not.toMatch(/nombre=\{/);
  });

  /**
   * ESTE CASO CAMBIÓ DE FORMA CON LA MARCA DUPLICADA, y es la tercera vez que se reescribe en vez
   * de borrarse.
   *
   * Decía: "la marca solo entra en un avatar por la puerta de `esVip`" —`Avatar` era el único que
   * montaba `MarcaVipEsquina`, detrás de su comprobación—. Pero la marca del avatar SOBRABA: en una
   * fila salía "VIP" en el avatar y "VIP" otra vez junto al nombre, a dos centímetros. Se quitó.
   *
   * Lo que queda debajo es más fuerte, no más débil: el avatar NO PUEDE pintar la marca, porque no
   * recibe `esVip` ni importa la pieza. Un sitio menos por el que podría llegarle a quien no paga.
   */
  it("el AVATAR no pinta la marca: no la importa y no sabe quién es VIP", () => {
    const avatar = sinComentarios(leer("components/ui/avatar.tsx"));
    expect(avatar, "el avatar volvió a montar la marca").not.toContain("MarcaVip");
    expect(avatar, "el avatar volvió a recibir `esVip`").not.toMatch(/\besVip\b/);
  });

  /**
   * ESTE CASO SE ABRIÓ EN P7, y la distinción que lo abre es la que importa.
   *
   * Decía: NINGUNA superficie monta `MarcaVip` a mano. La razón era que la marca dice "esta PERSONA
   * es VIP", y dicha a mano podría acabar sobre quien no paga sin pasar por el candado de
   * `NombreUsuario`. Con los retos exclusivos hay un uso que NO es ese: la chapa de un reto dice
   * "este RETO es de Mythic" — habla del reto, no de nadie—, y el panel la pinta para que el admin
   * vea cuáles lo son.
   *
   * Así que la regla se parte en dos, y la segunda mitad es la que de verdad protegía:
   *   - la lista de sitios que la montan fuera del módulo es CERRADA (abajo, uno a uno);
   *   - y NINGUNO de ellos pinta PERSONAS: una superficie que monte `<NombreUsuario` no puede
   *     además montar la marca a mano, porque ahí sí volvería a significar "esta persona paga".
   */
  /** Fuera del módulo y fuera del panel (que `SUPERFICIES` no recorre: tiene su bloque abajo). */
  const MONTAN_LA_MARCA = [
    // La chapa del reto exclusivo. Habla del RETO. La montan la tarjeta del listado y la ficha.
    "app/(app)/(shell)/retos/chapa-exclusivo.tsx",
  ];

  it("fuera del módulo, la marca solo se monta en los sitios declarados", () => {
    const montan = SUPERFICIES.filter((x) => /<MarcaVip[\s/>]/.test(x.codigo))
      .map((x) => x.f)
      .sort();
    expect(montan).toEqual([...MONTAN_LA_MARCA].sort());
    // Y el control de que el detector encuentra algo cuando lo hay: en el módulo SÍ está.
    expect(sinComentarios(leer(MODULO))).toMatch(/<MarcaVip[\s/>]/);
  });

  it("y ninguno de esos sitios pinta PERSONAS: ahí la marca volvería a significar otra cosa", () => {
    for (const f of [...MONTAN_LA_MARCA, "app/panel/lista-retos.tsx"]) {
      const src = sinComentarios(leer(f));
      expect(src, `${f} monta la marca Y pinta nombres`).not.toContain("<NombreUsuario");
      expect(src, `${f} monta la marca Y pinta avatares`).not.toContain("<Avatar");
    }
  });
});

describe("el panel queda fuera a propósito, y se puede comprobar", () => {
  it("sigue escribiendo sus handles a mano: la excepción está VIVA, no aparcada", () => {
    // Una excepción para una carpeta que ya no la usa es una puerta abierta que nadie vigila. Si
    // el panel algún día pasa por el componente, este caso cae y toca borrar la excepción.
    const delPanel = ficheros(path.join(SRC, "app", "panel"))
      .map((f) => sinComentarios(readFileSync(f, "utf8")))
      .filter((c) => /@\{[^}]*username[^}]*\}/.test(c));
    expect(delPanel.length).toBeGreaterThan(0);
  });

  it("y no marca a las PERSONAS: el gobierno de cuentas no es un escaparate", () => {
    // Lo que no puede pasar en el panel es que una CUENTA salga dorada: quien modera no debería
    // ver primero que alguien paga. Marcar un RETO como exclusivo es otra cosa —es un dato del
    // reto, y el admin lo necesita—, así que `lista-retos` está exenta y enumerada arriba.
    const conMarca = ficheros(path.join(SRC, "app", "panel"))
      .map((f) => ({
        f: path.relative(SRC, f).split(path.sep).join("/"),
        c: readFileSync(f, "utf8"),
      }))
      .filter((x) => x.c.includes("<NombreUsuario") || x.c.includes("<MarcaVip"))
      .map((x) => x.f);
    expect(conMarca).toEqual(["app/panel/lista-retos.tsx"]);
    // Y esa exención sigue siendo lo que dice ser: pinta la marca y NO pinta nombres.
    const lista = sinComentarios(leer("app/panel/lista-retos.tsx"));
    expect(lista).toContain("<MarcaVip");
    expect(lista, "el panel de retos empezó a pintar identidades").not.toContain("<NombreUsuario");
  });
});

describe("la puerta del color: solo pasa un token nuestro, entero", () => {
  it("una clave del catálogo da su `var(--token)`", () => {
    for (const [clave, token] of Object.entries(COLORES_NOMBRE_VIP)) {
      expect(colorDeNombre(clave)).toBe(`var(${token})`);
    }
  });

  it("y el estilo lo pone como VARIABLE, nunca como `color:` suelto", () => {
    expect(estiloNombreVip("verde")).toEqual({ "--vip-name": "var(--vip-nombre-verde)" });
  });

  /**
   * UNA CLAVE RETIRADA SE TRATA COMO "SIN COLOR" — y este caso es lo que permite encoger el
   * catálogo sin migrar la columna de nadie.
   *
   * "oro" estuvo en el set y salió: en el tema oscuro el nombre dorado queda a dE 6,4 de
   * `--df-rank`, así que en el podio se leía como el oro del PUESTO. Quien lo tuviera guardado no
   * puede romper nada: ni una excepción, ni un `var(--vip-nombre-oro)` apuntando a un token que ya
   * no existe (que dejaría el nombre en `currentColor`, indistinguible, sin que fallara nada).
   */
  it("una clave RETIRADA del catálogo se pinta como un nombre normal", () => {
    expect(colorDeNombre("oro")).toBeNull();
    expect(estiloNombreVip("oro")).toBeUndefined();
    // Y el token tampoco sigue por ahí: un valor huérfano en el CSS es el otro medio arreglo.
    expect(Object.values(COLORES_NOMBRE_VIP)).not.toContain("--vip-nombre-oro");
  });

  it("el dorado NO es un color de nombre, pero SÍ sigue siendo el del sello", () => {
    // La decisión es "el oro no colorea texto", no "fuera el oro": el sello y la gema se separan
    // del podio por FORMA —estrella con gema contra medalla redonda—, así que ahí no chocan.
    expect(Object.keys(COLORES_NOMBRE_VIP)).not.toContain("oro");
    expect(leer("components/ui/identidad-usuario.tsx")).toContain("var(--vip-gold)");
  });

  /**
   * LAS CARGAS. El vector es el de postcss: un valor que se cuela en una declaración CSS y cierra
   * la regla, la etiqueta `<style>` y abre lo que quiera. Van en MAYÚSCULAS y minúsculas, con y
   * sin `#`, porque un filtro escrito a ojo suele mirar solo una de las dos formas.
   */
  const CARGAS = [
    "e8f620;}</style><script>alert(1)</script>",
    "#e8f620;}</style><script>alert(1)</script>",
    "E8F620;}</STYLE><SCRIPT>ALERT(1)</SCRIPT>",
    "#E8F620;}</STYLE><SCRIPT>ALERT(1)</SCRIPT>",
    "--vip-nombre-verde;}</style>",
    "--vip-nombre-verde)</style>",
    "red;}body{display:none",
    "var(--vip-nombre-verde)",
    "expression(alert(1))",
    "url(javascript:alert(1))",
    "#fff",
    "#FFFFFF",
    "#e8f620",
    "verde ",
    " verde",
    "VERDE",
    "Verde",
    "",
    "undefined",
    "__proto__",
    "constructor",
    "toString",
  ];

  for (const carga of CARGAS) {
    it(`rechaza ${JSON.stringify(carga)}`, () => {
      expect(colorDeNombre(carga), "esa clave salió con color").toBeNull();
      expect(estiloNombreVip(carga), "esa clave salió con estilo").toBeUndefined();
      // Y la puerta de bajo nivel también: lo que no es un token entero no es un token.
      expect(esTokenSeguro(carga), "esa carga pasó por token válido").toBe(false);
    });
  }

  it("`null` y `undefined` no son un color (y no revientan)", () => {
    expect(colorDeNombre(null)).toBeNull();
    expect(colorDeNombre(undefined)).toBeNull();
    expect(estiloNombreVip(null)).toBeUndefined();
  });

  it("el patrón está anclado por los DOS extremos", () => {
    // Con `\b` en vez de `$`, "--vip-nombre-verde</style>" casaría y la carga entraría entera.
    expect(TOKEN_CSS.source.startsWith("^")).toBe(true);
    expect(TOKEN_CSS.source.endsWith("$")).toBe(true);
    expect(TOKEN_CSS.test("--vip-nombre-verde</style>")).toBe(false);
    expect(TOKEN_CSS.test(" --vip-nombre-verde")).toBe(false);
    expect(TOKEN_CSS.test("--vip-nombre-verde ")).toBe(false);
  });

  it("el catálogo no contiene NADA que no sea un token: la 1ª capa tampoco cede", () => {
    for (const token of Object.values(COLORES_NOMBRE_VIP)) {
      expect(esTokenSeguro(token), `${token} no es un nombre de token`).toBe(true);
      expect(token.startsWith("--vip-nombre-"), `${token} no es de la familia`).toBe(true);
    }
  });

  /**
   * LA SEGUNDA CAPA, EJERCITADA DE VERDAD — y hubo que buscarle la forma.
   *
   * Desde fuera no se puede alcanzar: la clave pasa primero por el `enum`, así que una carga muere
   * ahí y nunca llega al guard del token. O sea que el guard se podía BORRAR y todos los casos de
   * arriba seguían en verde: una red de seguridad que nadie estaba sujetando. Lo que la reproduce
   * es envenenar el CATÁLOGO, que es exactamente el escenario para el que existe —el día que
   * alguien escriba ahí un color, un `rgb(...)` o algo peor—.
   */
  it("si el CATÁLOGO se envenena, no sale nada (y el veneno no llega al CSS)", async () => {
    vi.resetModules();
    vi.doMock("@/config/constants", async () => {
      const real =
        await vi.importActual<typeof import("../src/config/constants")>("@/config/constants");
      return {
        ...real,
        // SE ENVENENA UNA CLAVE VIVA, y eso no es un detalle: con una clave que ya no existe en
        // el catálogo, quien la rechazaría sería el `enum` —antes de llegar al guard del token—,
        // y este caso pasaría en verde sin haber ejercitado la segunda capa ni una vez.
        COLORES_NOMBRE_VIP: {
          ...real.COLORES_NOMBRE_VIP,
          lima: "--vip-nombre-lima;}</style><script>alert(1)</script>",
        },
      };
    });
    try {
      const envenenado = await import("../src/lib/color-nombre");
      expect(envenenado.colorDeNombre("lima")).toBeNull();
      expect(envenenado.estiloNombreVip("lima")).toBeUndefined();
      // Las demás claves siguen funcionando: el guard para LO MALO, no la función entera.
      expect(envenenado.colorDeNombre("verde")).toBe("var(--vip-nombre-verde)");
    } finally {
      vi.doUnmock("@/config/constants");
      vi.resetModules();
    }
  });

  it("y el componente no construye CSS a mano en ninguna parte", () => {
    // El vector entero es escribir el valor DENTRO de un `<style>` o concatenarlo en una cadena de
    // estilo. Aquí el valor viaja como objeto de React, que escapa por construcción.
    const modulo = leer(MODULO);
    expect(modulo).not.toContain("<style");
    expect(modulo).not.toContain("dangerouslySetInnerHTML");
    expect(modulo, "no concatena el color en una cadena de estilo").not.toMatch(
      /style=\{`|style="\$\{/,
    );
  });
});

describe("la puerta del SERVIDOR: lo que se guarda es una clave, no un color", () => {
  it("acepta exactamente las claves del catálogo", () => {
    for (const clave of Object.keys(COLORES_NOMBRE_VIP)) {
      expect(colorNombreSchema.safeParse(clave).success).toBe(true);
    }
  });

  it("acepta `null`: quitarse el color es una elección válida", () => {
    expect(colorNombreSchema.safeParse(null).success).toBe(true);
  });

  it("rechaza un color, una carga, y cualquier cosa que no sea de la lista", () => {
    const fuera = [
      "#e8f620",
      "#E8F620",
      "e8f620;}</style><script>alert(1)</script>",
      "#e8f620;}</style>",
      "var(--vip-nombre-verde)",
      "--vip-nombre-verde",
      "VERDE",
      "verde ",
      // Las retiradas entran por aquí igual que cualquier palabra que no esté en la lista.
      "oro",
      "rojo",
      "",
      0,
      1,
      true,
      {},
      [],
    ];
    for (const v of fuera) {
      expect(colorNombreSchema.safeParse(v).success, `coló ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it("la lista del servidor SALE del catálogo: no se pueden desincronizar", () => {
    // Una segunda lista escrita a mano se queda corta el día que entre un color nuevo, y el
    // usuario elegiría una opción que el servidor rechaza sin decir por qué.
    for (const clave of Object.keys(COLORES_NOMBRE_VIP)) {
      expect(colorDeNombre(clave)).not.toBeNull();
    }
    // Cuatro: verde, lima, diamante y fuego. El dorado salió por chocar con el oro del podio.
    expect(Object.keys(COLORES_NOMBRE_VIP).sort()).toEqual(["diamante", "fuego", "lima", "verde"]);
  });
});
