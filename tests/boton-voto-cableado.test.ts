/**
 * BOTÓN DE VOTO — placement y componente único (test ESTRUCTURAL).
 *
 * `voto-cliente.test.ts` prueba la lógica. Esto fija las decisiones de MONTAJE, que son las que se
 * deshacen en silencio y que no se pueden ejecutar aquí (React sin DOM):
 *  - UN solo componente de botón, no uno por superficie.
 *  - Va donde HAY reproductor (rail del feed, modal del detalle). La celda de la rejilla NO lo lleva:
 *    allí el usuario aún no ha reproducido nada, así que nacería siempre bloqueado por el gate.
 *  - La celda enseña el recuento COMPARTIDO, para que no contradiga al modal tras votar.
 *  - El rayo se define UNA vez.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "..");
const leer = (rel: string): string => readFileSync(path.join(raiz, rel), "utf8");

const BOTON = "src/components/ui/boton-voto.tsx";
const FEED = "src/app/(app)/feed/feed-inicio.tsx";
const DETALLE = "src/app/(app)/(shell)/retos/[codigo]/participaciones-reto.tsx";
const MODAL = "src/components/ui/modal-reproductor.tsx";

describe("un solo componente de botón", () => {
  it("el feed y el detalle lo IMPORTAN, no lo reimplementan", () => {
    for (const f of [FEED, DETALLE]) {
      expect(leer(f)).toContain('from "@/components/ui/boton-voto"');
    }
  });

  it("el rayo se define UNA vez, en el componente compartido", () => {
    // El comentario del feed ya decía que había que extraerlo cuando llegara el botón real. Si alguien
    // vuelve a pegar el path aquí, hay dos fuentes y una se queda atrás.
    const rayo = "M13 3 5 14h5l-1 7 8-11h-5l1-7Z";
    expect(leer(BOTON)).toContain(rayo);
    expect(leer(FEED)).not.toContain(rayo);
  });

  it("ninguna pantalla dibuja su propio botón magenta de voto", () => {
    // `bg-action` es el magenta de acción; el único que puede llevarlo aquí es el componente.
    expect(leer(DETALLE)).not.toContain("bg-action");
  });
});

describe("placement: botón donde hay reproductor, nunca en la celda", () => {
  it("el feed lo monta en el rail, y solo si el vídeo ES una participación", () => {
    const src = leer(FEED);
    expect(src).toContain('variante="rail"');
    // Una subida libre no pertenece a ningún reto: no se pinta un botón que no puede hacer nada.
    expect(src).toContain("post.participacionId && post.retoId ?");
  });

  it("el detalle lo monta DENTRO del modal (donde hay reproductor), vía `acciones`", () => {
    const src = leer(DETALLE);
    const modal = src.slice(src.indexOf("<ModalReproductor"));
    expect(modal).toContain("acciones={");
    expect(modal).toContain("<BotonVoto");
    expect(leer(MODAL)).toContain("{acciones}");
  });

  it("la CELDA de la rejilla no lleva botón: solo el recuento compartido", () => {
    const src = leer(DETALLE);
    const celda = src.slice(src.indexOf("function Celda"), src.indexOf("<ModalReproductor"));
    expect(celda).not.toContain("<BotonVoto");
    // Y el recuento es el RECONCILIADO, no el crudo: si no, votar en el modal y cerrarlo dejaría la
    // celda de debajo con el número viejo.
    expect(celda).toContain("<RecuentoVotos");
    expect(celda).not.toContain("<ContadorVotos");
    // Reconciliar exige el payload ENTERO de esta superficie: su total Y su `miVoto` (que es lo que
    // dice si ese total ya contaba el voto). Sin `miVoto` solo se puede acumular un delta, que fue
    // el bug de producción — el 2 donde debía haber 1 y el −1 al quitar.
    expect(celda).toMatch(/miVoto={/);
    expect(celda).toMatch(/retoId={/);
  });
});

describe("el estado viene del payload, no de una ida y vuelta", () => {
  it("las dos superficies pasan `miVoto` y `retoAbierto` al botón", () => {
    for (const f of [FEED, DETALLE]) {
      const src = leer(f);
      expect(src).toMatch(/miVoto=\{/);
      expect(src).toMatch(/retoAbierto=\{/);
    }
  });

  it("el botón deriva su estado con `estadoBoton`, sin decidirlo a mano", () => {
    const src = leer(BOTON);
    expect(src).toContain("estadoBoton({");
    // Un `useState` con el estado del botón se separaría del store a la primera acción cruzada.
    expect(src).not.toMatch(/useState.*votado/i);
  });

  it("el RENDER no escribe en el store compartido", () => {
    const src = leer(BOTON);
    // Escribir durante el render avisa a otros componentes a media renderización, y en SSR toca un
    // Map de ámbito de módulo que el proceso comparte entre peticiones de usuarios distintos.
    // El estado inicial sale del prop por la vía PURA, y la siembra ocurre dentro del handler.
    expect(src).toContain("votoVisible(retoId, miVoto)");
    expect(src).not.toMatch(/^\s*sembrar/m);
  });

  it("no queda ninguna puerta para sembrar desde fuera del handler", () => {
    // La siembra es interna al store: si volviera a exportarse, alguien la llamaría en un render.
    expect(leer("src/lib/voto-cliente.ts")).not.toMatch(/export function sembrar/);
  });

  it("el recuento NO se acumula: se reconcilia contra el total de cada superficie", () => {
    const store = leer("src/lib/voto-cliente.ts");
    // El estado compartido es una POSICIÓN (dónde está el voto), nunca una CANTIDAD. Un mapa de
    // deltas volvería a aplicar el ajuste de una pantalla al total de otra.
    expect(store).not.toMatch(/const deltaw* = new Map/);
    expect(store).not.toMatch(/export function deltaDe/);
    expect(leer(BOTON)).toContain("votosMostrados({ retoId, participacionId, votos, miVoto })");
  });

  it("el texto y el aria salen de tablas de copy, nunca del código del estado", () => {
    const src = leer(BOTON);
    expect(src).toContain("TEXTO[estado]");
    expect(src).toContain("ARIA[estado]");
  });
});
