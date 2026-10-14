/**
 * EL HISTORIAL PROPIO, PAGINADO POR KEYSET — y por qué no vale un `OFFSET`.
 *
 * ┌─ EL CASO QUE LO JUSTIFICA ───────────────────────────────────────────────────────────────────┐
 * │ El histórico se lee de arriba abajo y, mientras tanto, la misma persona puede pedir OTRO     │
 * │ cobro. Esa fila entra por ARRIBA. Con `OFFSET 20`, la segunda página empieza 20 filas más    │
 * │ abajo de una lista que ahora tiene una de más: repite la última de la primera página. Con    │
 * │ `(createdAt, id) < (t, i)` la referencia es un VALOR de orden y no se mueve.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y el DTO sigue siendo la puerta: ni los datos de pago ni QUIÉN la procesó salen de aquí.
 *
 * Para romperlo a propósito: cambiar el `lt` del cursor por `lte` (rojo: la página siguiente repite
 * la última de la anterior), quitar del cursor la rama que compara el `id` (rojo: dos retiradas del
 * mismo milisegundo), invertir el orden (rojo), o meter `procesadaPorId` en el `select` (rojo).
 *
 * UNA DE LAS DOS MITADES DEL DESEMPATE NO SE PUEDE COMPROBAR EJECUTANDO, y está dicho en su caso:
 * quitar `{ id: "desc" }` del `orderBy` deja todo esto en verde porque el índice ya devuelve las
 * filas en ese orden. Esa mitad se fija leyendo el código, que es lo honesto cuando el resultado no
 * distingue.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "h".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-historial" },
}));

import { misRetiradas } from "../src/server/services/retirada";

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
 * Escribe una retirada DIRECTAMENTE, y aquí sí está justificado: lo que se prueba es el recorrido
 * de la lista, no el débito (que tiene su propio fichero). Hacerlas por el camino real obligaría a
 * sembrar saldo para cada una y a respetar el mínimo, y no mediría ni un keyset más.
 */
async function retirada(
  n: number,
  opts: { creada: Date; deQuien?: string; estado?: string } = { creada: new Date() },
): Promise<string> {
  const id = `w-${String(n).padStart(4, "0")}`;
  await prisma.withdrawal.create({
    data: {
      id,
      userId: opts.deQuien ?? userId,
      amountCents: 5000 + n,
      currency: "USD",
      status: opts.estado ?? "PENDING",
      metodo: "BANK",
      datosPago: `v1:x:y:${n}`,
      pista: "4417",
      idempotencyKey: `fixture:${n}:${opts.deQuien ?? userId}`,
      createdAt: opts.creada,
    },
  });
  return id;
}

const EPOCA = new Date("2026-10-01T10:00:00Z");
/** `n` minutos después de la época: las más recientes salen primero. */
const enMinuto = (n: number): Date => new Date(EPOCA.getTime() + n * 60_000);

describe("la primera página y el cursor", () => {
  it("sin nada: lista vacía y SIN cursor (no hay 'ver más' que ofrecer)", async () => {
    const p = await misRetiradas(prisma, userId);
    expect(p.items).toEqual([]);
    expect(p.nextCursor).toBeNull();
  });

  it("si caben todas, tampoco hay cursor", async () => {
    for (let i = 0; i < 3; i++) await retirada(i, { creada: enMinuto(i) });
    const p = await misRetiradas(prisma, userId, { limite: 5 });
    expect(p.items).toHaveLength(3);
    expect(p.nextCursor, "ofrece una página siguiente que no existe").toBeNull();
  });

  it("las más recientes primero", async () => {
    await retirada(1, { creada: enMinuto(1) });
    await retirada(2, { creada: enMinuto(5) });
    await retirada(3, { creada: enMinuto(3) });
    const p = await misRetiradas(prisma, userId);
    expect(p.items.map((r) => r.id)).toEqual(["w-0002", "w-0003", "w-0001"]);
  });

  it("y solo las MÍAS", async () => {
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    await retirada(1, { creada: enMinuto(1) });
    await retirada(2, { creada: enMinuto(2), deQuien: otra });

    expect((await misRetiradas(prisma, userId)).items.map((r) => r.id)).toEqual(["w-0001"]);
    expect((await misRetiradas(prisma, otra)).items.map((r) => r.id)).toEqual(["w-0002"]);
  });
});

