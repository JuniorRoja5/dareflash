/**
 * «ÚLTIMOS MOVIMIENTOS» DEL MONEDERO, PAGINADO POR KEYSET (PU1) — y por qué no vale un `OFFSET`.
 *
 * Antes era un tope: los 10 últimos, sin forma de ver el resto. Ahora se recorre entero, de 10 en 10,
 * con el MISMO keyset que el historial de solicitudes (`(createdAt, id) < (t, i)`), apoyado en el
 * índice `[userId, createdAt, id]` que entró con su migración.
 *
 * EL CASO QUE MATA AL OFFSET es el mismo que en las solicitudes: mientras alguien lee, entra un
 * movimiento nuevo POR ARRIBA (un premio, un cobro, un ajuste del equipo). Con `skip`, la página
 * siguiente repite la última fila de la anterior. Y sin cursor —volviendo a pedir siempre la
 * primera— la «página dos» es otra vez la uno.
 *
 * Para romperlo: `skip: limite` en vez del cursor (rojo: repite), olvidar pasar `desde` al `where`
 * (rojo: la página dos es la uno), `lte` en `dondeDesde` (rojo), quitar el `id` del orden (rojo, por
 * lectura: el índice lo regala al ejecutar, ver `retirada-historial`), o quitar el índice de la
 * migración (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { falso } from "./helpers/valores-falsos";

vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "h".repeat(40), AUTH_SECRET: falso("auth-secret-movimientos") },
}));

import { misMovimientosMonedero } from "../src/server/services/retirada";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma);
});

/**
 * Escribe un movimiento DIRECTAMENTE: lo que se prueba es el recorrido de la lista, no el ledger
 * (que tiene sus propios ficheros). Por el camino real habría que montar un reto o un cobro por fila.
 */
async function movimiento(
  n: number,
  opts: { creado: Date; deQuien?: string } = { creado: new Date() },
): Promise<string> {
  const id = `mv-${String(n).padStart(4, "0")}`;
  await prisma.walletLedger.create({
    data: {
      id,
      userId: opts.deQuien ?? userId,
      amountCents: 1000 + n,
      currency: "USD",
      entryType: "CREDIT",
      status: "COMPLETED",
      idempotencyKey: `fixture-mv:${n}:${opts.deQuien ?? userId}`,
      refType: "PRIZE",
      createdAt: opts.creado,
    },
  });
  return id;
}

const EPOCA = new Date("2026-10-01T10:00:00Z");
const enMinuto = (n: number): Date => new Date(EPOCA.getTime() + n * 60_000);
const ids = (p: { items: { id: string }[] }) => p.items.map((m) => m.id);

