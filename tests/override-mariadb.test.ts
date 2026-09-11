/**
 * EL OVERRIDE DEL DRIVER `mariadb` EXISTE POR UN MOTIVO, Y CADUCA.
 *
 * `mariadb` 3.4.5 tiene un aviso de posible inyección SQL en el escapado de parámetros `Buffer` bajo
 * los charsets big5/gbk/sjis/cp932/gb18030. NO nos afecta —la base y la conexión son utf8mb4— pero
 * es el driver de la base de datos, y el arreglo está en 3.5.x.
 *
 * POR QUÉ ES UN `overrides` Y NO UNA SUBIDA DE VERSIÓN: `mariadb` no es dependencia nuestra. La trae
 * `@prisma/adapter-mariadb`, que la FIJA a `3.4.5` exacto — no a un rango —, y la versión siguiente
 * del adapter (7.10.0) sigue fijando lo mismo. Subir Prisma no lo arregla. La única forma de tener el
 * driver parcheado es forzarlo desde aquí, lo que significa correr el adapter contra una versión del
 * driver con la que Prisma no lo publicó. Se aceptó con la evidencia de la suite entera en verde
 * (transacciones, `FOR UPDATE`, SQL crudo, pool), no por fe.
 *
 * Este test existe para las dos direcciones en que esto puede estropearse sin avisar:
 *  - que un `npm install` o una edición a mano quite el override y volvamos a 3.4.5 en silencio;
 *  - que Prisma suba SU fijación y el override siga aquí sin hacer nada — o peor, forzando una versión
 *    MÁS VIEJA que la que Prisma ya pide. Cuando eso pase, esto se pone rojo para que se retire.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const leerJson = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(RAIZ, rel), "utf8")) as Record<string, unknown>;

/** Primera versión del driver con el arreglo. */
const MINIMA_PARCHEADA = "3.5.4";

/** Compara `a.b.c` numéricamente. Negativo si x < y. Suficiente para versiones sin prerelease. */
function compararVersion(x: string, y: string): number {
  const a = x.split(".").map(Number);
  const b = y.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

describe("override del driver mariadb", () => {
  it("está declarado en package.json", () => {
    const overrides = (leerJson("package.json").overrides ?? {}) as Record<string, string>;
    expect(overrides.mariadb).toBeDefined();
    // Y convive con los que ya había: tocarlo no puede llevarse por delante los demás.
    expect(overrides.sharp).toBeDefined();
    expect(overrides["find-my-way"]).toBeDefined();
  });

  it("lo instalado es la versión parcheada, no la 3.4.5", () => {
    const instalada = String(leerJson("node_modules/mariadb/package.json").version);
    expect(compararVersion(instalada, MINIMA_PARCHEADA)).toBeGreaterThanOrEqual(0);
  });

  it("sigue haciendo falta: el adapter de Prisma aún fija una versión sin parchear", () => {
    // Cuando esto falle, Prisma ya pide una versión parcheada por sí mismo: RETIRA el override de
    // package.json y este fichero entero. Un override que no hace nada es una trampa para la próxima
    // subida de Prisma, porque podría forzar una versión más vieja de la que Prisma pide.
    const adapter = leerJson("node_modules/@prisma/adapter-mariadb/package.json");
    const pedida = String((adapter.dependencies as Record<string, string>).mariadb).replace(
      /^[\^~=]/,
      "",
    );
    expect(compararVersion(pedida, MINIMA_PARCHEADA)).toBeLessThan(0);
  });
});
