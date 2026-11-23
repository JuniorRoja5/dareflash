/**
 * DE DÓNDE SALE LA ZONA PARA MOSTRAR (Fase 11 · P2): cookie válida → la guardada del usuario → `null`.
 *
 * `zonaDeLaPeticion` es el ÚNICO sitio del que sale la zona que se pinta, y la llama el layout raíz en
 * CADA página. Dos cosas se fijan aquí:
 *  - el ORDEN: la cookie de este dispositivo manda; sin ella (o inválida), la guardada; sin ninguna, null
 *    (un invitado sin cookie, como en la P1: no se inventa);
 *  - NI UNA CONSULTA MÁS: con la cookie, no se mira la sesión; y sin ella se pregunta a `getCurrentUser`
 *    —la promesa memoizada por petición que ya piden layout y página—, nunca a Prisma directamente.
 *
 * Para romperlo: devolver solo la cookie (rojo «usuario sin cookie»), mirar la sesión siempre (rojo
 * «con cookie no se mira la sesión»), o leer la zona con una consulta propia (rojo el estructural).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  cabeceras: {} as Record<string, string>,
  usuario: null as null | { zonaHoraria?: string | null },
  llamadasSesion: 0,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) => (nombre in H.cookies ? { value: H.cookies[nombre] } : undefined),
  }),
  headers: async () => new Headers(H.cabeceras),
}));
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => {
    H.llamadasSesion += 1;
    return H.usuario;
  },
}));

import { ZONA_COOKIE } from "../src/lib/zona-espectador";
import { idiomaDeLaPeticion, zonaDeLaPeticion } from "../src/server/formato-peticion";

beforeEach(() => {
  H.cookies = {};
  H.cabeceras = {};
  H.usuario = null;
  H.llamadasSesion = 0;
});

describe("zonaDeLaPeticion: cookie, si no la guardada, si no null", () => {
  it("con cookie válida devuelve la del navegador y NO mira la sesión", async () => {
    H.cookies[ZONA_COOKIE] = encodeURIComponent("Asia/Tokyo");
    H.usuario = { zonaHoraria: "Europe/Madrid" };
    expect(await zonaDeLaPeticion()).toBe("Asia/Tokyo");
    expect(H.llamadasSesion).toBe(0);
  });

  it("usuario con zona guardada y navegador SIN cookie: la guardada", async () => {
    H.usuario = { zonaHoraria: "Europe/Madrid" };
    expect(await zonaDeLaPeticion()).toBe("Europe/Madrid");
    expect(H.llamadasSesion).toBe(1);
  });

  it("cookie inválida: como si no estuviera, la guardada", async () => {
    H.cookies[ZONA_COOKIE] = "Marte%2FOlympus";
    H.usuario = { zonaHoraria: "America/Bogota" };
    expect(await zonaDeLaPeticion()).toBe("America/Bogota");
  });

  it("invitado sin cookie: null (no se inventa)", async () => {
    expect(await zonaDeLaPeticion()).toBeNull();
  });

  it("usuario sin zona guardada y sin cookie: null", async () => {
    H.usuario = { zonaHoraria: null };
    expect(await zonaDeLaPeticion()).toBeNull();
  });
});

describe("la zona guardada llega por la sesión, no por una consulta propia", () => {
  const codigo = readFileSync(
    path.join(process.cwd(), "src", "server", "formato-peticion.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("formato-peticion no importa Prisma ni consulta nada: solo `getCurrentUser`", () => {
    expect(codigo).not.toMatch(/@\/server\/db|prisma|\$queryRaw|findUnique|findFirst/);
    expect(codigo).toMatch(/await import\("@\/server\/auth\/current-user"\)/);
  });

  // Hasta la P5a era «es» siempre. Desde la P5a lo dice la URL, a través de la cabecera del proxy.
  it("`idiomaDeLaPeticion` sale de `x-df-idioma` (la pone el proxy); sin ella o rara, «es»", async () => {
    expect(await idiomaDeLaPeticion()).toBe("es");
    H.cabeceras = { "x-df-idioma": "en" };
    expect(await idiomaDeLaPeticion()).toBe("en");
    H.cabeceras = { "x-df-idioma": "fr" };
    expect(await idiomaDeLaPeticion()).toBe("es");
    H.cabeceras = { "x-df-idioma": "EN" };
    expect(await idiomaDeLaPeticion()).toBe("es");
  });
});
