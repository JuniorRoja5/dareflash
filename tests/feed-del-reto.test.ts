/**
 * FEED ACOTADO A UN RETO — sustituye al reproductor en modal del detalle.
 *
 * Lo que se puede ejecutar en Node (el mapeo del ítem) se prueba de verdad; el resto son decisiones de
 * MONTAJE que no se pueden renderizar aquí y que se deshacen en silencio: que el componente sea UNO,
 * que la fuente del reto sea la única puerta a más vídeos, y que la paginación siga siendo keyset.
 *
 * Con dientes: el ítem sale con la forma exacta que el feed pinta; deslizar no puede salir del reto
 * (solo hay una fuente y solo devuelve participaciones de ese reto); y la celda ya no abre un modal.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { postDeParticipacion } from "../src/lib/post-de-participacion";

const raiz = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.join(raiz, rel), "utf8");

/**
 * Quita comentarios. Lo que se afirma abajo es sobre el CÓDIGO: un comentario que EXPLICA por qué NO
 * hay un OFFSET no es un OFFSET — y este test cayó en rojo por eso antes de existir esta función.
 */
const soloCodigo = (fuente: string): string =>
  fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");

const FEED = "src/components/feed/feed-vertical.tsx";
const DETALLE = "src/app/(app)/(shell)/retos/[codigo]/participaciones-reto.tsx";
const RUTA = "src/app/api/retos/[id]/participaciones/route.ts";

const PARTICIPACION = {
  submissionId: "sub-1",
  videoId: "vid-1",
  title: "Mi vídeo",
  votos: 42,
  username: "ana",
  displayName: "Ana",
  retoId: "reto-1",
  retoAbierto: true,
  miVoto: "sub-1",
};
const RETO = { titulo: "Reto de fitness", categoria: "Fitness" };
const URLS = { src: "https://x/playlist.m3u8", poster: "https://x/thumb.jpg" };

describe("el ítem tiene la MISMA forma que el que pinta el feed", () => {
  it("trae los campos de voto y de reproducción, sin inventarse ninguno", () => {
    expect(postDeParticipacion(PARTICIPACION, RETO, URLS)).toEqual({
      // `id` es el del VÍDEO, igual que en el feed global: es la clave del slide y lo que usa
      // `onNoDisponible` para retirar uno roto.
      id: "vid-1",
      displayName: "Ana",
      username: "ana",
      retoTitulo: "Reto de fitness",
      categoria: "Fitness",
      votos: 42,
      src: URLS.src,
      poster: URLS.poster,
      // Y el de la PARTICIPACIÓN va aparte: es de lo que hablan las rutas de voto y del gate.
      participacionId: "sub-1",
      retoId: "reto-1",
      retoAbierto: true,
      miVoto: "sub-1",
    });
  });

  it("el id del vídeo y el de la participación NO se confunden", () => {
    // Pasar un id de Video a las rutas de participación da 404: el gate quedaría cerrado para siempre.
    const post = postDeParticipacion(PARTICIPACION, RETO, URLS);
    expect(post.id).not.toBe(post.participacionId);
    expect(post.participacionId).toBe(PARTICIPACION.submissionId);
  });
});

describe("un solo componente de feed, parametrizado por su fuente", () => {
  it("el feed vive fuera de la ruta que lo estrenó: lo usan dos pantallas", () => {
    // Si volviera a `src/app/(app)/feed/`, la otra pantalla tendría que importar de dentro de una ruta
    // ajena o —peor— hacerse una copia.
    expect(() => leer(FEED)).not.toThrow();
    expect(leer("src/app/(app)/feed/page.tsx")).toContain("@/components/feed/feed-vertical");
    expect(leer(DETALLE)).toContain("@/components/feed/feed-vertical");
  });

  it("el detalle NO forkea el feed: monta el mismo componente", () => {
    const src = leer(DETALLE);
    expect(src).toContain("<FeedVertical");
    // Reconstruirlo habría significado reimplementar la carga/descarga por visibilidad, que es lo que
    // impide montar cientos de <video> a la vez.
    expect(src).not.toContain("IntersectionObserver");
    expect(src).not.toContain("<ReproductorHls");
  });

  it("hay DOS fuentes y las dos viven juntas, para que se vea qué las diferencia", () => {
    const src = leer(FEED);
    expect(src).toContain("export const fuenteGlobal");
    expect(src).toContain("export function fuenteReto");
  });
});

describe("deslizar no puede salir del reto", () => {
  it("la fuente del reto solo pide participaciones DE ESE reto", () => {
    const src = leer(FEED);
    const fuente = src.slice(
      src.indexOf("export function fuenteReto"),
      src.indexOf("FEED VERTICAL"),
    );
    expect(fuente).toContain("/api/retos/");
    expect(fuente).toContain("/participaciones");
    // La única otra puerta a más vídeos sería el endpoint global.
    expect(fuente).not.toContain("/api/feed");
  });

  it("el componente NO conoce ningún endpoint: solo su fuente", () => {
    const src = leer(FEED);
    const componente = src.slice(src.indexOf("export function FeedVertical"));
    // Un `fetch` cableado dentro sacaría al usuario del reto en cuanto pagine.
    expect(componente).not.toContain("/api/feed");
    expect(componente).toContain("fuente.siguientePagina(cursor)");
  });

  it("el detalle abre el feed con la fuente del RETO, no con la global", () => {
    const src = leer(DETALLE);
    expect(src).toContain("fuenteReto(challengeId)");
    expect(src).not.toContain("fuenteGlobal");
  });
});

