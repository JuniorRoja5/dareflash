/**
 * CADUCIDAD DE SESIÓN — dos plazos, y hacen falta los dos.
 *
 * Antes solo había tope ABSOLUTO (30 días). Una sesión abierta en un ordenador ajeno o en un móvil
 * perdido seguía valiendo un mes entero aunque NADIE la tocara, y la del ADMIN —que abre el panel
 * completo— duraba exactamente lo mismo que la de un espectador.
 *
 * Con dientes: la inactividad cierra de verdad (y borra la fila), el tope absoluto NO se renueva por
 * usar la sesión, el refresco de actividad está amortiguado, y el rol decide los plazos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  plazosSesion,
  SESION_REFRESCO_MIN_MS,
  SESSION_IDLE_ELEVADO_MS,
  SESSION_IDLE_MS,
  SESSION_TTL_ELEVADO_MS,
  SESSION_TTL_MS,
} from "../src/config/constants";
import type { PrismaClient, Role } from "../src/generated/prisma/client";
import { createSession, validateSession } from "../src/server/auth/session";

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

async function usuarioCon(role: Role): Promise<string> {
  const id = await crearUsuario(prisma);
  await prisma.user.update({ where: { id }, data: { role } });
  return id;
}

const EN = (ms: number) => new Date(Date.now() + ms);

describe("caducidad por INACTIVIDAD (la que faltaba)", () => {
  it("una sesión sin usar más que el plazo deja de valer", async () => {
    // DOS sesiones, una por caso: validar la primera REFRESCA su actividad —que es justo lo que debe
    // hacer—, así que reutilizarla para el segundo caso probaría el refresco, no la caducidad.
    const userId = await usuarioCon("USER");
    const viva = await createSession(prisma, userId);
    const abandonada = await createSession(prisma, userId);

    // Justo antes del plazo: sigue valiendo.
    expect(
      await validateSession(prisma, viva.rawToken, EN(SESSION_IDLE_MS - 60_000)),
    ).not.toBeNull();
    // Pasado el plazo sin tocarla: fuera. (Con el `now` inyectado; no hace falta esperar 7 días.)
    expect(
      await validateSession(prisma, abandonada.rawToken, EN(SESSION_IDLE_MS + 60_000)),
    ).toBeNull();
  });

  it("la sesión abandonada se BORRA, no se queda ocupando sitio", async () => {
    const userId = await usuarioCon("USER");
    const s = await createSession(prisma, userId);

    await validateSession(prisma, s.rawToken, EN(SESSION_IDLE_MS + 60_000));

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it("USARLA reinicia la inactividad: quien la usa a diario no pierde la sesión", async () => {
    const userId = await usuarioCon("USER");
    const s = await createSession(prisma, userId);

    // Un uso a mitad del plazo refresca la actividad...
    const mitad = SESSION_IDLE_MS / 2;
    expect(await validateSession(prisma, s.rawToken, EN(mitad))).not.toBeNull();
    // ...así que a `mitad + casi el plazo` (por encima del plazo desde el ALTA) sigue viva.
    const despues = mitad + SESSION_IDLE_MS - 60_000;
    expect(await validateSession(prisma, s.rawToken, EN(despues))).not.toBeNull();
  });
});

describe("el tope ABSOLUTO no se mueve", () => {
  it("usar la sesión NO renueva `expires`: un tope que se renueva no es un tope", async () => {
    const userId = await usuarioCon("USER");
    const s = await createSession(prisma, userId);
    const antes = await prisma.session.findFirstOrThrow({
      where: { userId },
      select: { expires: true },
    });

    await validateSession(prisma, s.rawToken, EN(SESION_REFRESCO_MIN_MS + 60_000));

    const despues = await prisma.session.findFirstOrThrow({
      where: { userId },
      select: { expires: true },
    });
    expect(despues.expires.getTime()).toBe(antes.expires.getTime());
  });

  it("pasado el tope absoluto no vale, por muy activa que estuviera", async () => {
    const userId = await usuarioCon("USER");
    const s = await createSession(prisma, userId);
    expect(await validateSession(prisma, s.rawToken, EN(SESSION_TTL_MS + 60_000))).toBeNull();
  });
});

describe("el ADMIN dura mucho menos", () => {
  it("su sesión se crea con el plazo elevado, no con el de espectador", async () => {
    const userId = await usuarioCon("ADMIN");
    await createSession(prisma, userId);

    const fila = await prisma.session.findFirstOrThrow({
      where: { userId },
      select: { expires: true },
    });
    const duracion = fila.expires.getTime() - Date.now();
    // Con margen: lo que importa es que sea el plazo corto y NO el de 30 días.
    expect(duracion).toBeLessThanOrEqual(SESSION_TTL_ELEVADO_MS + 5_000);
    expect(duracion).toBeLessThan(SESSION_TTL_MS);
  });

  it("y su inactividad también: 2 h sin tocar el panel y fuera", async () => {
    const userId = await usuarioCon("ADMIN");
    const viva = await createSession(prisma, userId);
    const abandonada = await createSession(prisma, userId);

    expect(
      await validateSession(prisma, viva.rawToken, EN(SESSION_IDLE_ELEVADO_MS - 60_000)),
    ).not.toBeNull();
    expect(
      await validateSession(prisma, abandonada.rawToken, EN(SESSION_IDLE_ELEVADO_MS + 60_000)),
    ).toBeNull();
    // Y ese plazo es MUY inferior al del usuario normal: si fueran iguales, no habría distinción.
    expect(SESSION_IDLE_ELEVADO_MS).toBeLessThan(SESSION_IDLE_MS);
  });

  it("los plazos por rol salen de una fuente única", () => {
    expect(plazosSesion("ADMIN")).toEqual(plazosSesion("MODERATOR"));
    expect(plazosSesion("USER").ttlMs).toBeGreaterThan(plazosSesion("ADMIN").ttlMs);
    expect(plazosSesion("USER").idleMs).toBeGreaterThan(plazosSesion("ADMIN").idleMs);
  });
});

describe("el refresco de actividad está amortiguado", () => {
  it("no se reescribe la fila en cada petición", async () => {
    const userId = await usuarioCon("USER");
    const s = await createSession(prisma, userId);
    const inicial = await prisma.session.findFirstOrThrow({
      where: { userId },
      select: { lastSeenAt: true },
    });

    // Diez validaciones seguidas dentro de la ventana de amortiguación.
    for (let i = 0; i < 10; i += 1) await validateSession(prisma, s.rawToken, EN(1000 * i));

    const tras = await prisma.session.findFirstOrThrow({
      where: { userId },
      select: { lastSeenAt: true },
    });
    // Sin el freno, cada peticion —y una pantalla dispara varias— haria un UPDATE sobre la MISMA fila.
    expect(tras.lastSeenAt.getTime()).toBe(inicial.lastSeenAt.getTime());
  });

  it("pasada la ventana, sí se refresca", async () => {
    const userId = await usuarioCon("USER");
    const s = await createSession(prisma, userId);
    const inicial = await prisma.session.findFirstOrThrow({
      where: { userId },
      select: { lastSeenAt: true },
    });

    await validateSession(prisma, s.rawToken, EN(SESION_REFRESCO_MIN_MS + 60_000));

    const tras = await prisma.session.findFirstOrThrow({
      where: { userId },
      select: { lastSeenAt: true },
    });
    expect(tras.lastSeenAt.getTime()).toBeGreaterThan(inicial.lastSeenAt.getTime());
  });
});
