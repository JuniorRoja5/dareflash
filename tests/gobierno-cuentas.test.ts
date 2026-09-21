/**
 * GOBIERNO DE CUENTAS (Fase 5, pieza A) — contra la BD.
 *
 * Lo que se fija:
 *  - nombrar moderador cambia el rol, REVOCA sus sesiones y deja rastro (quién, a quién, de qué a qué),
 *    todo en la misma transacción;
 *  - al superadmin no se le degrada; ADMIN no se asigna;
 *  - suspender solo a un USER: un moderador no puede echar a otro moderador ni al administrador;
 *  - suspender borra las sesiones; levantar NO las resucita (se vuelve a entrar);
 *  - idempotente Y sin daño: repetir no escribe rastro ni echa a nadie de sus sesiones.
 *
 * Para romperlo: quitar la revocación de sesiones (rojo), escribir el `AuditLog` fuera de la
 * transacción o no escribirlo (rojo), quitar la guarda del destino privilegiado (rojo), o hacer que
 * el no-op vuelva a escribir (rojo en "repetir no hace daño").
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { createSession } from "../src/server/auth/session";
import {
  asignarRol,
  levantarSuspension,
  suspenderCuenta,
} from "../src/server/services/gobierno-cuentas";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;
let moderador: string;
let usuario: string;

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "superadmin" });
  await prisma.user.update({ where: { id: admin }, data: { role: "ADMIN" } });
  moderador = await crearUsuario(prisma, { username: "moderadora" });
  await prisma.user.update({ where: { id: moderador }, data: { role: "MODERATOR" } });
  usuario = await crearUsuario(prisma, { username: "usuaria" });
});

const rolDe = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } })).role;
const baneoDe = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { bannedAt: true } })).bannedAt;
const sesionesDe = (id: string) => prisma.session.count({ where: { userId: id } });
const rastro = () => prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });

describe("asignar rol", () => {
  it("el superadmin nombra moderador: rol, sesiones fuera y rastro, todo junto", async () => {
    await createSession(prisma, usuario);
    await createSession(prisma, usuario);

    expect(
      await asignarRol(prisma, {
        actorId: admin,
        rolActor: "ADMIN",
        userId: usuario,
        rolPedido: "MODERATOR",
      }),
    ).toEqual({ estado: "hecho" });

    expect(await rolDe(usuario)).toBe("MODERATOR");
    // Las sesiones viejas llevaban el TTL del rol anterior: se van.
    expect(await sesionesDe(usuario)).toBe(0);

    const filas = await rastro();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      actorId: admin,
      action: "ROLE_CHANGE",
      targetType: "USER",
      targetId: usuario,
      metadata: { de: "USER", a: "MODERATOR" },
    });
  });

  it("y también degrada a un moderador a usuario", async () => {
    expect(
      await asignarRol(prisma, {
        actorId: admin,
        rolActor: "ADMIN",
        userId: moderador,
        rolPedido: "USER",
      }),
    ).toEqual({ estado: "hecho" });
    expect(await rolDe(moderador)).toBe("USER");
  });

  it("al SUPERADMIN no se le degrada: ni otro, ni él mismo", async () => {
    const otroAdmin = await crearUsuario(prisma);
    await prisma.user.update({ where: { id: otroAdmin }, data: { role: "ADMIN" } });

    for (const destino of [admin, otroAdmin]) {
      expect(
        await asignarRol(prisma, {
          actorId: admin,
          rolActor: "ADMIN",
          userId: destino,
          rolPedido: "USER",
        }),
      ).toEqual({ estado: "rechazado", motivo: "NO_PERMITIDO" });
    }
    expect(await rolDe(admin)).toBe("ADMIN");
    expect(await rolDe(otroAdmin)).toBe("ADMIN");
    expect(await rastro()).toHaveLength(0);
  });

  it("un MODERADOR no nombra a nadie", async () => {
    expect(
      await asignarRol(prisma, {
        actorId: moderador,
        rolActor: "MODERATOR",
        userId: usuario,
        rolPedido: "MODERATOR",
      }),
    ).toEqual({ estado: "rechazado", motivo: "NO_PERMITIDO" });
    expect(await rolDe(usuario)).toBe("USER");
    expect(await rastro()).toHaveLength(0);
  });

  it("pedir el rol que YA tiene no hace nada: ni rastro, ni echarlo de sus sesiones", async () => {
    await createSession(prisma, usuario);

    expect(
      await asignarRol(prisma, {
        actorId: admin,
        rolActor: "ADMIN",
        userId: usuario,
        rolPedido: "USER",
      }),
    ).toEqual({ estado: "sin_cambios" });

    expect(await sesionesDe(usuario)).toBe(1); // seguía dentro y sigue dentro
    expect(await rastro()).toHaveLength(0);
  });

  it("una cuenta que no existe (o está borrada) no se gobierna", async () => {
    const borrada = await crearUsuario(prisma);
    await prisma.user.update({ where: { id: borrada }, data: { deletedAt: new Date() } });

    for (const id of ["no-existe", borrada]) {
      expect(
        await asignarRol(prisma, {
          actorId: admin,
          rolActor: "ADMIN",
          userId: id,
          rolPedido: "MODERATOR",
        }),
        id,
      ).toEqual({ estado: "rechazado", motivo: "NO_ENCONTRADA" });
    }
  });
});

describe("suspender y levantar", () => {
  it("un moderador suspende a un usuario: baneado, sesiones fuera y rastro", async () => {
    await createSession(prisma, usuario);

    expect(
      await suspenderCuenta(prisma, { actorId: moderador, rolActor: "MODERATOR", userId: usuario }),
    ).toEqual({ estado: "hecho" });

    expect(await baneoDe(usuario)).not.toBeNull();
    expect(await sesionesDe(usuario)).toBe(0);
    expect((await rastro())[0]).toMatchObject({
      actorId: moderador,
      action: "BAN",
      targetType: "USER",
      targetId: usuario,
    });
  });

  it("una cuenta PRIVILEGIADA no se suspende: ni un moderador a otro, ni nadie al admin", async () => {
    for (const destino of [moderador, admin]) {
      expect(
        await suspenderCuenta(prisma, {
          actorId: moderador,
          rolActor: "MODERATOR",
          userId: destino,
        }),
        destino,
      ).toEqual({ estado: "rechazado", motivo: "NO_PERMITIDO" });
      // Y tampoco el superadmin por la vía rápida: primero se degrada (y eso ya revoca sesiones).
      expect(
        await suspenderCuenta(prisma, { actorId: admin, rolActor: "ADMIN", userId: destino }),
        destino,
      ).toEqual({ estado: "rechazado", motivo: "NO_PERMITIDO" });
    }
    expect(await baneoDe(moderador)).toBeNull();
    expect(await baneoDe(admin)).toBeNull();
    expect(await rastro()).toHaveLength(0);
  });

  it("degradar primero y suspender después SÍ funciona (el camino previsto)", async () => {
    await asignarRol(prisma, {
      actorId: admin,
      rolActor: "ADMIN",
      userId: moderador,
      rolPedido: "USER",
    });

    expect(
      await suspenderCuenta(prisma, {
        actorId: moderador,
        rolActor: "MODERATOR",
        userId: moderador,
      }),
    ).toEqual({ estado: "hecho" });
    expect(await baneoDe(moderador)).not.toBeNull();
  });

  it("levantar la suspensión: `bannedAt` a null, y las sesiones NO resucitan", async () => {
    await createSession(prisma, usuario);
    await suspenderCuenta(prisma, { actorId: moderador, rolActor: "MODERATOR", userId: usuario });

    expect(
      await levantarSuspension(prisma, {
        actorId: moderador,
        rolActor: "MODERATOR",
        userId: usuario,
      }),
    ).toEqual({ estado: "hecho" });

    expect(await baneoDe(usuario)).toBeNull();
    expect(await sesionesDe(usuario)).toBe(0); // vuelve a entrar, que es lo correcto
    expect((await rastro()).map((f) => f.action)).toEqual(["BAN", "UNBAN"]);
  });

  it("repetir no hace daño: suspender a un suspendido y levantar a quien no lo está", async () => {
    await suspenderCuenta(prisma, { actorId: moderador, rolActor: "MODERATOR", userId: usuario });
    const cuando = await baneoDe(usuario);

    expect(
      await suspenderCuenta(prisma, { actorId: moderador, rolActor: "MODERATOR", userId: usuario }),
    ).toEqual({ estado: "sin_cambios" });
    // Ni se re-fecha el baneo ni se apunta otra vez.
    expect(await baneoDe(usuario)).toEqual(cuando);
    expect(await rastro()).toHaveLength(1);

    await levantarSuspension(prisma, {
      actorId: moderador,
      rolActor: "MODERATOR",
      userId: usuario,
    });
    expect(
      await levantarSuspension(prisma, {
        actorId: moderador,
        rolActor: "MODERATOR",
        userId: usuario,
      }),
    ).toEqual({ estado: "sin_cambios" });
    expect(await rastro()).toHaveLength(2);
  });
});