describe("la página y su cursor", () => {
  it("sin nada: vacía y SIN cursor", async () => {
    const p = await misMovimientosMonedero(prisma, userId);
    expect(p.items).toEqual([]);
    expect(p.nextCursor).toBeNull();
  });

  it("de 10 en 10: 25 movimientos son tres páginas, cada fila UNA vez y en orden", async () => {
    for (let i = 1; i <= 25; i++) await movimiento(i, { creado: enMinuto(i) });

    const vistas: string[] = [];
    const tamanos: number[] = [];
    let cursor: string | null = null;
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const p = await misMovimientosMonedero(prisma, userId, { cursor, limite: 10 });
      vistas.push(...ids(p));
      tamanos.push(p.items.length);
      cursor = p.nextCursor;
      if (!cursor) break;
    }

    expect(tamanos).toEqual([10, 10, 5]);
    expect(cursor, "no terminó de paginar").toBeNull();
    expect(new Set(vistas).size, "una fila salió dos veces").toBe(25);
    expect(vistas[0]).toBe("mv-0025");
    expect(vistas.at(-1)).toBe("mv-0001");
  });

  it("SIN CURSOR NO HAY PÁGINA DOS: la segunda no repite nada de la primera", async () => {
    for (let i = 1; i <= 12; i++) await movimiento(i, { creado: enMinuto(i) });
    const primera = await misMovimientosMonedero(prisma, userId, { limite: 10 });
    expect(primera.nextCursor, "con 12 filas tiene que haber página siguiente").not.toBeNull();
    const segunda = await misMovimientosMonedero(prisma, userId, {
      cursor: primera.nextCursor,
      limite: 10,
    });
    expect(ids(segunda), "la página dos es otra vez la uno").toEqual(["mv-0002", "mv-0001"]);
  });

  it("UN MOVIMIENTO NUEVO A MITAD DE LECTURA no desplaza la página siguiente (mata al OFFSET)", async () => {
    for (let i = 1; i <= 4; i++) await movimiento(i, { creado: enMinuto(i) });
    const primera = await misMovimientosMonedero(prisma, userId, { limite: 2 });
    expect(ids(primera)).toEqual(["mv-0004", "mv-0003"]);

    // Entre una página y otra entra un premio: por ARRIBA.
    await movimiento(99, { creado: enMinuto(50) });

    const segunda = await misMovimientosMonedero(prisma, userId, {
      cursor: primera.nextCursor,
      limite: 2,
    });
    expect(ids(segunda), "la página siguiente repitió una fila").toEqual(["mv-0002", "mv-0001"]);
  });

  it("dos movimientos del MISMO instante no se pisan: el id desempata en el cursor", async () => {
    const mismo = enMinuto(10);
    for (let i = 1; i <= 3; i++) await movimiento(i, { creado: mismo });
    const a = await misMovimientosMonedero(prisma, userId, { limite: 2 });
    const b = await misMovimientosMonedero(prisma, userId, { cursor: a.nextCursor, limite: 2 });
    expect([...ids(a), ...ids(b)]).toEqual(["mv-0003", "mv-0002", "mv-0001"]);
  });

  it("solo los MÍOS, y un cursor manipulado es la primera página", async () => {
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    for (let i = 1; i <= 3; i++) await movimiento(i, { creado: enMinuto(i) });
    await movimiento(9, { creado: enMinuto(9), deQuien: otra });
    for (const basura of ["", "no-es-un-cursor", "'; DROP TABLE WalletLedger; --"]) {
      const p = await misMovimientosMonedero(prisma, userId, { cursor: basura });
      expect(ids(p), `cursor "${basura}"`).toEqual(["mv-0003", "mv-0002", "mv-0001"]);
    }
  });

  it("el cliente no elige cuánto se le sirve", async () => {
    for (let i = 1; i <= 25; i++) await movimiento(i, { creado: enMinuto(i) });
    expect((await misMovimientosMonedero(prisma, userId, { limite: 9999 })).items).toHaveLength(20);
    expect((await misMovimientosMonedero(prisma, userId, { limite: 0 })).items).toHaveLength(1);
  });
});

describe("lo que el resultado no distingue, leído", () => {
  /** El cuerpo de `misMovimientosMonedero`, sin comentarios. */
  const cuerpo = (() => {
    const fuente = readFileSync(
      path.resolve(__dirname, "..", "src", "server", "services", "retirada.ts"),
      "utf8",
    );
    const desde = fuente.indexOf("export async function misMovimientosMonedero(");
    const hasta = fuente.indexOf("\n}\n", desde);
    return fuente
      .slice(desde, hasta)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  })();

  it("el orden lleva el desempate por id (el índice lo regala al ejecutar)", () => {
    expect(cuerpo, "no encuentro la función").not.toBe("");
    expect(cuerpo).toMatch(/orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/);
  });

  it("ni `skip` ni `OFFSET`: el keyset entra en el where", () => {
    expect(cuerpo, "un OFFSET en los movimientos").not.toMatch(/\bskip\b|OFFSET/i);
    expect(cuerpo, "el where no lleva el keyset").toMatch(
      /where: \{ userId, \.\.\.dondeDesde\(desde\) \}/,
    );
  });

  it("el índice del keyset existe en la base de datos", async () => {
    const filas = await prisma.$queryRaw<
      { Key_name: string; Column_name: string; Seq_in_index: bigint }[]
    >`
      SHOW INDEX FROM WalletLedger`;
    const porIndice = new Map<string, string[]>();
    for (const f of [...filas].sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))) {
      porIndice.set(f.Key_name, [...(porIndice.get(f.Key_name) ?? []), f.Column_name]);
    }
    expect(
      [...porIndice.values()].map((c) => c.join(",")),
      "falta el índice [userId, createdAt, id]: cada página ordenaría en memoria",
    ).toContain("userId,createdAt,id");
  });
});
