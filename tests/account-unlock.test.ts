/**
 * Desbloqueo de cuenta por correo — tests CON DIENTES.
 *  - UN correo por VENTANA de bloqueo (cubo unlock:acct 1/hora): anti-bombardeo del buzon.
 *  - Sin enumeracion: email inexistente NO encola correo, pero SI consume el cubo (uniforme).
 *  - El token es LOGIN_UNLOCK (no sirve para verificar; ver email-token.test).
 *  - El enlace resetea SOLO el cubo de CUENTA, JAMAS el de IP (guardian de CPU).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generarCodigoReferido } from "../src/server/auth/codigo-referido";

import type { PrismaClient } from "../src/generated/prisma/client";
import { generarHandle } from "../src/server/auth/handle";
import { requestAccountUnlockEmail } from "../src/server/auth/account-unlock";
import { rateLimit, resetRateLimit } from "../src/server/security/rate-limit";

import { createTestPrisma, resetDb } from "./helpers/db";

/**
 * La RUTA de desbloqueo lee `env` y el cliente singleton. Se mockean los dos para poder ejercitarla
 * de verdad: lo que se prueba es lo que la ruta HACE, y un test que replique sus pasos a mano no
 * puede ver la línea que le falta.
 */
const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { AUTH_SECRET: "TEST-FIXTURE-auth-secret-unlock", APP_URL: "https://x.test" },
}));

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

async function crearUsuario(email: string): Promise<void> {
  await prisma.user.create({
    data: {
      referralCode: generarCodigoReferido(),
      email,
      username: generarHandle(),
      passwordHash: "TEST-FIXTURE-hash",
    },
  });
}

const KEYS = { unlockAcctKey: "unlock:acct:a", unlockIpKey: "unlock:ip:x" };
const APP = "https://x.test";

describe("correo de desbloqueo de cuenta", () => {
  it("UN correo por ventana: dos disparos en la misma ventana encolan UN solo correo", async () => {
    await crearUsuario("a@test.com");
    await requestAccountUnlockEmail(prisma, { email: "a@test.com", appUrl: APP, ...KEYS });
    await requestAccountUnlockEmail(prisma, { email: "a@test.com", appUrl: APP, ...KEYS });
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(1); // 1/hora, no 1/intento
  });

  it("SIN ENUMERACION: email inexistente NO encola correo, pero SI consume el cubo (uniforme)", async () => {
    await requestAccountUnlockEmail(prisma, {
      email: "noexiste@test.com",
      appUrl: APP,
      unlockAcctKey: "unlock:acct:noexiste",
      unlockIpKey: "unlock:ip:x",
    });
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(0); // no existe -> no correo
    // El cubo por cuenta se consume IGUAL (uniformidad: no delata que la cuenta no existe).
    const row = await prisma.rateLimit.findFirst({ where: { key: "unlock:acct:noexiste" } });
    expect(row?.count).toBe(1);
  });

  it("el token creado es LOGIN_UNLOCK (no un token de verificacion)", async () => {
    await crearUsuario("a@test.com");
    await requestAccountUnlockEmail(prisma, { email: "a@test.com", appUrl: APP, ...KEYS });
    const tok = await prisma.verificationToken.findFirstOrThrow({
      where: { identifier: "a@test.com" },
    });
    expect(tok.purpose).toBe("LOGIN_UNLOCK");
  });

  it("el desbloqueo resetea SOLO el cubo de CUENTA, nunca el de IP", async () => {
    // Lo que hace /api/auth/unlock al consumir el token: reset del login:acct de esa direccion,
    // JAMAS el login:ip (guardian de CPU; si se pudiera liberar desde un correo, un atacante
    // provocaria su propio desbloqueo y se saltaria el freno de CPU).
    await rateLimit(prisma, { key: "login:acct:victima", limit: 5, windowMs: 1000 });
    await rateLimit(prisma, { key: "login:ip:atacante", limit: 5, windowMs: 1000 });

    await resetRateLimit(prisma, "login:acct:victima"); // <- exactamente lo que hace el endpoint

    expect(await prisma.rateLimit.findFirst({ where: { key: "login:acct:victima" } })).toBeNull();
    expect(
      await prisma.rateLimit.findFirst({ where: { key: "login:ip:atacante" } }),
    ).not.toBeNull();
  });
});

/**
 * LA SALIDA NO SE PUEDE CERRAR DETRAS DEL DUEÑO.
 *
 * ┌─ EL HUECO QUE SE CIERRA AQUI ───────────────────────────────────────────────────────────────┐
 * │ El cubo `login:acct` ya se limpiaba al desbloquear, asi que los intentos viejos del atacante │
 * │ NO re-bloqueaban al instante: tenia que gastar la tanda entera otra vez. Lo que dejaba la    │
 * │ salida inservible era el OTRO cubo: `unlock:acct` es de 1 correo/hora y no se tocaba.        │
 * │                                                                                               │
 * │   10:05 el dueño abre el enlace y entra (token gastado, de un solo uso)                       │
 * │   10:20 el atacante vuelve a bloquear                                                         │
 * │   10:20 el sistema quiere avisar y el cubo horario dice que ya se mando uno -> sin correo     │
 * │                                                                                               │
 * │ Resultado: ~40 min con la cuenta bloqueada y sin forma de salir. Y nada falla: ni un error,  │
 * │ ni un log, ni un test rojo. Solo un correo que no llega.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Se prueba contra la RUTA REAL, no simulando lo que hace: el fallo estaba justamente en lo que la
 * ruta NO hacia, y un test que replique sus pasos a mano no puede ver una linea que falta.
 */