describe("recorrer el histórico entero: ni repetidas ni saltadas", () => {
  it("de tres en tres hasta el final, y sale cada fila UNA vez", async () => {
    for (let i = 1; i <= 7; i++) await retirada(i, { creada: enMinuto(i) });

    const vistas: string[] = [];
    let cursor: string | null = null;
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const p = await misRetiradas(prisma, userId, { cursor, limite: 3 });
      vistas.push(...p.items.map((r) => r.id));
      cursor = p.nextCursor;
      if (!cursor) break;
    }

    expect(cursor, "no terminó de paginar").toBeNull();
    expect(vistas).toHaveLength(7);
    expect(new Set(vistas).size, "una fila salió dos veces").toBe(7);
    // Y en orden: de la más nueva a la más vieja, sin huecos.
    expect(vistas).toEqual(["w-0007", "w-0006", "w-0005", "w-0004", "w-0003", "w-0002", "w-0001"]);
  });

  it("UNA SOLICITUD NUEVA A MITAD DE LECTURA no desplaza la página siguiente", async () => {
    // Este es el caso que mata al OFFSET. Con `skip: 2`, la fila nueva empuja todo hacia abajo y la
    // segunda página devuelve otra vez la última de la primera.
    for (let i = 1; i <= 4; i++) await retirada(i, { creada: enMinuto(i) });

    const primera = await misRetiradas(prisma, userId, { limite: 2 });
    expect(primera.items.map((r) => r.id)).toEqual(["w-0004", "w-0003"]);

    // …y entre una página y otra, la persona pide otro cobro: entra por arriba.
    await retirada(99, { creada: enMinuto(50) });

    const segunda = await misRetiradas(prisma, userId, { cursor: primera.nextCursor, limite: 2 });
    expect(
      segunda.items.map((r) => r.id),
      "la página siguiente repitió una fila",
    ).toEqual(["w-0002", "w-0001"]);
  });

  it("dos retiradas del MISMO instante no se pisan: el id desempata en el CURSOR", async () => {
    // Sin la rama `createdAt = T AND id < i` del cursor, la página siguiente vuelve a traer las
    // filas de ese mismo instante: una se repite y otra se pierde. Esta mitad del desempate sí se
    // puede comprobar ejecutando.
    const mismo = enMinuto(10);
    await retirada(1, { creada: mismo });
    await retirada(2, { creada: mismo });
    await retirada(3, { creada: mismo });

    const a = await misRetiradas(prisma, userId, { limite: 2 });
    const b = await misRetiradas(prisma, userId, { cursor: a.nextCursor, limite: 2 });
    const todas = [...a.items, ...b.items].map((r) => r.id);

    expect(todas).toHaveLength(3);
    expect(new Set(todas).size).toBe(3);
    expect(todas).toEqual(["w-0003", "w-0002", "w-0001"]);
  });

  it("y el `id` del ORDEN está escrito, aunque hoy el índice lo regale", () => {
    // ┌─ POR QUÉ ESTE CASO MIRA EL CÓDIGO Y NO EL RESULTADO ─────────────────────────────────────┐
    // │ Lo intenté ejecutando y salió FALSO VERDE: quitando `{ id: "desc" }` del `orderBy`, los   │
    // │ casos de arriba siguen pasando. No porque la decisión dé igual, sino porque el índice     │
    // │ [userId, createdAt, id] ya devuelve las filas en ese orden al recorrerlo, así que InnoDB  │
    // │ lo regala. Un test que pasa por un detalle físico del motor no fija nada: el día que una  │
    // │ consulta no pueda usar ese índice —otro filtro, otro motor, un plan distinto— el orden    │
    // │ entre filas del mismo milisegundo pasa a ser arbitrario y el keyset se rompe EN SILENCIO. │
    // │                                                                                           │
    // │ Así que lo que se fija es la DECISIÓN, leyéndola: el orden y el cursor comparan la misma  │
    // │ tupla. Es la mitad que no se puede observar; la otra mitad está en el caso de arriba.     │
    // └───────────────────────────────────────────────────────────────────────────────────────────┘
    const servicio = readFileSync(
      path.resolve(__dirname, "..", "src", "server", "services", "retirada.ts"),
      "utf8",
    ).replace(/^\s*\/\/.*$/gm, "");
    expect(servicio, "el orden del historial perdió el desempate por id").toMatch(
      /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}\]/,
    );
    expect(servicio, "el keyset dejó de comparar la tupla completa").toMatch(
      /createdAt: new Date\(desde\.creadoMs\), id: \{ lt: desde\.id \}/,
    );
  });

  it("un cursor manipulado no revienta: se trata como la primera página", async () => {
    for (let i = 1; i <= 3; i++) await retirada(i, { creada: enMinuto(i) });
    for (const basura of [
      "",
      "no-es-un-cursor",
      "'; DROP TABLE Withdrawal; --",
      "999.x".repeat(50),
    ]) {
      const p = await misRetiradas(prisma, userId, { cursor: basura });
      expect(p.items, `cursor "${basura.slice(0, 20)}"`).toHaveLength(3);
    }
  });

  it("y el cliente no elige cuánto se le sirve", async () => {
    for (let i = 1; i <= 25; i++) await retirada(i, { creada: enMinuto(i) });
    // Un `limite` enorme se recorta al tope duro del servicio; uno absurdo no rompe nada.
    expect((await misRetiradas(prisma, userId, { limite: 9999 })).items).toHaveLength(20);
    expect((await misRetiradas(prisma, userId, { limite: 0 })).items).toHaveLength(1);
  });
});

describe("el DTO sigue siendo la puerta", () => {
  it("ni datos de pago ni quién la procesó", async () => {
    const id = await retirada(1, { creada: enMinuto(1) });
    const admin = await crearUsuario(prisma, { username: "la_admin" });
    await prisma.withdrawal.update({
      where: { id },
      data: { status: "PAID", procesadaPorId: admin, procesadaEn: enMinuto(30) },
    });

    const p = await misRetiradas(prisma, userId);
    const crudo = JSON.stringify(p);
    expect(crudo, "los datos de pago viajan en el DTO").not.toMatch(/datosPago|v1:/);
    expect(crudo, "el admin que la procesó viaja en el DTO").not.toMatch(/procesadaPor/i);
    expect(crudo).not.toContain(admin);
    // Lo que SÍ sale: cuándo se movió por última vez, que es lo que la pantalla puede contar.
    expect(p.items[0]!.actualizadaEn?.toISOString()).toBe(enMinuto(30).toISOString());
  });

  it("y una sin tocar no finge una fecha de movimiento", async () => {
    await retirada(1, { creada: enMinuto(1) });
    expect((await misRetiradas(prisma, userId)).items[0]!.actualizadaEn).toBeNull();
  });
});
