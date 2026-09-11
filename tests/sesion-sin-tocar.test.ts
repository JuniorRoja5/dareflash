/**
 * El SONDEO del contador de avisos no cuenta como ACTIVIDAD.
 *
 * El navegador pide el número de no-leídas solo, cada minuto, mientras la pestaña está a la vista.
 * Si esa petición refrescara `lastSeenAt` como cualquier otra, una pestaña abierta con nadie delante
 * mantendría la sesión viva para siempre, y la caducidad por inactividad —la que cierra la sesión
 * olvidada del admin— no llegaría nunca.
 *
 * Para romperlo: que `validateSession` ignore `tocar: false` (rojo el primero), o que la ruta del
 * contador valide con `getCurrentUser` (rojo el estructural).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SESION_REFRESCO_MIN_MS, SESSION_IDLE_ELEVADO_MS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createSession, validateSession } from "../src/server/auth/session";

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

const ultimaActividad = async (sessionId: string): Promise<number> =>
  (await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })).lastSeenAt.getTime();

describe("validar SIN tocar", () => {
  it("valida la sesión pero NO refresca la última actividad", async () => {
    const s = await createSession(prisma, userId);
    const u = await validateSession(prisma, s.rawToken);
    const antes = await ultimaActividad(u!.sessionId);

    const despues = new Date(antes + SESION_REFRESCO_MIN_MS + 60_000);
    expect(await validateSession(prisma, s.rawToken, despues, { tocar: false })).not.toBeNull();
    expect(await ultimaActividad(u!.sessionId)).toBe(antes);

    // Control: la validación normal, en el mismo instante, SÍ la refresca.
    await validateSession(prisma, s.rawToken, despues);
    expect(await ultimaActividad(u!.sessionId)).toBe(despues.getTime());
  });

  it("la sesión olvidada de un ADMIN caduca aunque su pestaña siga sondeando", async () => {
    // El caso que importa: el admin tiene la inactividad más corta (2 h) porque su sesión abre el
    // panel entero. Una pestaña suya abierta con nadie delante sondea sin parar.
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    const s = await createSession(prisma, userId);
    const u = await validateSession(prisma, s.rawToken);
    const inicio = await ultimaActividad(u!.sessionId);

    // Un sondeo cada 5 min (el refresco mínimo) durante toda la ventana de inactividad...
    for (
      let t = SESION_REFRESCO_MIN_MS + 1;
      t < SESSION_IDLE_ELEVADO_MS;
      t += SESION_REFRESCO_MIN_MS
    ) {
      expect(
        await validateSession(prisma, s.rawToken, new Date(inicio + t), { tocar: false }),
      ).not.toBeNull();
    }
    // ...y aun así, pasada la ventana, la sesión está muerta: sondear no es usar.
    expect(
      await validateSession(
        prisma,
        s.rawToken,
        new Date(inicio + SESSION_IDLE_ELEVADO_MS + 60_000),
        {
          tocar: false,
        },
      ),
    ).toBeNull();
  });
});

describe("la ruta del contador valida sin tocar (estructural)", () => {
  it("usa `getCurrentUserSinTocar`, no `getCurrentUser`", () => {
    const codigo = readFileSync(
      path.resolve(__dirname, "..", "src", "app", "api", "notificaciones", "no-leidas", "route.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).toMatch(/getCurrentUserSinTocar\(\)/);
    expect(codigo).not.toMatch(/getCurrentUser\(\)/);
  });
});
