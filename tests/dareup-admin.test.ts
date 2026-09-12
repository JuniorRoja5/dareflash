/**
 * DAREUP EN EL PANEL: ajustar puntos a mano y leer el historial (Fase 4). Contra la BD, con dientes.
 *
 * El ajuste es una fila NUEVA de ledger por `applyPoints`, nunca una mutación del saldo; la nota es el
 * por qué, el refId es quién. Y puntos no son victorias: un ajuste no mueve el ranking del mes.
 *
 * Para romperlo a propósito: mutar `pointsBalance` en vez de pasar por `applyPoints` (rojo: filas,
 * idempotencia y reconciliación); no guardar la nota (rojo); resolver el autor con una consulta por
 * fila (rojo el de N+1).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AJUSTE_DELTA_MAX, RAZON_AJUSTE_ADMIN } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { periodoDe } from "../src/lib/periodo";
import { ajustarPuntos, claveAjuste, historialPuntos } from "../src/server/services/dareup-admin";
import { applyPoints } from "../src/server/services/ledger";
import { rankingMensual } from "../src/server/services/ranking";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;
let usuario: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "admin_dareup" });
  usuario = await crearUsuario(prisma, { username: "jugadora" });
});

const NOTA = "Compensación por un fallo del cierre";

function ajustar(
  delta: number,
  opciones: { nota?: string; clave?: string; por?: string; a?: string } = {},
) {
  return ajustarPuntos(prisma, {
    adminId: opciones.por ?? admin,
    userId: opciones.a ?? usuario,
    delta,
    nota: opciones.nota ?? NOTA,
    clave: opciones.clave ?? crypto.randomUUID(),
  });
}

const saldo = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { pointsBalance: true } }))
    .pointsBalance;
const filas = (id: string) => prisma.pointsLedger.findMany({ where: { userId: id } });

describe("ajustarPuntos", () => {
  it("inserta EXACTAMENTE una fila ADMIN_AJUSTE, con la nota y refId = el admin", async () => {
    const r = await ajustar(40, { nota: "  Premio de un evento presencial  " });

    expect(r).toEqual({ aplicado: true, saldo: 40 });
    const f = await filas(usuario);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      delta: 40,
      reason: RAZON_AJUSTE_ADMIN,
      refType: "ADMIN",
      refId: admin,
      nota: "Premio de un evento presencial", // recortada
    });
    expect(await saldo(usuario)).toBe(40);
  });

  it("reenviar el MISMO ajuste (misma clave) es un no-op: ni otra fila ni otro cambio de saldo", async () => {
    const clave = crypto.randomUUID();
    await ajustar(25, { clave });
    const otraVez = await ajustar(25, { clave });

    expect(otraVez).toEqual({ aplicado: false, saldo: 25 });
    expect(await filas(usuario)).toHaveLength(1);
    expect(await saldo(usuario)).toBe(25);
  });

  it("la clave lleva espacio de nombres por admin: la misma clave de OTRO admin es otro ajuste", async () => {
    const otroAdmin = await crearUsuario(prisma, { username: "otro_admin" });
    const clave = crypto.randomUUID();
    await ajustar(5, { clave });
    await ajustar(5, { clave, por: otroAdmin });

    expect(claveAjuste(admin, clave)).not.toBe(claveAjuste(otroAdmin, clave));
    expect(await filas(usuario)).toHaveLength(2);
    expect(await saldo(usuario)).toBe(10);
  });

  it("el saldo-caché RECONCILIA con el ledger tras ajustes en los dos sentidos", async () => {
    await applyPoints(prisma, {
      userId: usuario,
      delta: 30,
      reason: "WIN_CHALLENGE",
      refType: "CHALLENGE",
      refId: "reto-1",
      idempotencyKey: "cierre-reto-1",
    });
    await ajustar(100);
    await ajustar(-45);
    await ajustar(7);

    const suma = await prisma.pointsLedger.aggregate({
      where: { userId: usuario },
      _sum: { delta: true },
    });
    expect(await saldo(usuario)).toBe(suma._sum.delta);
    expect(await saldo(usuario)).toBe(92);
  });

  it("uno POSITIVO que cruza umbral avisa SUBISTE_NIVEL; uno negativo no avisa de nada", async () => {
    await ajustar(150); // 0 -> 150: Challenger
    const tras = () =>
      prisma.notification.findMany({
        where: { userId: usuario },
        select: { tipo: true, refId: true },
      });
    expect(await tras()).toEqual([{ tipo: "SUBISTE_NIVEL", refId: "challenger" }]);

    await ajustar(-100); // 150 -> 50: vuelve a Rookie, y no existe el aviso "bajaste"
    expect(await tras()).toHaveLength(1);
  });

  it("no puede dejar los puntos en NEGATIVO: rechazado, sin fila y con el saldo intacto", async () => {
    await ajustar(10);
    await expect(ajustar(-11)).rejects.toMatchObject({ code: "SALDO_NEGATIVO" });
    expect(await filas(usuario)).toHaveLength(1);
    expect(await saldo(usuario)).toBe(10);
  });

  it("la NOTA es obligatoria: vacía, solo espacios o demasiado corta, rechazado sin fila", async () => {
    for (const nota of ["", "     ", "ok"]) {
      await expect(ajustar(10, { nota })).rejects.toMatchObject({ code: "NOTA_OBLIGATORIA" });
    }
    expect(await filas(usuario)).toHaveLength(0);
  });

  it("la cantidad tiene que ser un entero distinto de 0, dentro del tope", async () => {
    for (const delta of [0, 1.5, AJUSTE_DELTA_MAX + 1, -(AJUSTE_DELTA_MAX + 1)]) {
      await expect(ajustar(delta)).rejects.toMatchObject({ code: "DELTA_INVALIDO" });
    }
    expect(await filas(usuario)).toHaveLength(0);
  });

  it("un usuario que no existe: USUARIO_NO_EXISTE", async () => {
    await expect(ajustar(10, { a: "no-existe" })).rejects.toMatchObject({
      code: "USUARIO_NO_EXISTE",
    });
  });

  it("PUNTOS NO SON VICTORIAS: el ajuste no mueve RankingMensual.victorias ni el orden", async () => {
    const periodo = periodoDe(new Date());
    const lider = await crearUsuario(prisma, { username: "lider_del_mes" });
    await prisma.rankingMensual.createMany({
      data: [
        { periodo, userId: lider, victorias: 3 },
        { periodo, userId: usuario, victorias: 1 },
      ],
    });
    const antes = await rankingMensual(prisma);

    await ajustar(AJUSTE_DELTA_MAX); // muchos más puntos que nadie

    const despues = await rankingMensual(prisma);
    expect(despues.filas.map((f) => [f.userId, f.victorias])).toEqual(
      antes.filas.map((f) => [f.userId, f.victorias]),
    );
    expect(despues.filas.map((f) => f.userId)).toEqual([lider, usuario]);
    // Lo que SÍ cambia: sus puntos (y con ellos su nivel).
    expect(despues.filas[1]?.puntos).toBe(AJUSTE_DELTA_MAX);
  });
});

describe("historialPuntos", () => {
  it("recorre TODO por keyset, del más nuevo al más viejo, sin repetir ni saltar", async () => {
    for (let i = 1; i <= 7; i += 1) await ajustar(i, { nota: `Ajuste número ${i}` });
    const esperado = (
      await prisma.pointsLedger.findMany({
        where: { userId: usuario },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      })
    ).map((f) => f.id);

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let vuelta = 0; vuelta < 10; vuelta += 1) {
      const p: Awaited<ReturnType<typeof historialPuntos>> = await historialPuntos(
        prisma,
        usuario,
        { cursor, limite: 3 },
      );
      vistos.push(...p.items.map((m) => m.id));
      cursor = p.nextCursor;
      if (cursor === null) break;
    }

    expect(vistos).toEqual(esperado);
  });

  it("cada movimiento trae razón, referencia, fecha, nota y QUIÉN hizo el ajuste", async () => {
    await applyPoints(prisma, {
      userId: usuario,
      delta: 30,
      reason: "WIN_CHALLENGE",
      refType: "CHALLENGE",
      refId: "reto-1",
      idempotencyKey: "cierre-reto-1",
    });
    await ajustar(-5, { nota: "Voto duplicado detectado" });

    const { items } = await historialPuntos(prisma, usuario);
    const ajuste = items.find((m) => m.razon === RAZON_AJUSTE_ADMIN);
    const cierre = items.find((m) => m.razon === "WIN_CHALLENGE");

    expect(ajuste).toMatchObject({
      delta: -5,
      refType: "ADMIN",
      refId: admin,
      nota: "Voto duplicado detectado",
      autor: "admin_dareup",
    });
    expect(ajuste?.creadoEnMs).toBeGreaterThan(0);
    // Lo automático se explica por su razón y su ref: ni nota ni autor inventados.
    expect(cierre).toMatchObject({ delta: 30, refType: "CHALLENGE", nota: null, autor: null });
  });

  it("sin N+1: UNA consulta al ledger y UNA de usuarios por página, haya los admins que haya", async () => {
    const admins = [admin];
    for (let i = 0; i < 3; i += 1) admins.push(await crearUsuario(prisma));
    for (let i = 0; i < 8; i += 1) await ajustar(1, { por: admins[i % admins.length] });

    const llamadas = { ledger: 0, user: 0 };
    const contar = <T extends object>(delegado: T, clave: keyof typeof llamadas): T =>
      new Proxy(delegado, {
        get(obj, prop) {
          const valor = Reflect.get(obj, prop) as unknown;
          if (prop === "findMany" && typeof valor === "function") {
            return (...args: unknown[]) => {
              llamadas[clave] += 1;
              return (valor as (...a: unknown[]) => unknown).apply(obj, args);
            };
          }
          return valor;
        },
      });
    const db = new Proxy(prisma, {
      get(obj, prop) {
        if (prop === "pointsLedger") return contar(obj.pointsLedger, "ledger");
        if (prop === "user") return contar(obj.user, "user");
        return Reflect.get(obj, prop) as unknown;
      },
    });

    const { items } = await historialPuntos(db, usuario);

    expect(items).toHaveLength(8);
    expect(new Set(items.map((m) => m.autor)).size).toBe(4); // cuatro admins distintos, resueltos
    expect(llamadas).toEqual({ ledger: 1, user: 1 });
  });

  it("un usuario sin movimientos: página vacía y sin cursor", async () => {
    expect(await historialPuntos(prisma, usuario)).toEqual({ items: [], nextCursor: null });
  });

  it("un cursor corrupto se ignora: se sirve la primera página", async () => {
    await ajustar(3);
    const p = await historialPuntos(prisma, usuario, { cursor: "basura" });
    expect(p.items).toHaveLength(1);
  });
});

describe("el ajuste no escribe el saldo a mano (estructural)", () => {
  it("pasa por applyPoints y no hay ni un UPDATE de pointsBalance en el servicio", () => {
    const codigo = readFileSync(
      path.resolve(__dirname, "..", "src", "server", "services", "dareup-admin.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).toMatch(/applyPoints\(/);
    expect(codigo).not.toMatch(/pointsBalance\s*:\s*\{/); // increment / decrement / set
    expect(codigo).not.toMatch(/\.user\.update|\$executeRaw|UPDATE\s+`?User/);
    expect(codigo).not.toMatch(/pointsLedger\.(update|delete)/); // ni editar ni borrar filas
  });
});
