/**
 * EL NIVEL SE VE EN TODOS LOS AVATARES — el diente que faltaba.
 *
 * `Avatar` acepta `puntos` de forma OPCIONAL (hay sitios donde la pantalla de verdad no los conoce),
 * y esa comodidad tuvo un precio: durante una versión entera "el nivel se ve en toda la plataforma"
 * fue mentira, porque la mayoría de los llamadores no lo pasaban —el feed ni siquiera dibujaba el
 * avatar del dueño—. Ningún test lo vio, porque cada pantalla por separado estaba bien.
 *
 * Así que aquí se afirma lo que ninguna pantalla puede afirmar sola: TODO `<Avatar>` del producto
 * recibe `puntos`, salvo las excepciones que se listan abajo UNA A UNA y con su motivo. Quitarle los
 * puntos a cualquiera -> rojo. Añadir un avatar nuevo sin ellos -> rojo.
 *
 * Se mira el CÓDIGO y no el render a propósito: un test de render solo ve las pantallas que alguien
 * se acordó de montar, y el agujero estaba justamente en las que nadie montó.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const SRC = join(RAIZ, "src");

/**
 * Los avatares que pueden ir sin nivel, cada uno con su razón.
 *
 * HOY ESTÁ VACÍA, y eso es el resultado, no un descuido: no hizo falta ninguna excepción. Al
 * invitado no se le pinta un `Avatar` sino una silueta propia (`SiluetaInvitado`), así que ni
 * siquiera entra aquí. La lista existe para que, el día que alguien necesite una, tenga que
 * ESCRIBIR POR QUÉ en vez de colarla en silencio — y para que se vea crecer en la revisión.
 */
const SIN_NIVEL_JUSTIFICADO: Record<string, string> = {};

const ficheros = (dir: string, salida: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "generated") ficheros(p, salida);
    } else if (e.endsWith(".tsx")) salida.push(p);
  }
  return salida;
};

/** Cada `<Avatar …/>` de un fichero, con su línea y su texto completo. */
function avataresDe(codigo: string): { linea: number; texto: string }[] {
  const salida: { linea: number; texto: string }[] = [];
  const lineas = codigo.split("\n");
  for (let i = 0; i < lineas.length; i += 1) {
    if (!/<Avatar[\s/>]/.test(lineas[i]!)) continue;
    // Se junta hasta el cierre de la etiqueta: las props pueden estar repartidas en varias líneas.
    let texto = "";
    for (let j = i; j < Math.min(i + 12, lineas.length); j += 1) {
      texto += lineas[j];
      if (lineas[j]!.includes("/>")) break;
    }
    salida.push({ linea: i + 1, texto });
  }
  return salida;
}

