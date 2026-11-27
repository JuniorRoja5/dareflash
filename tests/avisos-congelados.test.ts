/**
 * LOS AVISOS EN CASTELLANO, CONGELADOS ANTES DE SACARLOS AL DICCIONARIO (Fase 11 · P5b4).
 *
 * Una fila de ejemplo por cada `tipo` (y por cada variante: los cuatro motivos de un vídeo fallido,
 * cada nivel, el comentario con reto y sin él, con su vídeo y sin él, el anuncio con su texto) y lo
 * que dice y adónde lleva. `tests/fixtures/avisos-antes.json` se generó con el código de ANTES
 * (`textoAviso(…).es`, la tabla ES/EN de `lib/notificaciones`, main 93bb4e6): después de pasar los
 * avisos al diccionario, cada uno tiene que decir EXACTAMENTE lo mismo y llevar al mismo sitio.
 *
 * DESPUÉS (P5b4): el mismo caso pasa por `componerAviso(fila, "es")`, que lee `es.avisos`.
 *
 * Para romperlo: cambiar una letra de cualquier aviso en `es.ts` (rojo con su caso).
 *
 * Regenerar el ANTES (solo se hizo una vez, antes de tocar nada):
 * `ACTUALIZAR_ANTES=1 npx vitest run tests/avisos-congelados.test.ts`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { NIVELES } from "@/lib/niveles";

import { componerAviso } from "../src/server/avisos-texto";

const ANTES = path.join(process.cwd(), "tests/fixtures/avisos-antes.json");

const RETO = { titulo: "Salto de comba 60 s", codigo: "ab12cd34", slug: "salto-de-comba-60-s" };
type Fila = { tipo: string; refType: string; refId: string; datos: unknown };
type Contexto = {
  anuncios?: ReadonlyMap<string, string>;
  comentarios?: ReadonlyMap<string, string>;
};

/** Los casos: una fila (y su contexto) por tipo y variante. */
const CASOS: Record<string, { fila: Fila; contexto?: Contexto }> = {
  "CONTENIDO_AUTO_OCULTO (vídeo)": {
    fila: { tipo: "CONTENIDO_AUTO_OCULTO", refType: "VIDEO", refId: "v1", datos: {} },
  },
  "CONTENIDO_AUTO_OCULTO (comentario)": {
    fila: { tipo: "CONTENIDO_AUTO_OCULTO", refType: "COMMENT", refId: "c1", datos: {} },
  },
  VIDEO_LISTO: { fila: { tipo: "VIDEO_LISTO", refType: "VIDEO", refId: "v1", datos: {} } },
  ...Object.fromEntries(
    ["TOO_LONG", "TRANSCODE_ERROR", "UPLOAD_INCOMPLETE", "OBJETO_INEXISTENTE"].map((m) => [
      `VIDEO_FALLIDO (${m})`,
      { fila: { tipo: "VIDEO_FALLIDO", refType: "VIDEO", refId: "v1", datos: { motivo: m } } },
    ]),
  ),
  VOTO_RECIBIDO: {
    fila: { tipo: "VOTO_RECIBIDO", refType: "VOTO", refId: "u1:s1", datos: { reto: RETO } },
  },
  GANASTE_RETO: {
    fila: {
      tipo: "GANASTE_RETO",
      refType: "CHALLENGE",
      refId: "r1",
      datos: { reto: RETO, puntos: 150 },
    },
  },
  TOP20: {
    fila: { tipo: "TOP20", refType: "CHALLENGE", refId: "r1", datos: { reto: RETO, puntos: 40 } },
  },
  ...Object.fromEntries(
    NIVELES.map((n) => [
      `SUBISTE_NIVEL (${n.clave})`,
      { fila: { tipo: "SUBISTE_NIVEL", refType: "NIVEL", refId: n.clave, datos: {} } },
    ]),
  ),
  "ANUNCIO (con su texto)": {
    fila: { tipo: "ANUNCIO", refType: "ANUNCIO", refId: "a1", datos: {} },
    contexto: { anuncios: new Map([["a1", "Esta semana duplicamos los puntos de los retos."]]) },
  },
  TOQUE: {
    fila: { tipo: "TOQUE", refType: "USER", refId: "ana:2026-06-15", datos: { autor: "ana" } },
  },
  "COMENTARIO (en un reto, con su vídeo)": {
    fila: {
      tipo: "COMENTARIO",
      refType: "COMMENT",
      refId: "c9",
      datos: { autor: "leo", reto: RETO },
    },
    contexto: { comentarios: new Map([["c9", "vid-7"]]) },
  },
  "COMENTARIO (en un reto, sin su vídeo)": {
    fila: {
      tipo: "COMENTARIO",
      refType: "COMMENT",
      refId: "c9",
      datos: { autor: "leo", reto: RETO },
    },
  },
  "COMENTARIO (subida libre, sin su vídeo)": {
    fila: {
      tipo: "COMENTARIO",
      refType: "COMMENT",
      refId: "c9",
      datos: { autor: "leo", reto: null },
    },
  },
};

/** Lo que dice y adónde lleva un aviso, en castellano. Es lo ÚNICO que cambia al extraer. */
function enCastellano(fila: Fila, contexto?: Contexto): { texto: string; href: string } | null {
  const t = componerAviso(fila, "es", contexto);
  return t ? { texto: t.texto, href: t.href } : null;
}

const hoy = Object.fromEntries(
  Object.entries(CASOS).map(([caso, { fila, contexto }]) => [caso, enCastellano(fila, contexto)]),
);
if (process.env.ACTUALIZAR_ANTES === "1") writeFileSync(ANTES, JSON.stringify(hoy, null, 1) + "\n");
const antes = JSON.parse(readFileSync(ANTES, "utf8")) as typeof hoy;

describe("los avisos dicen lo mismo que antes, tipo a tipo", () => {
  it("el ANTES tiene un caso por tipo y variante, y ninguno vacío", () => {
    expect(Object.keys(antes).length).toBe(Object.keys(CASOS).length);
    expect(Object.values(antes).every((v) => v && v.texto.length > 5)).toBe(true);
  });

  it.each(Object.keys(CASOS))("%s", (caso) => {
    expect(hoy[caso]).toEqual(antes[caso]);
  });
});
