/**
 * Lógica PURA del menú de cuenta (P5). Con dientes: "Cerrar sesión" SOLO con sesión; un invitado solo
 * ve "Entrar". Invertir el criterio (ofrecer logout a un invitado) cae en rojo.
 */
import { describe, expect, it } from "vitest";

import { itemsMenuCuenta } from "../src/app/(app)/(shell)/cuenta-logica";

describe("itemsMenuCuenta", () => {
  it("con sesión -> ver perfil + cerrar sesión (en ese orden)", () => {
    const items = itemsMenuCuenta(true);
    expect(items.map((i) => i.id)).toEqual(["perfil", "logout"]);
    // "Ver mi perfil" navega a /perfil; "Cerrar sesión" es una ACCIÓN (sin href).
    expect(items.find((i) => i.id === "perfil")?.href).toBe("/perfil");
    expect(items.find((i) => i.id === "logout")?.href).toBeUndefined();
  });

  it("invitado -> SOLO entrar (nunca 'cerrar sesión')", () => {
    const items = itemsMenuCuenta(false);
    expect(items.map((i) => i.id)).toEqual(["entrar"]);
    expect(items.some((i) => i.id === "logout")).toBe(false);
    expect(items[0]?.href).toBe("/entrar");
  });
});