describe("paginación keyset, nunca OFFSET", () => {
  it("el cursor viaja OPACO: el feed lo guarda y lo devuelve, no lo interpreta", () => {
    expect(soloCodigo(leer(FEED))).not.toMatch(/\bskip\b|\boffset\b|\bpage=\b/i);
  });

  it("el endpoint del reto pagina por cursor y no acepta un desplazamiento", () => {
    const src = leer(RUTA);
    expect(src).toContain("cursor");
    expect(soloCodigo(src)).not.toMatch(/\boffset\b|\bskip\b/i);
  });
});

describe("el modal deja de ser el destino del toque", () => {
  it("la celda abre el feed del reto, no un reproductor propio", () => {
    const src = leer(DETALLE);
    expect(src).toContain("onAbrir");
    // Sobre el CÓDIGO: un comentario que explica por qué el modal ya no está no es el modal.
    expect(soloCodigo(src)).not.toContain("ModalReproductor");
  });

  it("el modal SIGUE existiendo para el perfil y el panel (allí no hay feed que acotar)", () => {
    // No se borra: en la rejilla del perfil y en el panel de moderación no hay un feed al que entrar,
    // y un reproductor suelto es exactamente lo que hace falta ahí.
    for (const f of [
      "src/app/(app)/(shell)/perfil/celda-video.tsx",
      "src/app/panel/retos/[id]/participaciones-panel.tsx",
    ]) {
      expect(leer(f)).toContain("<ModalReproductor");
    }
  });
});

describe("se abre POR la participación que se tocó", () => {
  it("el detalle pasa el índice y el feed entra por ahí, no por el primero", () => {
    // Sin esto, tocar el vídeo 30 de la rejilla abriría el feed por el 1: el usuario tendría que
    // deslizar 29 veces para llegar a lo que pulsó.
    expect(leer(DETALLE)).toContain("indiceInicial={indice}");
    const feed = leer(FEED);
    expect(feed).toContain("indiceInicial");
    // Y el vídeo ACTIVO arranca ya en ese índice: si arrancara en 0, el primero reproduciría un
    // instante antes de saltar.
    expect(feed).toContain("useState(indiceInicial)");
    expect(feed).toContain("secciones.current[indiceInicial]?.scrollIntoView");
  });
});

/**
 * MONTAJE DE LA CAPA. Dos regresiones reales vistas en producción, y las dos son cosas que no se
 * pueden renderizar en Node — así que se fijan por estructura, que es lo único que puede ponerse rojo.
 */
describe("la capa se monta en el <body>, no dentro de la página", () => {
  it("va por PORTAL: si no, un ancestro con `transform` le roba el viewport", () => {
    const src = leer(DETALLE);
    // `.df-rise` (la sección que la contiene) ANIMA `transform`, y eso crea bloque contenedor para
    // `position: fixed`. Sin portal, el `inset-0` se resolvía contra esa sección: en móvil el rail de
    // acciones no cabía y en escritorio la capa dejaba media pantalla fuera.
    expect(src).toContain("createPortal(");
    expect(src).toContain("document.body");
  });

  it("el detalle sigue teniendo la clase que causa el problema (el portal no es opcional)", () => {
    // Si alguien quita `df-rise` de la sección, el portal parecerá innecesario. Este test deja claro
    // que la razón sigue ahí: la animación de `transform` es una decisión de diseño, no un accidente.
    expect(leer("src/app/(app)/(shell)/retos/[codigo]/page.tsx")).toContain("df-rise");
    expect(leer("src/app/globals.css")).toMatch(/@keyframes df-rise[\s\S]*?transform/);
  });
});

describe("el atrás del móvil cierra la capa", () => {
  it("abrir la capa pone una entrada de historial y se escucha `popstate`", () => {
    const src = leer(DETALLE);
    expect(src).toContain("crearControlCapa");
    expect(src).toContain('addEventListener("popstate"');
    // Cerrar NO pone el estado a null a mano: pide `back()` y deja que `popstate` cierre, para que el
    // botón, Escape y el gesto de atrás acaben en el mismo sitio y el historial no se descuadre.
    expect(src).toContain("control.pedirCierre()");
  });
});

describe("escritorio: sin números mágicos ni hueco muerto", () => {
  it("las flechas se anclan a SU columna, no a un desplazamiento calculado a mano", () => {
    // `right-[376px]` era el ancho del panel + 16 px escrito a mano: cambiar el panel lo descuadraba.
    expect(soloCodigo(leer(FEED))).not.toMatch(/right-\[\d+px\]/);
  });

  it("el panel de comentarios tiene DÓNDE escribir, y dice que aún no funciona", () => {
    const src = leer(FEED);
    expect(src).toContain("<input");
    expect(src).toContain("disabled");
    // CERO datos falsos: la caja no finge funcionar.
    expect(src).toContain("Próximamente");
  });
});