describe("tras un desbloqueo legitimo la cuenta queda USABLE", () => {
  const EMAIL = "victima@test.com";
  /** Las claves TAL CUAL las construye el login, para que la ruta y el test hablen de lo mismo. */
  const claves = async () => {
    const { rateLimitKey } = await import("../src/server/http/api");
    const { env } = await import("../src/config/env");
    const hash = rateLimitKey(env.AUTH_SECRET, EMAIL);
    return { login: `login:acct:${hash}`, correo: `unlock:acct:${hash}` };
  };

  /** Consume el enlace por la RUTA, como haria el dueño desde su correo. */
  async function desbloquearPorLaRuta(rawToken: string): Promise<Response> {
    const { POST } = await import("../src/app/api/auth/unlock/route");
    return POST(
      new Request("http://test/api/auth/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: rawToken }),
      }),
    );
  }

  /** El token crudo del ultimo correo encolado (el enlace lleva `?token=`). */
  async function tokenDelCorreo(): Promise<string> {
    const job = await prisma.job.findFirstOrThrow({
      where: { type: "SEND_EMAIL" },
      orderBy: { createdAt: "desc" },
    });
    const texto = (job.payload as { text: string }).text;
    const url = /https?:\/\/\S+/.exec(texto)?.[0] ?? "";
    return new URL(url).searchParams.get("token") ?? "";
  }

  it("un intento fallido del atacante NO la vuelve a bloquear al instante", async () => {
    const k = await claves();
    // El atacante agota la tanda de la cuenta.
    for (let i = 0; i < 6; i += 1) {
      await rateLimit(prisma, { key: k.login, limit: 5, windowMs: 3_600_000 });
    }
    expect((await rateLimit(prisma, { key: k.login, limit: 5, windowMs: 3_600_000 })).allowed).toBe(
      false,
    );

    await crearUsuario(EMAIL);
    await requestAccountUnlockEmail(prisma, {
      email: EMAIL,
      appUrl: APP,
      unlockAcctKey: k.correo,
      unlockIpKey: "unlock:ip:x",
    });
    const res = await desbloquearPorLaRuta(await tokenDelCorreo());
    expect(res.status).toBe(200);

    // UN intento mas del atacante: el contador arranca de cero, asi que la cuenta sigue abierta.
    const tras = await rateLimit(prisma, { key: k.login, limit: 5, windowMs: 3_600_000 });
    expect(tras.allowed, "los intentos viejos siguen contando: se re-bloqueo al primer fallo").toBe(
      true,
    );
  });

  it("y si el atacante vuelve a bloquearla, sale un correo NUEVO en el acto", async () => {
    // Este es el diente de la pieza. Sin el reseteo de `unlock:acct`, el cubo horario sigue
    // gastado y el segundo bloqueo NO manda nada: el dueño se queda fuera hasta la hora en punto.
    const k = await claves();
    await crearUsuario(EMAIL);

    // Primer bloqueo -> primer correo.
    await requestAccountUnlockEmail(prisma, {
      email: EMAIL,
      appUrl: APP,
      unlockAcctKey: k.correo,
      unlockIpKey: "unlock:ip:x",
    });
    expect(await prisma.job.count({ where: { type: "SEND_EMAIL" } })).toBe(1);

    // El dueño lo usa (token de UN SOLO uso: a partir de aqui ya no sirve).
    expect((await desbloquearPorLaRuta(await tokenDelCorreo())).status).toBe(200);

    // Segundo bloqueo, DENTRO de la misma hora.
    await requestAccountUnlockEmail(prisma, {
      email: EMAIL,
      appUrl: APP,
      unlockAcctKey: k.correo,
      unlockIpKey: "unlock:ip:x",
    });

    expect(
      await prisma.job.count({ where: { type: "SEND_EMAIL" } }),
      "el segundo bloqueo no mando correo: el dueño se queda fuera hasta la hora en punto",
    ).toBe(2);
    // Y el enlace nuevo funciona: no es un correo decorativo.
    expect((await desbloquearPorLaRuta(await tokenDelCorreo())).status).toBe(200);
  });

  it("el reseteo NO toca el tope por IP, que es el que frena el barrido a muchas cuentas", async () => {
    // Si tambien se limpiara `unlock:ip`, un atacante podria bloquear mil cuentas y provocar mil
    // correos: el reseteo pasaria de "mantener una salida abierta" a ser el amplificador.
    const k = await claves();
    await crearUsuario(EMAIL);
    await rateLimit(prisma, { key: "unlock:ip:barredor", limit: 10, windowMs: 3_600_000 });
    await requestAccountUnlockEmail(prisma, {
      email: EMAIL,
      appUrl: APP,
      unlockAcctKey: k.correo,
      unlockIpKey: "unlock:ip:barredor",
    });

    await desbloquearPorLaRuta(await tokenDelCorreo());

    expect(
      await prisma.rateLimit.findFirst({ where: { key: "unlock:ip:barredor" } }),
      "el desbloqueo ha limpiado el tope por IP",
    ).not.toBeNull();
  });

  it("y sigue sin tocar `login:ip`: el guardian de CPU no se libera desde un correo", async () => {
    const k = await claves();
    await crearUsuario(EMAIL);
    await rateLimit(prisma, { key: "login:ip:atacante", limit: 5, windowMs: 3_600_000 });
    await requestAccountUnlockEmail(prisma, {
      email: EMAIL,
      appUrl: APP,
      unlockAcctKey: k.correo,
      unlockIpKey: "unlock:ip:x",
    });

    await desbloquearPorLaRuta(await tokenDelCorreo());

    expect(
      await prisma.rateLimit.findFirst({ where: { key: "login:ip:atacante" } }),
    ).not.toBeNull();
  });
});
