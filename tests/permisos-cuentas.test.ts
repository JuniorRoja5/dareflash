/**
 * QUIÉN PUEDE GOBERNAR UNA CUENTA — las dos reglas puras. Son el punto único: las usa la ruta hoy y
 * el panel mañana.
 *
 * Cada cláusula tapa un agujero distinto, así que cada una tiene su caso:
 *  - solo el superadmin nombra (un moderador no se fabrica compañeros);
 *  - `ADMIN` no es asignable por API (no se acuña un segundo superadmin);
 *  - al ADMIN no se le toca (no se le degrada, ni siquiera él mismo);
 *  - suspender es de moderación, pero SOLO sobre un USER.
 *
 * Para romperlo: quitar cualquiera de las tres cláusulas de `puedeAsignarRol` -> rojo; dejar que
 * `puedeBanear` acepte destinos privilegiados -> rojo.
 */
import { describe, expect, it } from "vitest";

import { puedeAsignarRol, puedeBanear, ROLES_ASIGNABLES } from "../src/lib/permisos";

describe("puedeAsignarRol", () => {
  it("el superadmin mueve a alguien entre USER y MODERATOR", () => {
    expect(
      puedeAsignarRol({ rolActor: "ADMIN", rolActualDestino: "USER", rolPedido: "MODERATOR" }),
    ).toBe(true);
    expect(
      puedeAsignarRol({ rolActor: "ADMIN", rolActualDestino: "MODERATOR", rolPedido: "USER" }),
    ).toBe(true);
  });

  it("pedir ADMIN: NUNCA (no se acuña un segundo superadmin por API)", () => {
    expect(
      puedeAsignarRol({ rolActor: "ADMIN", rolActualDestino: "USER", rolPedido: "ADMIN" }),
    ).toBe(false);
    // Y el catálogo de asignables no lo contiene: la ausencia ES la guarda.
    expect([...ROLES_ASIGNABLES]).toEqual(["USER", "MODERATOR"]);
    expect([...ROLES_ASIGNABLES]).not.toContain("ADMIN");
  });

  it("un destino que YA es ADMIN: intocable, incluso para él mismo", () => {
    for (const rolPedido of ["USER", "MODERATOR"]) {
      expect(
        puedeAsignarRol({ rolActor: "ADMIN", rolActualDestino: "ADMIN", rolPedido }),
        rolPedido,
      ).toBe(false);
    }
  });

  it("un actor que no es el superadmin: NUNCA, aunque modere", () => {
    for (const rolActor of ["MODERATOR", "USER", "", "admin"]) {
      expect(
        puedeAsignarRol({ rolActor, rolActualDestino: "USER", rolPedido: "MODERATOR" }),
        rolActor,
      ).toBe(false);
    }
  });
});

describe("puedeBanear", () => {
  it("un moderador (y el admin, por jerarquía) suspende a un USER", () => {
    expect(puedeBanear({ rolActor: "MODERATOR", rolDestino: "USER" })).toBe(true);
    expect(puedeBanear({ rolActor: "ADMIN", rolDestino: "USER" })).toBe(true);
  });

  it("una cuenta PRIVILEGIADA no se suspende por aquí", () => {
    // Es lo que impide que un moderador comprometido eche a otros moderadores o al administrador.
    for (const rolDestino of ["MODERATOR", "ADMIN"]) {
      expect(puedeBanear({ rolActor: "MODERATOR", rolDestino }), rolDestino).toBe(false);
      expect(puedeBanear({ rolActor: "ADMIN", rolDestino }), rolDestino).toBe(false);
    }
  });

  it("un usuario normal no suspende a nadie", () => {
    expect(puedeBanear({ rolActor: "USER", rolDestino: "USER" })).toBe(false);
  });
});
