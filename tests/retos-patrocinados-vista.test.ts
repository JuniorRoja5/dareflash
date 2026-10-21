/**
 * EL PATROCINIO POR FUERA (Fase 9 · P1) — lo que no se ve en un render.
 *
 *  - LA COMISIÓN NO SALE DE LA BASE DE DATOS hacia el público. No se selecciona en el servicio, no
 *    está en el DTO y no aparece en ninguna vista de usuario. Es un trato con la marca: un usuario
 *    no tiene por qué saber cuánto se factura por él, ni el ganador por qué cobró lo que cobró.
 *  - EL DISTINTIVO ES DEL PATROCINADO, con candado: lo monta una sola pieza y solo si hay sponsor.
 *  - Y SE VE PARA TODOS: ninguna consulta pública filtra por `esPatrocinado`, igual que no filtra
 *    por `soloVip`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const SHELL = ["src", "app", "(app)", "(shell)"];

const sinComentarios = (src: string) =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^\s*\/\/.*$/gm, "");
const crudo = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const leer = (...p: string[]) => sinComentarios(crudo(...p));

const PUBLICO = ["src", "server", "services", "retos-publico.ts"];
const TARJETA = [...SHELL, "retos", "tarjeta-reto.tsx"];
const MARCA = [...SHELL, "retos", "marca-sponsor.tsx"];
const DETALLE = [...SHELL, "retos", "[codigo]", "page.tsx"];

describe("el detector mira el CÓDIGO, no el comentario", () => {
  it("quitar comentarios cambia los ficheros", () => {
    for (const f of [PUBLICO, TARJETA, MARCA]) {
      expect(leer(...f).length, f.join("/")).toBeLessThan(crudo(...f).length);
    }
    // Control: el servicio EXPLICA en prosa que no trae la comisión, y nombra el campo.
    expect(crudo(...PUBLICO)).toMatch(/comisionBps/);
    expect(leer(...PUBLICO)).not.toMatch(/comisionBps/);
  });
});

describe("la comisión no llega al público", () => {
  it("el servicio público NO la selecciona", () => {
    // La puerta de FUERA es el `select`: lo que no se trae no se puede filtrar por descuido en un
    // DTO. Es la misma lección que la nota del admin en el historial de boosts.
    expect(leer(...PUBLICO), "el servicio público se trae la comisión").not.toMatch(/comisionBps/);
  });

  it("ni el DTO ni las vistas la nombran", () => {
    const vistas = [leer(...TARJETA), leer(...MARCA), leer(...DETALLE)].join("\n");
    expect(vistas).not.toMatch(/comisionBps|comisi[óo]n/i);
  });

  it("y el historial del monedero tampoco: ahí solo hay premios", () => {
    // El ganador ve su crédito, no de dónde salió el dinero de la marca.
    const historial = leer(...SHELL, "wallet", "movimientos-monedero.tsx");
    expect(historial).not.toMatch(/comisi[óo]n|sponsor|patrocin/i);
  });
});

describe("el distintivo del patrocinio, con candado", () => {
  it("lo monta UNA pieza y solo si hay sponsor", () => {
    const tarjeta = leer(...TARJETA);
    expect(tarjeta).toMatch(/\{reto\.sponsor \?[\s\S]{0,160}<MarcaSponsor/);
    // La rama del reto NORMAL se devuelve antes y no puede llevarlo.
    const normal = /if \(!reto\.soloVip\) \{[\s\S]*?\n  \}/.exec(tarjeta)?.[0] ?? "";
    expect(normal.length, "no encuentro la rama del reto normal").toBeGreaterThan(80);
    expect(normal, "la rama del reto normal monta la marca").not.toMatch(/<MarcaSponsor/);
  });

  it("y el DTO exige nombre, no solo el flag", () => {
    // Un reto marcado como patrocinado sin nombre —una fila vieja, un arreglo a mano— pintaría
    // "Patrocinado por" y un hueco.
    const publico = leer(...PUBLICO);
    expect(publico).toMatch(/f\.esPatrocinado && f\.sponsorNombre/);
  });

  it("la marca NO usa el oro del VIP ni el verde de acción", () => {
    // El oro significa Mythic y el verde es la acción de la pantalla. Un patrocinio no es ninguna
    // de las dos cosas, y los tres pueden coincidir en la misma tarjeta.
    const marca = leer(...MARCA);
    expect(marca, "la marca usa el oro del VIP").not.toMatch(/vip-gold/);
    expect(marca, "la marca usa el verde de acción").not.toMatch(/--df-action|bg-action/);
    expect(marca, "hex a mano").not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("un reto patrocinado se ve igual que cualquier otro", () => {
  it("ninguna consulta pública filtra por `esPatrocinado`", () => {
    const publico = leer(...PUBLICO);
    const wheres = [...publico.matchAll(/where:\s*\{[\s\S]*?\}/g)].map((m) => m[0]);
    expect(wheres.length, "no encuentro los `where` del servicio").toBeGreaterThan(2);
    for (const w of wheres) {
      expect(w, "un `where` filtra por patrocinio").not.toMatch(/esPatrocinado|sponsor/i);
    }
  });
});
