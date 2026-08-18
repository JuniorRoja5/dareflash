/**
 * Sugerencias del buscador (P4) — piezas PURAS. Con dientes: el destino de cada tipo (usuario vs reto)
 * y la construcción de la lista (usuarios primero, retos después; se descartan usuarios sin username).
 */
import { describe, expect, it } from "vitest";

import {
  construirSugerencias,
  destinoSugerencia,
  hrefBuscarTodos,
  type Sugerencia,
} from "../src/app/(app)/(shell)/sugerencias-logica";

const usuario = (
  o: Partial<{ id: string; username: string | null; displayName: string | null }>,
) => ({
  id: o.id ?? "u1",
  // OJO: distinguir "null explícito" (para probar el descarte) de "ausente" (usa el default).
  username: o.username === undefined ? "yuyu" : o.username,
  displayName: o.displayName ?? null,
  image: null,
});
const reto = (o: Partial<{ id: string; title: string; category: string }>) => ({
  id: o.id ?? "r1",
  title: o.title ?? "Salto",
  category: o.category ?? "fitness",
  prizeAmountCents: 0,
  prizeCurrency: "USD",
  deadline: new Date("2026-12-01T00:00:00Z"),
});

describe("construirSugerencias", () => {
  it("une usuarios (primero) y retos (después) en una lista tipada", () => {
    const lista = construirSugerencias(
      [usuario({ id: "u1", username: "ana" })],
      [reto({ id: "r1", title: "Salto" })],
    );
    expect(lista.map((s) => `${s.tipo}:${s.id}`)).toEqual(["usuario:u1", "reto:r1"]);
  });

  it("descarta usuarios SIN username (no serían enlazables)", () => {
    const lista = construirSugerencias([usuario({ id: "u2", username: null })], []);
    expect(lista).toEqual([]);
  });

  it("copia solo los campos de presentación de cada tipo", () => {
    const [u] = construirSugerencias([usuario({ username: "ana", displayName: "Ana G" })], []);
    expect(u).toEqual({
      tipo: "usuario",
      id: "u1",
      username: "ana",
      displayName: "Ana G",
      image: null,
    });
  });
});

describe("destinoSugerencia", () => {
  it("usuario -> /u/[username]; reto -> /retos/[id]", () => {
    const u: Sugerencia = {
      tipo: "usuario",
      id: "x",
      username: "yuyu",
      displayName: null,
      image: null,
    };
    const r: Sugerencia = { tipo: "reto", id: "reto-42", title: "Salto", category: "fitness" };
    expect(destinoSugerencia(u)).toBe("/u/yuyu");
    expect(destinoSugerencia(r)).toBe("/retos/reto-42");
  });
});

describe("hrefBuscarTodos", () => {
  it("apunta a /buscar con la consulta recortada y escapada", () => {
    expect(hrefBuscarTodos("  salto  ")).toBe("/buscar?q=salto");
    expect(hrefBuscarTodos("a b&c")).toBe("/buscar?q=a+b%26c");
  });
});