describe("cobertura del nivel", () => {
  const TSX = ficheros(SRC);

  it("hay avatares que revisar (si esto falla, el recorrido está roto)", () => {
    const conAvatar = TSX.filter((p) => /<Avatar[\s/>]/.test(readFileSync(p, "utf8")));
    expect(conAvatar.length).toBeGreaterThanOrEqual(8);
  });

  it("TODO `<Avatar>` recibe `puntos`, salvo las excepciones justificadas", () => {
    const huecos: string[] = [];
    for (const p of TSX) {
      // El componente en sí no se cuenta: es quien DEFINE la prop, no quien la pasa.
      if (p.endsWith(join("components", "ui", "avatar.tsx"))) continue;
      const rel = relative(RAIZ, p).split(sep).join("/");
      for (const a of avataresDe(readFileSync(p, "utf8"))) {
        if (/\bpuntos=/.test(a.texto)) continue;
        // ¿Está justificado? La clave lleva el fichero; el sufijo lo pone quien justifica.
        const justificado = Object.keys(SIN_NIVEL_JUSTIFICADO).some((k) => k.startsWith(`${rel}:`));
        if (!justificado) huecos.push(`${rel}:${a.linea}`);
      }
    }
    expect(huecos).toEqual([]);
  });

  it("y hoy no hace falta NINGUNA excepción (si esta lista crece, revísala)", () => {
    expect(Object.keys(SIN_NIVEL_JUSTIFICADO)).toEqual([]);
  });

  it("las superficies donde MÁS gente ve a otra gente lo pintan de verdad", () => {
    /**
     * Nombradas una a una: son las que el encargo decía "toda la plataforma" y no lo estaban.
     *
     * ┌─ ALGUNAS PINTAN LA PERSONA A TRAVÉS DE UNA PRIMITIVA ───────────────────────────────────┐
     * │ Este caso exigía el literal `<Avatar` en cada fichero, y eso identificaba el concepto    │
     * │ por una PALABRA: se puso rojo cuando el feed pasó a pintar al autor con `AutorFeed` —una │
     * │ primitiva compartida con la vitrina, que dentro monta el `<Avatar>` con sus `puntos`—.   │
     * │ El nivel seguía ahí; lo que se movió fue el nombre del componente.                       │
     * │                                                                                          │
     * │ Así que cada superficie declara CÓMO pinta a la persona. Lo que se sigue exigiendo es lo  │
     * │ mismo: que el nivel viaje (`puntos=`). Y si la pinta por primitiva, el otro caso de este  │
     * │ fichero —"TODO `<Avatar>` recibe `puntos`"— cubre el interior, porque la primitiva vive   │
     * │ bajo `src` y se recorre igual.                                                           │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const IMPRESCINDIBLES: { rel: string; via?: RegExp }[] = [
      // El feed: el avatar del dueño del vídeo, a través del bloque de autor compartido con la
      // vitrina (el feed pinta DOS maquetas, y así no pueden divergir).
      { rel: "src/components/feed/feed-vertical.tsx", via: /<AutorFeed[\s/>]/ },
      { rel: "src/components/feed/comentarios-video.tsx" },
      { rel: "src/app/(app)/(shell)/menu-cuenta.tsx" },
      { rel: "src/app/(app)/(shell)/buscador-barra.tsx" },
      { rel: "src/app/(app)/(shell)/buscar/buscar-cliente.tsx" },
      { rel: "src/app/(app)/(shell)/perfil/perfil-vista.tsx" },
      { rel: "src/app/(app)/(shell)/ranking/podio-ranking.tsx" },
      { rel: "src/components/ui/fila-puesto.tsx" },
      { rel: "src/app/panel/usuarios/ficha.tsx" },
    ];
    for (const { rel, via } of IMPRESCINDIBLES) {
      const codigo = readFileSync(join(RAIZ, ...rel.split("/")), "utf8");
      const pinta = via ?? /<Avatar[\s/>]/;
      expect(pinta.test(codigo), `${rel}: no pinta a la persona`).toBe(true);
      expect(/\bpuntos=/.test(codigo), `${rel}: la pinta sin nivel`).toBe(true);
    }
  });

  it("y la primitiva por la que pasa el feed monta el avatar CON su nivel", () => {
    // El otro lado de la excepción de arriba: si `AutorFeed` dejara de pasar `puntos`, el feed se
    // quedaría sin nivel y el caso de arriba seguiría verde (él solo mira el fichero del feed).
    const marca = readFileSync(join(RAIZ, "src", "components", "ui", "marca-boost.tsx"), "utf8");
    expect(/<Avatar[\s/>]/.test(marca), "la primitiva ya no monta un avatar").toBe(true);
    expect(/puntos=\{puntos\}/.test(marca), "la primitiva pinta sin nivel").toBe(true);
  });
});

describe("el dato viaja en los SELECT que ya se hacían", () => {
  it("los DTO que pintan avatares traen `pointsBalance` en su propia consulta", () => {
    // Cero N+1 POR CONSTRUCCIÓN: el nivel sale de una columna del `select` que ya traía el nombre,
    // no de un lookup por fila. Si alguien quitara la columna, tendría que añadir una consulta.
    // Los que leen con Prisma: la columna tiene que estar DENTRO del `select` de la relación del
    // usuario. Buscar `pointsBalance` en todo el fichero no vale —también aparece en el mapeador— y
    // eso dejaba pasar quitarla de la consulta. Lo destapó romperlo a propósito.
    const CON_RELACION = [
      "src/server/services/feed.ts",
      "src/server/services/participaciones-lista.ts",
      "src/server/services/comentarios.ts",
    ];
    for (const rel of CON_RELACION) {
      const codigo = readFileSync(join(RAIZ, ...rel.split("/")), "utf8");
      expect(codigo, `${rel}: el select del usuario no pide los puntos`).toMatch(
        /user:\s*\{\s*select:\s*\{[^}]*pointsBalance/,
      );
    }
    // El buscador es SQL crudo: la columna va en la lista del SELECT, no en un `select` de Prisma.
    const buscar = readFileSync(join(RAIZ, "src", "server", "services", "buscar.ts"), "utf8");
    expect(buscar, "el SELECT público del buscador no pide los puntos").toMatch(
      /id, username, displayName, image, scoreAutoridad, pointsBalance/,
    );
  });
});
