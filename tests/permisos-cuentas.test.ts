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

import {
  controlesCuenta,
  puedeAsignarRol,
  puedeBanear,
  puedeVerEmail,
  rolAlternativo,
  ROLES_ASIGNABLES,
} from "../src/lib/permisos";

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

describe("controlesCuenta (qué se le ofrece a quien mira)", () => {
  const activa = { rolDestino: "USER", suspendido: false };

  it("el ADMIN ve el cambio de rol; el MODERADOR no", () => {
    expect(controlesCuenta({ rolMira: "ADMIN", ...activa }).puedeRol).toBe(true);
    expect(controlesCuenta({ rolMira: "MODERATOR", ...activa }).puedeRol).toBe(false);
    expect(controlesCuenta({ rolMira: "USER", ...activa }).puedeRol).toBe(false);
  });

  it("sobre un ADMIN no se ofrece NADA: ni rol ni suspensión", () => {
    const c = controlesCuenta({ rolMira: "ADMIN", rolDestino: "ADMIN", suspendido: false });
    expect(c).toEqual({ puedeRol: false, puedeSuspender: false, puedeLevantar: false });
  });

  it("sobre un MODERADOR: el admin puede degradarlo, pero nadie suspenderlo", () => {
    const c = controlesCuenta({ rolMira: "ADMIN", rolDestino: "MODERATOR", suspendido: false });
    expect(c).toEqual({ puedeRol: true, puedeSuspender: false, puedeLevantar: false });
    // Y el moderador que mira tampoco puede con otro moderador.
    expect(
      controlesCuenta({ rolMira: "MODERATOR", rolDestino: "MODERATOR", suspendido: false }),
    ).toEqual({ puedeRol: false, puedeSuspender: false, puedeLevantar: false });
  });

  it("suspender y levantar NUNCA se ofrecen a la vez: dependen del estado", () => {
    const activaAhora = controlesCuenta({ rolMira: "MODERATOR", ...activa });
    expect(activaAhora.puedeSuspender).toBe(true);
    expect(activaAhora.puedeLevantar).toBe(false);

    const suspendida = controlesCuenta({
      rolMira: "MODERATOR",
      rolDestino: "USER",
      suspendido: true,
    });
    expect(suspendida.puedeSuspender).toBe(false);
    expect(suspendida.puedeLevantar).toBe(true);
  });

  it("el movimiento que se ofrece es el CONTRARIO del rol actual", () => {
    expect(rolAlternativo("USER")).toBe("MODERATOR");
    expect(rolAlternativo("MODERATOR")).toBe("USER");
    // Sobre un ADMIN da igual lo que devuelva: `controlesCuenta` no ofrece el control.
    expect(
      controlesCuenta({ rolMira: "ADMIN", rolDestino: "ADMIN", suspendido: true }).puedeRol,
    ).toBe(false);
  });
});

/**
 * VER EL CORREO: la regla más restrictiva de la pantalla de cuentas, y la única de `/panel/usuarios`
 * que un moderador NO alcanza. La asimetría es deliberada: suspender SÍ es moderar; el correo es la
 * identidad de una persona fuera de la plataforma.
 *
 * Para romperlo: aflojarlo a `alcanzaRol(rol, "MODERATOR")` -> rojo aquí y en la ruta.
 */
describe("puedeVerEmail", () => {
  it("solo el superadmin; el moderador NO, aunque sí pueda suspender", () => {
    expect(puedeVerEmail("ADMIN")).toBe(true);
    expect(puedeVerEmail("MODERATOR")).toBe(false);
    expect(puedeVerEmail("USER")).toBe(false);
    // La comparación, al lado, es lo que hace visible la decisión: el moderador modera cuentas...
    expect(puedeBanear({ rolActor: "MODERATOR", rolDestino: "USER" })).toBe(true);
    // ...y aun así no ve un correo.
    expect(puedeVerEmail("MODERATOR")).toBe(false);
  });

  it("un rol desconocido no ve nada (no se cuela por no estar en la lista)", () => {
    for (const rol of ["", "admin", "SUPERADMIN", "Moderator"]) {
      expect(puedeVerEmail(rol), rol).toBe(false);
    }
  });
});
