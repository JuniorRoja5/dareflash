/**
 * Perfil · validación del NOMBRE — con dientes, en los dos sentidos. La función pura `nombreEsValido`
 * (UX del cliente) y el esquema Zod `displayNameSchema` (gate del servidor) DEBEN coincidir: un nombre
 * que el cliente da por bueno el servidor lo acepta, y uno que el cliente rechaza el servidor también.
 * Romper la validación (aceptar vacío, aceptar `<script>`, saltarse la longitud) cae en rojo.
 */
import { describe, expect, it } from "vitest";

import {
  NOMBRE_MAX,
  nombreEsValido,
  normalizarNombre,
} from "../src/app/(app)/(shell)/perfil/perfil-logic";
import { displayNameSchema } from "../src/server/services/perfil";

const VALIDOS = ["Ana", "Ana Gómez", "José-María", "user_01", "O'Brien", "李小龙", "a.b"];
const INVALIDOS = [
  "", // vacío
  " ", // solo espacio
  "a", // demasiado corto (< 2)
  "x".repeat(NOMBRE_MAX + 1), // demasiado largo
  "<script>alert(1)</script>", // caracteres fuera de la whitelist (<, >, /)
  "hola & adiós", // & fuera de la whitelist
  "emoji 🎭", // emoji fuera de la whitelist
  "ruta/con/barras", // / fuera de la whitelist
];

describe("nombreEsValido (puro, UX del cliente)", () => {
  it("acepta nombres razonables (letras, números, acentos, no-latino y . _ ' -)", () => {
    for (const n of VALIDOS) expect(nombreEsValido(n), n).toBe(true);
  });

  it("rechaza vacío, fuera de longitud y caracteres no permitidos", () => {
    for (const n of INVALIDOS) expect(nombreEsValido(n), n).toBe(false);
  });

  it("normaliza recortando y colapsando espacios internos", () => {
    expect(normalizarNombre("  Ana   Gómez  ")).toBe("Ana Gómez");
    // Un nombre de solo espacios normaliza a vacío -> inválido (no cuela por los lados).
    expect(nombreEsValido("     ")).toBe(false);
  });
});

describe("displayNameSchema (Zod, gate del servidor)", () => {
  it("coincide con la función pura en AMBOS sentidos (cliente y servidor no divergen)", () => {
    for (const n of VALIDOS) expect(displayNameSchema.safeParse(n).success, n).toBe(true);
    for (const n of INVALIDOS) expect(displayNameSchema.safeParse(n).success, n).toBe(false);
  });

  it("devuelve el nombre NORMALIZADO (lo que de verdad se guarda)", () => {
    const r = displayNameSchema.safeParse("  Ana   Gómez  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("Ana Gómez");
  });

  it("rechaza un valor que no es string (el cuerpo no se fía de tipos)", () => {
    expect(displayNameSchema.safeParse(42).success).toBe(false);
    expect(displayNameSchema.safeParse(null).success).toBe(false);
    expect(displayNameSchema.safeParse(undefined).success).toBe(false);
  });
});
