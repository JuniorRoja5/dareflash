/**
 * Permiso de CREAR RETOS (Fase 2 · M3), pieza PURA y única fuente de la decisión. Con dientes: si se
 * quitara la cláusula `role === "ADMIN"`, el caso ADMIN cae en rojo; si se ignorara el flag, caen los
 * casos con flag.
 */
import { describe, expect, it } from "vitest";

import { usuarioPuedeCrearRetos } from "../src/lib/permisos";

describe("usuarioPuedeCrearRetos", () => {
  it("ADMIN -> true (aunque no tenga el flag)", () => {
    expect(usuarioPuedeCrearRetos({ role: "ADMIN", puedeCrearRetos: false })).toBe(true);
  });

  it("USER con flag -> true; USER sin flag -> false", () => {
    expect(usuarioPuedeCrearRetos({ role: "USER", puedeCrearRetos: true })).toBe(true);
    expect(usuarioPuedeCrearRetos({ role: "USER", puedeCrearRetos: false })).toBe(false);
  });

  it("MODERATOR NO obtiene la capacidad por su rol: sin flag -> false; con flag -> true", () => {
    expect(usuarioPuedeCrearRetos({ role: "MODERATOR", puedeCrearRetos: false })).toBe(false);
    expect(usuarioPuedeCrearRetos({ role: "MODERATOR", puedeCrearRetos: true })).toBe(true);
  });
});
