/**
 * Destino tras login (M4), pieza PURA y fuente única. Con dientes: si se quita la rama ADMIN, el caso
 * ADMIN cae; el `?siguiente` válido manda sobre el rol.
 */
import { describe, expect, it } from "vitest";

import { destinoTrasLogin } from "../src/lib/destino-login";

describe("destinoTrasLogin", () => {
  it('sin siguiente (="/"): ADMIN -> /panel; USER/MODERATOR -> /', () => {
    expect(destinoTrasLogin("ADMIN", "/")).toBe("/panel");
    expect(destinoTrasLogin("USER", "/")).toBe("/");
    expect(destinoTrasLogin("MODERATOR", "/")).toBe("/");
  });

  it("con siguiente local válido -> ese, para CUALQUIER rol (manda sobre el destino por rol)", () => {
    expect(destinoTrasLogin("ADMIN", "/perfil")).toBe("/perfil");
    expect(destinoTrasLogin("USER", "/retos")).toBe("/retos");
    // Un ADMIN que venía a /crear va a /crear, NO al panel.
    expect(destinoTrasLogin("ADMIN", "/crear")).toBe("/crear");
  });
});
