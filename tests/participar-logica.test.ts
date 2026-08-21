/**
 * "Participar" · lógica pura. Con dientes: la ruta canónica y el destino de login de un invitado
 * (vuelve al reto tras entrar, con `?siguiente=` correctamente codificado).
 */
import { describe, expect, it } from "vitest";

import {
  enlaceEntrarParaParticipar,
  rutaCanonicaReto,
} from "../src/app/(app)/(shell)/retos/participar-logica";

describe("participar · lógica", () => {
  it("rutaCanonicaReto compone /retos/{publicCode}-{slug}", () => {
    expect(rutaCanonicaReto("abcd2345", "mi-reto")).toBe("/retos/abcd2345-mi-reto");
  });

  it("invitado -> /entrar?siguiente= al reto (codificado)", () => {
    expect(enlaceEntrarParaParticipar("abcd2345", "mi-reto")).toBe(
      "/entrar?siguiente=%2Fretos%2Fabcd2345-mi-reto",
    );
  });
});
