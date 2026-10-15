/**
 * LAS DOS LISTAS DE DINERO DEL PANEL — paginadas de verdad, y filtrables.
 *
 * ┌─ LO QUE HABÍA ────────────────────────────────────────────────────────────────────────────────┐
 * │ `listarRetiradas` traía `take: 100`. Eso no es paginar: es un tope CIEGO. Con 101 solicitudes │
 * │ la 101 no existía para el admin y nada lo decía — ni un aviso, ni un control, ni un hueco. Y  │
 * │ los ajustes manuales se escribían en el `AuditLog` sin ninguna forma de verlos salvo SQL.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija:
 *  - KEYSET DE VERDAD en las dos: recorrer el histórico entero no repite ni se salta filas, ni
 *    siquiera cuando entra una fila nueva por arriba a mitad de lectura (que es lo que mata al
 *    OFFSET, y en esta cola pasa cada vez que alguien pide un cobro).
 *  - EL FILTRO FILTRA, y un valor inventado no vacía la lista.
 *  - NO QUEDA UN TOPE CIEGO: la página dice si hay más.
 *  - EL HISTORIAL DE AJUSTES sale del `AuditLog` con quién, a quién, cuánto, por qué y cuándo.
 *
 * Para romperlo a propósito: volver a `take: 100` sin cursor (rojo), cambiar el `lt` del cursor por
 * `lte` (rojo: repite filas), o leer el historial del ledger en vez de la auditoría (rojo: se queda
 * sin motivo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "l".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-listas" },
}));

import { listarAjustesMonedero } from "../src/server/services/monedero-admin";
import { listarRetiradas } from "../src/server/services/retirada-admin";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let userId: string;
let adminId: string;

const EPOCA = new Date("2026-10-01T10:00:00Z");
const enMinuto = (n: number): Date => new Date(EPOCA.getTime() + n * 60_000);

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  userId = await crearUsuario(prisma);
  adminId = await crearUsuario(prisma, { username: "la_admin" });
});

/** Una retirada escrita directa: lo que se prueba aquí es el recorrido, no el débito. */
async function retirada(n: number, estado = "PENDING", creada = enMinuto(n)): Promise<string> {
  const id = `w-${String(n).padStart(4, "0")}`;
  await prisma.withdrawal.create({
    data: {
      id,
      userId,
      amountCents: 5000 + n,
      currency: "USD",
      status: estado,
      metodo: "BANK",
      datosPago: `v1:x:y:${n}`,
      pista: "4417",
      idempotencyKey: `fixture:${n}`,
      createdAt: creada,
      updatedAt: creada,
    },
  });
  return id;
}

/** Un ajuste, tal y como lo escribe `ajustarSaldoMonedero`: en el `AuditLog`, con su metadata. */
async function ajuste(n: number, deltaCents = 1000): Promise<string> {
  const id = `a-${String(n).padStart(4, "0")}`;
  await prisma.auditLog.create({
    data: {
      id,
      actorId: adminId,
      action: "WALLET_ADJUST",
      targetType: "USER",
      targetId: userId,
      metadata: {
        deltaCents,
        antes: 0,
        despues: deltaCents,
        nota: `Motivo del ajuste ${n}`,
        idempotencyKey: `k-${n}`,
      },
      createdAt: enMinuto(n),
    },
  });
  return id;
}

