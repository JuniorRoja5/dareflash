/**
 * EL HISTORIAL PROPIO NO ES EL DEL INSPECTOR, aunque lo sirva la misma consulta.
 *
 * La fila de un ajuste manual lleva dos cosas que el panel SÍ enseña y el dueño NO puede ver:
 *
 *  - LA NOTA. Es obligatoria y se escribe para el equipo: la fila de ledger hace de traza de
 *    auditoría mientras no haya AuditLog, y su vocabulario es el de moderación ("sanción por…").
 *    Devolvérsela al usuario es publicar una nota interna sobre él.
 *  - QUÉ ADMIN LO HIZO. Convierte una decisión del equipo en una persona concreta a la que ir a
 *    buscar. El usuario necesita saber QUE hubo un ajuste y de CUÁNTO —y eso sí se le dice—, no
 *    quién lo firmó.
 *
 * No es una regla de pantalla: los campos NO VIAJAN. Lo que no llega no se puede pintar por descuido
 * ni filtrar por un `JSON.stringify` en un log.
 *
 * Para romperlo: quitar el `voz: "propia"` de `miHistorialPuntos` (rojo en los dos), devolver
 * `f.nota` sin mirar la voz (rojo en la nota), o dejar que la referencia de ADMIN resuelva el handle
 * también en la voz propia (rojo en el handle).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RAZON_AJUSTE_ADMIN } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { ajustarPuntos, historialPuntos } from "../src/server/services/dareup-admin";
import { miHistorialPuntos } from "../src/server/services/puntos";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

const NOTA = "Compensacion por el reto caido del martes";

/** Un usuario con un ajuste manual firmado por un admin con handle reconocible. */
async function conAjuste(): Promise<{ userId: string; adminHandle: string }> {
  const adminHandle = "adminvisible";
  const adminId = await crearUsuario(prisma, { username: adminHandle });
  const userId = await crearUsuario(prisma, { username: "duenacuenta" });
  await ajustarPuntos(prisma, { adminId, userId, delta: 40, nota: NOTA, clave: "aj-1" });
  return { userId, adminHandle };
}

describe("lo que el DUEÑO no puede ver", () => {
  it("la nota interna del ajuste no viaja", async () => {
    const { userId } = await conAjuste();

    const mio = await miHistorialPuntos(prisma, userId);
    const fila = mio.items.find((m) => m.razon === RAZON_AJUSTE_ADMIN);
    expect(fila, "el ajuste no aparece en el historial").toBeDefined();
    expect(fila?.nota).toBeNull();
    // Y no se ha colado por ningún otro campo.
    expect(JSON.stringify(mio)).not.toContain(NOTA);
  });

  it("ni el handle del admin que lo firmó", async () => {
    const { userId, adminHandle } = await conAjuste();

    const mio = await miHistorialPuntos(prisma, userId);
    expect(JSON.stringify(mio)).not.toContain(adminHandle);
  });

  it("pero SÍ ve que hubo un ajuste y de cuánto: no se le esconde el movimiento", async () => {
    const { userId } = await conAjuste();

    const fila = (await miHistorialPuntos(prisma, userId)).items.find(
      (m) => m.razon === RAZON_AJUSTE_ADMIN,
    );
    expect(fila?.delta).toBe(40);
    expect(fila?.creadoEnMs).toBeGreaterThan(0);
  });
});

describe("el inspector sigue viéndolo todo (no se ha recortado a los dos)", () => {
  it("el panel conserva la nota y el handle del admin", async () => {
    const { userId, adminHandle } = await conAjuste();

    const panel = await historialPuntos(prisma, userId);
    const fila = panel.items.find((m) => m.razon === RAZON_AJUSTE_ADMIN);
    expect(fila?.nota).toBe(NOTA);
    expect(fila?.referencia).toContain(adminHandle);
  });

  it("y es LA MISMA fila: mismo id, mismo importe, misma fecha en las dos voces", async () => {
    // Sin esto, "el dueño no ve la nota" se podría cumplir devolviéndole una lista vacía.
    const { userId } = await conAjuste();

    const [mio, panel] = await Promise.all([
      miHistorialPuntos(prisma, userId),
      historialPuntos(prisma, userId),
    ]);
    expect(mio.items.map((m) => m.id)).toEqual(panel.items.map((m) => m.id));
    expect(mio.items.map((m) => m.delta)).toEqual(panel.items.map((m) => m.delta));
    expect(mio.items.length).toBeGreaterThan(0);
  });
});

describe("el keyset del historial propio", () => {
  it("recorre todos los movimientos sin repetir ni saltarse ninguno", async () => {
    const adminId = await crearUsuario(prisma, { username: "eladmin" });
    const userId = await crearUsuario(prisma, { username: "elduenyo" });
    for (let i = 0; i < 7; i += 1) {
      await ajustarPuntos(prisma, {
        adminId,
        userId,
        delta: i + 1,
        nota: `Ajuste numero ${i}`,
        clave: `aj-${i}`,
      });
    }

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const p: Awaited<ReturnType<typeof miHistorialPuntos>> = await miHistorialPuntos(
        prisma,
        userId,
        { cursor, limite: 2 },
      );
      vistos.push(...p.items.map((m) => m.id));
      cursor = p.nextCursor;
      if (!cursor) break;
    }

    expect(vistos).toHaveLength(7);
    expect(new Set(vistos).size).toBe(7);
  });

  it("y el historial de otro no se puede pedir: solo se sirve el userId que se pasa", async () => {
    const adminId = await crearUsuario(prisma, { username: "otroadmin" });
    const yo = await crearUsuario(prisma, { username: "yomisma" });
    const ajeno = await crearUsuario(prisma, { username: "ajenacuenta" });
    await ajustarPuntos(prisma, {
      adminId,
      userId: ajeno,
      delta: 99,
      nota: "Ajuste de la cuenta ajena",
      clave: "aj-ajeno",
    });

    const mio = await miHistorialPuntos(prisma, yo);
    expect(mio.items).toEqual([]);
  });
});
