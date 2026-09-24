/**
 * LA PUERTA DE NIVEL DE UN RETO — pieza PURA, sin base de datos.
 *
 * Lo que se fija:
 *  - es un MÍNIMO, no un nivel exacto: un Legend entra en un reto de Pro, y un Rookie no;
 *  - `rookie` (el default de la columna) NO restringe a nadie, que es lo que hace que la migración no
 *    necesitara backfill: los retos de antes quedaron abiertos, como eran;
 *  - se compara por TIER, no por puntos: mover el umbral de Pro no convierte un reto de Pro en otro;
 *  - una clave desconocida cae a "sin restricción", no a "nadie entra": ante un dato que este código
 *    no entiende, el fallo seguro en un reto con premio es dejar participar.
 *
 * Para romperlo: cambiar el `>=` por `===` (rojo en Legend sobre un reto de Pro); comparar puntos
 * contra `nivel.minimo` en vez de tiers (rojo en el caso del umbral movido); hacer que una clave
 * desconocida devuelva el tier más alto (rojo).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  esClaveNivel,
  mensajeNivelInsuficiente,
  nivelDeClave,
  NIVEL_MINIMO_ABIERTO,
  puedeParticiparPorNivel,
  retoAbiertoATodos,
} from "../src/lib/nivel-reto";
import { NIVELES } from "../src/lib/niveles";

/** Puntos justos para estar EN cada nivel, tomados de la escalera real. */
const PUNTOS = Object.fromEntries(NIVELES.map((n) => [n.clave, n.minimo])) as Record<
  string,
  number
>;

describe("es un MÍNIMO, no un nivel exacto", () => {
  it("un reto de Pro: Rookie y Challenger fuera; Pro, Elite y Legend dentro", () => {
    expect(puedeParticiparPorNivel(PUNTOS["rookie"]!, "pro")).toBe(false);
    expect(puedeParticiparPorNivel(PUNTOS["challenger"]!, "pro")).toBe(false);
    // 499 es Pro-menos-uno: el borde por debajo.
    expect(puedeParticiparPorNivel(PUNTOS["pro"]! - 1, "pro")).toBe(false);

    expect(puedeParticiparPorNivel(PUNTOS["pro"]!, "pro")).toBe(true);
    expect(puedeParticiparPorNivel(PUNTOS["elite"]!, "pro")).toBe(true);
    // El que más tiene NO se queda fuera por pasarse: con `===` en vez de `>=`, este caso cae.
    expect(puedeParticiparPorNivel(PUNTOS["legend"]!, "pro")).toBe(true);
  });

  it("cada nivel deja entrar a los de su tier y por encima, y a nadie más", () => {
    for (const exigido of NIVELES) {
      for (const quien of NIVELES) {
        expect(
          puedeParticiparPorNivel(quien.minimo, exigido.clave),
          `${quien.clave} en un reto de ${exigido.clave}`,
        ).toBe(quien.tier >= exigido.tier);
      }
    }
  });
});

describe("`rookie` es TODOS", () => {
  it("nadie queda fuera de un reto sin restricción, ni con cero puntos", () => {
    expect(NIVEL_MINIMO_ABIERTO).toBe("rookie");
    for (const puntos of [0, 1, 99, 100, 10_000]) {
      expect(puedeParticiparPorNivel(puntos, NIVEL_MINIMO_ABIERTO), String(puntos)).toBe(true);
    }
    // Puntos negativos no deberían existir, pero tampoco vetan: `nivelPorPuntos` ya cae a Rookie.
    expect(puedeParticiparPorNivel(-5, NIVEL_MINIMO_ABIERTO)).toBe(true);
  });

  it("la pantalla sabe que no hay candado que pintar", () => {
    expect(retoAbiertoATodos("rookie")).toBe(true);
    for (const n of ["challenger", "pro", "elite", "legend"]) {
      expect(retoAbiertoATodos(n), n).toBe(false);
    }
  });
});

describe("se compara por TIER, no por puntos", () => {
  it("el reto guarda la CLAVE, así que mover un umbral no lo convierte en otro reto", () => {
    // Si la puerta comparase `puntos >= 500` (el umbral de Pro congelado en el reto), subir Pro a 800
    // dejaría entrar a gente que ya no es Pro. Comparando tiers, "de Pro" sigue siendo "de Pro".
    const pro = nivelDeClave("pro");
    expect(pro.clave).toBe("pro");
    expect(puedeParticiparPorNivel(pro.minimo, "pro")).toBe(true);
    // Y quien está justo por debajo del umbral NO entra, sea cual sea el número.
    expect(puedeParticiparPorNivel(pro.minimo - 1, "pro")).toBe(false);
  });
});

describe("un dato que este código no entiende", () => {
  it("una clave desconocida NO veta a nadie (el fallo seguro es dejar participar)", () => {
    for (const basura of ["", "PRO", "diamante", "null", "'; DROP TABLE"]) {
      expect(nivelDeClave(basura).clave, basura).toBe("rookie");
      expect(puedeParticiparPorNivel(0, basura), basura).toBe(true);
    }
  });

  it("`esClaveNivel` reconoce las cinco y nada más", () => {
    for (const n of NIVELES) expect(esClaveNivel(n.clave), n.clave).toBe(true);
    for (const no of ["Pro", "", null, 3, undefined, "diamante"]) {
      expect(esClaveNivel(no), String(no)).toBe(false);
    }
  });
});

describe("el default de la columna", () => {
  it("la migración deja `rookie`, que es lo que hace que los retos de antes sigan abiertos", () => {
    // Esto NO se puede probar ejecutando: la BD de test ya tiene la migración aplicada, así que
    // cambiar el esquema no cambia nada que un test pueda ver. Lo destapó romperlo a propósito. Lo
    // que se protege es la DECISIÓN, y vive escrita en dos sitios que tienen que coincidir.
    const dir = join(process.cwd(), "prisma", "migrations");
    const conLaColumna = readdirSync(dir)
      .filter((m) => statSync(join(dir, m)).isDirectory())
      .map((m) => join(dir, m, "migration.sql"))
      .filter((p) => readFileSync(p, "utf8").includes("`nivelMinimo`"));

    expect(conLaColumna).toHaveLength(1);
    const sql = readFileSync(conLaColumna[0]!, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/DEFAULT 'rookie'/);
    // Y el esquema dice lo mismo: si divergieran, la próxima migración generada sería una sorpresa.
    const esquema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(esquema).toContain('nivelMinimo String @default("rookie")');
  });
});

describe("el copy del veto", () => {
  it("nombra el nivel que falta, en humano y sin códigos", () => {
    expect(mensajeNivelInsuficiente("pro")).toBe("Necesitas ser Pro para participar en este reto.");
    expect(mensajeNivelInsuficiente("legend")).toContain("Legend");
    // Nunca la clave interna en minúsculas ni un código.
    expect(mensajeNivelInsuficiente("elite")).not.toMatch(/\belite\b/);
  });
});