describe("la cola de retiradas se recorre entera", () => {
  it("sin nada: lista vacía y sin cursor", async () => {
    const p = await listarRetiradas(prisma);
    expect(p.items).toEqual([]);
    expect(p.proximoCursor).toBeNull();
  });

  it("de tres en tres hasta el final, cada fila UNA vez", async () => {
    for (let i = 1; i <= 7; i++) await retirada(i);

    const vistas: string[] = [];
    let cursor: string | null = null;
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const p = await listarRetiradas(prisma, { cursor, limite: 3 });
      vistas.push(...p.items.map((r) => r.id));
      cursor = p.proximoCursor;
      if (!cursor) break;
    }

    expect(cursor, "no terminó de paginar").toBeNull();
    expect(vistas).toHaveLength(7);
    expect(new Set(vistas).size, "una fila salió dos veces").toBe(7);
    expect(vistas[0], "no empieza por la más reciente").toBe("w-0007");
  });

  it("UNA SOLICITUD NUEVA a mitad de lectura no desplaza la página siguiente", async () => {
    // El caso que mata al OFFSET, y en esta cola ocurre constantemente: cada cobro que alguien pide
    // entra por arriba mientras el admin despacha.
    for (let i = 1; i <= 4; i++) await retirada(i);
    const primera = await listarRetiradas(prisma, { limite: 2 });
    expect(primera.items.map((r) => r.id)).toEqual(["w-0004", "w-0003"]);

    await retirada(99, "PENDING", enMinuto(500));

    const segunda = await listarRetiradas(prisma, { cursor: primera.proximoCursor, limite: 2 });
    expect(
      segunda.items.map((r) => r.id),
      "la página siguiente repitió una fila",
    ).toEqual(["w-0002", "w-0001"]);
  });

  it("NO queda un tope ciego: con más de una página, lo dice", async () => {
    // Antes eran 100 sin más: la 101 no existía y nada avisaba. Ahora la ausencia de cursor es la
    // única forma de que una lista se acabe.
    for (let i = 1; i <= 30; i++) await retirada(i);
    const p = await listarRetiradas(prisma);
    expect(p.items.length).toBeLessThan(30);
    expect(p.proximoCursor, "se comió filas sin decirlo").not.toBeNull();
  });

  it("CON 101 SOLICITUDES SE LLEGA A LAS 101: ninguna es invisible", async () => {
    // ┌─ LA PREGUNTA QUE ORIGINÓ LA PIEZA ──────────────────────────────────────────────────────┐
    // │ "¿Qué pasa cuando el admin tenga varias solicitudes?". Con el `take: 100` de antes, la   │
    // │ número 101 no se podía alcanzar de ninguna manera: no había control, no había aviso, y   │
    // │ la pantalla se veía perfectamente bien. Esto lo recorre entero y las cuenta.             │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    await prisma.withdrawal.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        id: `m-${String(i).padStart(4, "0")}`,
        userId,
        amountCents: 5000 + i,
        currency: "USD",
        status: "PENDING",
        metodo: "BANK",
        datosPago: `v1:x:y:${i}`,
        pista: "4417",
        idempotencyKey: `masivo:${i}`,
        createdAt: enMinuto(i),
        updatedAt: enMinuto(i),
      })),
    });

    const vistas = new Set<string>();
    let cursor: string | null = null;
    // Tope de vueltas: si el cursor no avanzara, esto falla diciendo cuántas vio en vez de colgarse.
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const p = await listarRetiradas(prisma, { cursor });
      for (const r of p.items) vistas.add(r.id);
      cursor = p.proximoCursor;
      if (!cursor) break;
    }

    expect(cursor, "no llegó al final en 20 páginas").toBeNull();
    expect(vistas.size, "hay solicitudes inalcanzables").toBe(101);
  });

  it("y la consulta pide SOLO una página de más, no un tope escrito a mano", () => {
    // ┌─ ESTE MIRA EL CÓDIGO, Y DIGO POR QUÉ ───────────────────────────────────────────────────┐
    // │ Volver a `take: 100` NO cambia ningún resultado: el recorte lo hace el `slice(0, limite)`│
    // │ de después, así que la paginación sigue siendo correcta y todos los casos de arriba —el  │
    // │ de las 101 incluido— siguen en verde. Lo que rompe es el COSTE: traer cien filas, y      │
    // │ descifrar cien destinos, para enseñar veinticinco. Eso no se observa desde fuera.        │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    // Sin los comentarios de BLOQUE, no solo los de línea: el docblock de la función EXPLICA que
    // antes era `take: 100`, y con esa prosa dentro el caso salía rojo acusando a su propia
    // explicación. Es el falso ROJO del catálogo, y se arregla igual que el falso verde.
    const servicio = readFileSync(
      path.resolve(__dirname, "..", "src", "server", "services", "retirada-admin.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(servicio, "la cola volvió a un tope escrito a mano").toMatch(/take: limite \+ 1,/);
    expect(servicio).not.toMatch(/take: \d+/);
  });

  it("y el cliente no elige cuánto se le sirve", async () => {
    for (let i = 1; i <= 30; i++) await retirada(i);
    expect((await listarRetiradas(prisma, { limite: 9999 })).items.length).toBeLessThanOrEqual(25);
  });

  it("un cursor manipulado se trata como la primera página", async () => {
    for (let i = 1; i <= 3; i++) await retirada(i);
    for (const basura of ["", "nada", "'; DROP TABLE Withdrawal; --"]) {
      expect((await listarRetiradas(prisma, { cursor: basura })).items, basura).toHaveLength(3);
    }
  });
});

