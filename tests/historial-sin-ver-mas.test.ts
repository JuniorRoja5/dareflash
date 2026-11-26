/**
 * NINGÚN HISTORIAL DEL USUARIO ACUMULA CON «VER MÁS» (PU1) — censo.
 *
 * Un historial propio (lo que te ha pasado a TI: cobros, movimientos, puntos, Boosts, referidos,
 * avisos…) se pagina con `PasosKeyset`: Anterior / Siguiente, la página la dice la URL y se REEMPLAZA.
 * Un «Ver más» que AÑADE filas en el cliente no deja volver, ni enlazar un sitio, y la pantalla crece
 * sin techo. Así era «Tus solicitudes» del monedero hasta la PU1.
 *
 * QUÉ SE CENSA: todo fichero de cliente de `src/app` y `src/components` (fuera del panel) que AÑADE
 * una página a lo que ya tenía —`[...previas, ...nuevas]`— y la pide con un cursor. Hoy son listados
 * PÚBLICOS o de exploración, no historial de nadie, y están en `ACUMULAN_Y_NO_SON_HISTORIAL` con su
 * porqué. Uno NUEVO que acumule es rojo con su fichero: o se pasa a `PasosKeyset`, o se añade aquí
 * con la razón de que no sea un historial propio.
 *
 * NO ACUMULAN y quedan fuera del censo: /notificaciones (pagina por la URL y reemplaza: «Volver a
 * recientes» / «Ver más antiguas») y las listas con `PasosKeyset` (/puntos, /referidos, /boosts,
 * /destacados, el monedero y el portal de empresa).
 *
 * Para romperlo: devolver el «Ver más» acumulador a `wallet/historial-retiradas.tsx` (rojo con su
 * nombre), o escribir otro en una pantalla nueva (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");

/** Los que acumulan a propósito, y por qué NO son el historial de una persona. */
const ACUMULAN_Y_NO_SON_HISTORIAL: Record<string, string> = {
  "src/app/(app)/(shell)/buscar/buscar-cliente.tsx": "resultados de una búsqueda",
  // DECISIÓN de Junior (26 nov): la galería se queda con «Ver más».
  "src/app/(app)/(shell)/perfil/rejilla-videos.tsx":
    "la galería de vídeos de un perfil es una galería, no un historial",
  "src/app/(app)/(shell)/ranking/ranking-vistas.tsx": "la clasificación pública",
  "src/app/(app)/(shell)/retos/feed-retos.tsx": "el catálogo público de retos cerrados",
  "src/app/(app)/(shell)/retos/[codigo]/participaciones-reto.tsx":
    "las participaciones públicas de un reto",
  "src/components/feed/comentarios-video.tsx": "la conversación pública de un vídeo",
  "src/components/feed/feed-vertical.tsx": "el feed: desplazamiento continuo a propósito",
};

function ficheros(dir: string): string[] {
  const fuera: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const p = path.join(dir, nombre);
    if (statSync(p).isDirectory()) fuera.push(...ficheros(p));
    else if (/\.(ts|tsx)$/.test(nombre)) fuera.push(p);
  }
  return fuera;
}

const relativo = (p: string) => path.relative(RAIZ, p).split(path.sep).join("/");

/** Sin comentarios: uno que hable de «[...a, ...b]» no es código que acumule. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** AÑADE lo nuevo a lo que había: `[...previas, ...r.data.items]`, `[...prev.items, ...`. */
const ACUMULA = /\[\s*\.\.\.\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)?\s*,\s*\.\.\./;
/** …y lo pide con un cursor: es una página, no una unión de dos listas cualquiera. */
const PIDE_CON_CURSOR = /cursor/i;

function censo(): string[] {
  const candidatos = [
    ...ficheros(path.join(RAIZ, "src", "app")),
    ...ficheros(path.join(RAIZ, "src", "components")),
  ].filter(
    (p) => !relativo(p).startsWith("src/app/panel/") && !relativo(p).startsWith("src/app/api/"),
  );
  return candidatos
    .filter((p) => {
      const fuente = readFileSync(p, "utf8");
      if (!/^\s*["']use client["']/.test(fuente)) return false;
      const codigo = sinComentarios(fuente);
      return ACUMULA.test(codigo) && PIDE_CON_CURSOR.test(codigo);
    })
    .map(relativo)
    .sort();
}

describe("ningún historial del usuario acumula con «ver más»", () => {
  it("todo lo que acumula está en la lista, con su porqué", () => {
    const nuevos = censo().filter((f) => !(f in ACUMULAN_Y_NO_SON_HISTORIAL));
    expect(
      nuevos,
      "acumula páginas en el cliente: si es un historial propio, pásalo a PasosKeyset; si no, " +
        "añádelo a ACUMULAN_Y_NO_SON_HISTORIAL con su razón",
    ).toEqual([]);
  });

  it("y la lista no guarda ficheros que ya no acumulan (no es una lista de permisos muerta)", () => {
    const hoy = new Set(censo());
    const sobran = Object.keys(ACUMULAN_Y_NO_SON_HISTORIAL).filter((f) => !hoy.has(f));
    expect(sobran, "ya no acumulan: sácalos de la lista").toEqual([]);
  });

  it("el detector muerde: el «Ver más» de antes del monedero se habría visto", () => {
    const deAntes = `"use client";
      async function verMas() {
        const r = await getJson(\`/api/retiradas?cursor=\${encodeURIComponent(cursor)}\`);
        setFilas((previas) => [...previas, ...r.data.items]);
      }`;
    expect(ACUMULA.test(sinComentarios(deAntes)) && PIDE_CON_CURSOR.test(deAntes)).toBe(true);
  });

  it("el monedero pagina sus DOS listas con PasosKeyset", () => {
    const pagina = sinComentarios(
      readFileSync(path.join(RAIZ, "src/app/(app)/(shell)/wallet/page.tsx"), "utf8"),
    );
    const movimientos = sinComentarios(
      readFileSync(
        path.join(RAIZ, "src/app/(app)/(shell)/wallet/movimientos-monedero.tsx"),
        "utf8",
      ),
    );
    expect(pagina).toMatch(/<PasosKeyset[\s\S]*?claves=\{CLAVES_SOLICITUDES\}/);
    expect(movimientos).toMatch(/<PasosKeyset[\s\S]*?claves=\{CLAVES_MOVIMIENTOS\}/);
  });
});
