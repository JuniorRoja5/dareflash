/**
 * CABLEADO del gate de "visto" (test ESTRUCTURAL).
 *
 * `visto-cliente.test.ts` prueba la lógica, y lo prueba bien. Pero la lógica no sirve de nada si nadie
 * la llama, y ESO —un `useEffect` y unas props de React— no se puede ejecutar aquí: los tests corren en
 * Node sin DOM. Sin este fichero, alguien puede borrar la prop del feed, o dejar de escuchar
 * `timeupdate`, y las 18 pruebas de la lógica siguen verdes mientras el gate deja de existir en la app.
 *
 * Fija una DECISIÓN, no un resultado. Como el resto de tests estructurales del repo: se toca rompiendo
 * el invariante a propósito y confirmando que se pone rojo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.join(raiz, rel), "utf8");

const REPRODUCTOR = "src/components/ui/reproductor-hls.tsx";
const FEED = "src/components/feed/feed-vertical.tsx";
const DETALLE = "src/app/(app)/(shell)/retos/[codigo]/participaciones-reto.tsx";
const MODAL = "src/components/ui/modal-reproductor.tsx";
const LOGICA = "src/lib/visto-cliente.ts";

describe("el reproductor mide y marca", () => {
  it("usa el marcador de `lib/visto-cliente` y escucha `timeupdate`", () => {
    const src = leer(REPRODUCTOR);
    expect(src).toContain("crearMarcadorVisto");
    // `timeupdate` es lo que hace que la PAUSA no sume sin escribir código para ello. Cambiarlo por un
    // `setInterval` mediría reloj de pared y el vídeo pausado contaría como visto.
    expect(src).toMatch(/addEventListener\(\s*["']timeupdate["']/);
    expect(src).toMatch(/removeEventListener\(\s*["']timeupdate["']/); // sin fuga al desmontar
  });

  it("no marca nada si no le pasan participación (invitado, o vídeo no votable)", () => {
    const src = leer(REPRODUCTOR);
    expect(src).toMatch(/if \(!video \|\| !participacionVista\) return;/);
  });
});

describe("las pantallas le pasan la PARTICIPACIÓN y la SESIÓN, por separado", () => {
  it("el feed pasa el id de la Submission y la sesión REAL", () => {
    const src = leer(FEED);
    // El id que viaja es el de la SUBMISSION, nunca el del vídeo: las rutas de participación no
    // aceptan un id de Video (darían 404) y el gate quedaría cerrado para siempre, en silencio.
    expect(src).toContain("participacionVista={post.participacionId}");
    expect(src).toContain("haySesion={haySesion}");
    // Y NO se colapsan en una sola prop: hacerlo obliga a dar por hecha la sesión dentro del player
    // y deja la guarda `sin-sesion` sin poder ser falsa nunca (fue exactamente el fallo que hubo).
    expect(src).not.toMatch(/participacionVista=\{haySesion \?/);
  });

  it("el detalle del reto hereda el gate del feed, no lo cablea aparte", () => {
    // Tocar una participación abre el FEED DEL RETO, que ya marca "visto" por su cuenta. Si el detalle
    // volviera a cablear un reproductor propio, habría dos caminos que mantener sincronizados.
    const src = leer(DETALLE);
    expect(src).toContain("<FeedVertical");
    expect(src).not.toContain("participacionVista=");
  });

  it("el modal (perfil y panel) propaga AMBAS al reproductor: no se traga ninguna", () => {
    const src = leer(MODAL);
    expect(src).toContain("participacionVista={participacionVista}");
    expect(src).toContain("haySesion={haySesion}");
  });

  it("el reproductor no da por hecha la sesión: se la pasa a la lógica", () => {
    const src = leer(REPRODUCTOR);
    expect(src).toContain("crearMarcadorVisto(participacionVista, { haySesion })");
    expect(src).not.toContain("haySesion: true");
  });
});

describe("umbral de fuente única", () => {
  it("la lógica importa `VISTO_SEGUNDOS_MINIMOS`; no hay un número escrito a mano", () => {
    const src = leer(LOGICA);
    expect(src).toContain("VISTO_SEGUNDOS_MINIMOS");
    // El umbral por defecto sale de la constante, no de un literal. (`SALTO_MAX_SEG` sí es un literal
    // a propósito: describe cómo dispara `timeupdate` el navegador, no una regla de producto.)
    expect(src).toMatch(/opts\.minimoSeg \?\? VISTO_SEGUNDOS_MINIMOS/);
  });

  it("el reproductor NO decide el umbral: se lo deja a la lógica", () => {
    expect(leer(REPRODUCTOR)).not.toContain("minimoSeg");
  });
});