describe("el filtro por estado", () => {
  beforeEach(async () => {
    await retirada(1, "PENDING");
    await retirada(2, "PENDING");
    await retirada(3, "PAID");
    await retirada(4, "REJECTED");
  });

  it("filtra de verdad", async () => {
    expect((await listarRetiradas(prisma, { estado: "PENDING" })).items).toHaveLength(2);
    expect((await listarRetiradas(prisma, { estado: "PAID" })).items).toHaveLength(1);
    expect((await listarRetiradas(prisma, { estado: "APPROVED" })).items).toHaveLength(0);
  });

  it("sin filtro salen todas", async () => {
    expect((await listarRetiradas(prisma)).items).toHaveLength(4);
  });

  it("y el filtro SOBREVIVE al cambio de página", async () => {
    // Si el cursor se aplicara sin el filtro, la segunda página de "pendientes" traería pagadas.
    const primera = await listarRetiradas(prisma, { estado: "PENDING", limite: 1 });
    expect(primera.items[0]!.estado).toBe("PENDING");
    const segunda = await listarRetiradas(prisma, {
      estado: "PENDING",
      cursor: primera.proximoCursor,
      limite: 1,
    });
    expect(segunda.items).toHaveLength(1);
    expect(segunda.items[0]!.estado, "la página siguiente se saltó el filtro").toBe("PENDING");
    expect(segunda.proximoCursor).toBeNull();
  });
});

describe("el historial de ajustes", () => {
  it("sin ajustes, lista vacía", async () => {
    const p = await listarAjustesMonedero(prisma);
    expect(p.items).toEqual([]);
    expect(p.proximoCursor).toBeNull();
  });

  it("con N ajustes salen N, con quién, a quién, cuánto y por qué", async () => {
    await ajuste(1, 2500);
    await ajuste(2, -1000);

    const p = await listarAjustesMonedero(prisma);
    expect(p.items).toHaveLength(2);
    const ultimo = p.items[0]!;
    expect(ultimo.deltaCents).toBe(-1000);
    expect(ultimo.adminUsername).toBe("la_admin");
    expect(ultimo.usuarioId).toBe(userId);
    expect(ultimo.usuarioUsername).toBeTruthy();
    expect(ultimo.nota).toBe("Motivo del ajuste 2");
    expect(ultimo.antesCents).toBe(0);
    expect(ultimo.despuesCents).toBe(-1000);
  });

  it("NO se cuela otra acción del AuditLog", async () => {
    await ajuste(1);
    await prisma.auditLog.create({
      data: { actorId: adminId, action: "WITHDRAWAL_TRANSITION", targetId: userId, metadata: {} },
    });
    expect((await listarAjustesMonedero(prisma)).items).toHaveLength(1);
  });

  it("se recorre entero sin repetir ni saltar", async () => {
    for (let i = 1; i <= 7; i++) await ajuste(i);

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const p = await listarAjustesMonedero(prisma, { cursor, limite: 3 });
      vistos.push(...p.items.map((a) => a.id));
      cursor = p.proximoCursor;
      if (!cursor) break;
    }

    expect(cursor).toBeNull();
    expect(vistos).toHaveLength(7);
    expect(new Set(vistos).size).toBe(7);
    expect(vistos[0]).toBe("a-0007");
  });

  it("un metadata sin importe no inventa un 0 en el saldo", async () => {
    // El `metadata` es JSON libre: una fila antigua o escrita por otra versión puede no traerlo.
    // Lo que no vale es rellenar con 0 los saldos, porque un 0 en una columna de dinero se lee
    // como un dato. (El delta sí cae a 0 porque la fila tiene que pintar algo en su importe.)
    await prisma.auditLog.create({
      data: { id: "a-raro", actorId: adminId, action: "WALLET_ADJUST", targetId: userId },
    });
    const a = (await listarAjustesMonedero(prisma)).items[0]!;
    expect(a.antesCents).toBeNull();
    expect(a.despuesCents).toBeNull();
    expect(a.nota).toBeNull();
  });

  it("y CON metadata pero sin esos campos, tampoco", async () => {
    // La mitad que faltaba, y salió de un diente que no mordía: con el `metadata` entero ausente,
    // la lectura corta antes de llegar a mirar el campo, así que la rama que decide entre `null` y
    // `0` no se ejecutaba. Una fila con metadata a medias —que es el caso realista— sí la ejerce.
    await prisma.auditLog.create({
      data: {
        id: "a-medias",
        actorId: adminId,
        action: "WALLET_ADJUST",
        targetId: userId,
        metadata: { deltaCents: 1500, nota: "sin saldos" },
      },
    });
    const a = (await listarAjustesMonedero(prisma)).items[0]!;
    expect(a.deltaCents).toBe(1500);
    expect(a.antesCents, "rellenó el saldo anterior con un 0 inventado").toBeNull();
    expect(a.despuesCents).toBeNull();
  });

  it("y un ajuste a una cuenta BORRADA sigue en el historial", async () => {
    // Es el sentido de una auditoría: lo que se hizo no desaparece porque desaparezca la cuenta.
    await ajuste(1);
    await prisma.auditLog.update({ where: { id: "a-0001" }, data: { targetId: "ya-no-existe" } });
    const a = (await listarAjustesMonedero(prisma)).items[0]!;
    expect(a.usuarioUsername).toBeNull();
    expect(a.deltaCents).toBe(1000);
  });
});
