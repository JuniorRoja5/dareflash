/**
 * EDITAR USERNAME (P2). Tres capas:
 *  - PURO (UX del formulario): formato y normalización, y la lista de reservados (server-only).
 *  - DB con DIENTES: un cambio válido persiste (en minúsculas); un duplicado case-insensitive REVIENTA
 *    con P2002 y `esViolacionUnicaDeUsername` lo reconoce (la ruta lo traduce a 409 -> copy humano).
 * El mapeo P2002 -> 409 a nivel de RUTA se prueba en perfil-route.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { normalizarUsername, usernameEsValido } from "../src/app/(app)/(shell)/perfil/perfil-logic";
import { esHandleReservado } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { esViolacionUnicaDeUsername } from "../src/server/auth/registration";
import { actualizarPerfil, actualizarPerfilSchema } from "../src/server/services/perfil";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

describe("username · reglas puras", () => {
  it("usernameEsValido: acepta formato correcto (normaliza a minúsculas) y rechaza el resto", () => {
    expect(usernameEsValido("ana_99")).toBe(true);
    expect(usernameEsValido("Ana.99")).toBe(true); // se normaliza a minúsculas
    expect(usernameEsValido("  abc  ")).toBe(true); // se recorta
    expect(usernameEsValido("ab")).toBe(false); // corto
    expect(usernameEsValido("a".repeat(31))).toBe(false); // largo
    expect(usernameEsValido("con-guion")).toBe(false); // guion medio
    expect(usernameEsValido("con espacio")).toBe(false);
  });

  it("normalizarUsername recorta y pasa a minúsculas", () => {
    expect(normalizarUsername("  Ana_GÓ  ")).toBe("ana_gó"); // (la ó no es válida por formato, pero normaliza igual)
    expect(normalizarUsername("USER")).toBe("user");
  });

  it("esHandleReservado: rutas y marca, insensible a mayúsculas y espacios", () => {
    expect(esHandleReservado("admin")).toBe(true);
    expect(esHandleReservado("  BUSCAR ")).toBe(true);
    expect(esHandleReservado("dareflash")).toBe(true);
    expect(esHandleReservado("juana")).toBe(false);
  });
});

describe("username · edición contra la BD (dientes)", () => {
  let prisma: PrismaClient;
  beforeAll(() => {
    prisma = createTestPrisma();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  it("un cambio VÁLIDO persiste el handle en minúsculas (camino real: schema -> servicio)", async () => {
    const id = await crearUsuario(prisma, { username: "viejo1" });
    // Camino real: la normalización a minúsculas la hace el schema, no el servicio.
    const datos = actualizarPerfilSchema.parse({ displayName: "Ana", username: "Nuevo_Handle" });
    const res = await actualizarPerfil(prisma, id, datos);
    expect(res.username).toBe("nuevo_handle");
    const fila = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    expect(fila?.username).toBe("nuevo_handle");
  });

  it("DIENTES: un handle DUPLICADO (case-insensitive) revienta con P2002 reconocible", async () => {
    await crearUsuario(prisma, { username: "tomado1" });
    const otro = await crearUsuario(prisma, { username: "libre1" });

    // "TOMADO1" normaliza a "tomado1" -> choca con el existente (collation _ci + minúsculas).
    const datos = actualizarPerfilSchema.parse({ displayName: "Ana", username: "TOMADO1" });
    let capturado: unknown;
    try {
      await actualizarPerfil(prisma, otro, datos);
    } catch (e) {
      capturado = e;
    }
    expect(capturado).toBeDefined();
    expect(esViolacionUnicaDeUsername(capturado)).toBe(true);
    // Y el que intentó cambiarlo conserva su handle original (la transacción de update no cambió nada).
    const fila = await prisma.user.findUnique({ where: { id: otro }, select: { username: true } });
    expect(fila?.username).toBe("libre1");
  });
});
