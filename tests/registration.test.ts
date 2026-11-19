import { contrasenaFalsa } from "./helpers/valores-falsos";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EL INTERRUPTOR DEL HASH: el `hashPassword` real, o uno instantáneo cuando la medida de tiempo pide
 * su línea base (ver `excesoDelHash`). Por defecto, el real: los demás casos de este fichero no lo
 * notan.
 */
const HASH = vi.hoisted(() => ({ real: true }));
vi.mock("../src/server/auth/password", async (original) => {
  const m = await original<typeof import("../src/server/auth/password")>();
  return {
    ...m,
    hashPassword: (password: string) =>
      HASH.real ? m.hashPassword(password) : Promise.resolve(m.DUMMY_HASH),
  };
});
import { generarCodigoReferido } from "../src/server/auth/codigo-referido";

import { Prisma } from "../src/generated/prisma/client";
import { generarHandle, HANDLE_MAX_INTENTOS, HANDLE_RE } from "../src/server/auth/handle";
import type { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";
import {
  esViolacionUnicaDeEmail,
  esViolacionUnicaDeUsername,
  registerUser,
} from "../src/server/auth/registration";

import { createTestPrisma, resetDb } from "./helpers/db";
import { costeArgon2, excesoDelHash } from "./helpers/tiempo-argon2";

/** P2002 con la forma del driver adapter de MariaDB (nombre de indice en constraint.index). */
function p2002Adapter(index: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });
}

/** P2002 con la forma clasica de Prisma (`meta.target`). */
function p2002Clasico(target: string | string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

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

const BIRTH = new Date("2000-01-01T00:00:00.000Z");
/** Sello de consentimiento: lo pone el servidor en el alta real, aqui basta un instante fijo. */
const ACEPTO = new Date("2026-01-01T00:00:00.000Z");
const PASS = contrasenaFalsa("suficientemente-larga");

/*
 * EL TIEMPO, COMO SEGUNDA RED (la primera, sin reloj, es `argon2-antes-de-mirar`). La medida vive en
 * `helpers/tiempo-argon2`, compartida con el alta de empresa: H es la mediana de varios hashes, y lo
 * que se compara con H/2 es lo que AÑADE EL HASH a la separación entre caminos (`excesoDelHash`), no
 * la separación entera.
 *
 * DECISIÓN (analista, 19 nov 2026): la diferencia de trabajo de BASE DE DATOS entre «correo nuevo» y
 * «correo existente» es un RIESGO RESIDUAL ACEPTADO, no algo que este test ignore por comodidad. Es
 * pequeña frente al argon2, que es lo que se iguala; el registro tiene límite de intentos por IP; e
 * igualarla exigiría trabajo falso en el alta. Su tamaño, medido SIN carga (mediana de la separación
 * con el hash instantáneo, 10 pasadas, 19 nov 2026): ~7 ms (máx. 7,6), frente a un argon2 de
 * ~71 ms. Si crece mucho, se revisa.
 */

describe("registro: sin oraculo por tiempo ni carrera", () => {
  it("NO ENUMERA por tiempo: hashea SIEMPRE, asi email nuevo y existente tardan casi igual", async () => {
    const H = await costeArgon2();

    const existente = "existe@test.com";
    await prisma.user.create({
      data: {
        referralCode: generarCodigoReferido(),
        email: existente,
        username: generarHandle(),
        passwordHash: "x",
        birthDate: BIRTH,
      },
    });

    const registrar = (email: string) =>
      registerUser(prisma, {
        email,
        password: PASS,
        birthDate: BIRTH,
        terminosAceptadosEn: ACEPTO,
        appUrl: "https://x.test",
      });
    const { exceso } = await excesoDelHash({
      existente: () => registrar(existente),
      nuevo: (i) => registrar(`nuevo${i}@test.com`),
      hashReal: (activo) => void (HASH.real = activo),
    });

    // Con hash SIEMPRE, el hash no añade separación entre caminos: ~0. El mismo umbral caza la
    // version rota (abajo), donde un camino no lo paga y el exceso es ~H.
    expect(Math.abs(exceso)).toBeLessThan(H * 0.5);
  });

  it("DIENTES: la version ROTA (hash TRAS mirar existencia) SI separa las medianas", async () => {
    // Reproduccion local del fallo que arreglamos: mirar si existe y solo entonces
    // hashear. Demuestra que el umbral del test de arriba tiene dientes: esta version
    // lo supera. Si alguien revierte registration.ts a este patron, el test cae.
    async function registrarRoto(email: string): Promise<void> {
      const e = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: e }, select: { id: true } });
      if (existing) return; // camino RAPIDO: no llega a hashear
      await hashPassword(PASS); // camino LENTO: solo los nuevos pagan el argon2
      await prisma.user.create({
        data: {
          referralCode: generarCodigoReferido(),
          email: e,
          username: generarHandle(),
          passwordHash: "x",
          birthDate: BIRTH,
        },
      });
    }

    const H = await costeArgon2();
    const existente = "existe@test.com";
    await prisma.user.create({
      data: {
        referralCode: generarCodigoReferido(),
        email: existente,
        username: generarHandle(),
        passwordHash: "x",
        birthDate: BIRTH,
      },
    });

    // LA MISMA medida que el test de arriba: si el diente midiera de otra forma, no probaria nada.
    const { exceso } = await excesoDelHash({
      existente: () => registrarRoto(existente),
      nuevo: (i) => registrarRoto(`nuevo${i}@test.com`),
      hashReal: (activo) => void (HASH.real = activo),
    });
    expect(exceso).toBeGreaterThan(H * 0.5); // la rota SI se separa -> el test la caza
  });

  it("CARRERA: dos registros simultaneos del mismo email nuevo -> un solo usuario, sin 500", async () => {
    const email = "carrera@test.com";
    // Ambas llaman a la vez: una crea, la otra choca con la UNIQUE (P2002) y es no-op.
    const results = await Promise.allSettled([
      registerUser(prisma, {
        email,
        password: PASS,
        birthDate: BIRTH,
        terminosAceptadosEn: ACEPTO,
        appUrl: "https://x.test",
      }),
      registerUser(prisma, {
        email,
        password: PASS,
        birthDate: BIRTH,
        terminosAceptadosEn: ACEPTO,
        appUrl: "https://x.test",
      }),
    ]);

    // Ninguna revienta: la colision se traga como no-op silencioso.
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    // Y solo hay UN usuario con ese email.
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });
});

describe("registro: el no-op silencioso SOLO cubre la constraint de email", () => {
  it("reconoce el P2002 de email en la forma del adapter y en la clasica (string y array)", () => {
    expect(esViolacionUnicaDeEmail(p2002Adapter("User_email_key"))).toBe(true);
    expect(esViolacionUnicaDeEmail(p2002Clasico("User_email_key"))).toBe(true);
    expect(esViolacionUnicaDeEmail(p2002Clasico(["email"]))).toBe(true);
  });

  it("NO reconoce el P2002 de OTRA columna unica (username) ni errores que no son P2002", () => {
    expect(esViolacionUnicaDeEmail(p2002Adapter("User_username_key"))).toBe(false);
    expect(esViolacionUnicaDeEmail(p2002Clasico(["username"]))).toBe(false);
    expect(esViolacionUnicaDeEmail(new Error("otro fallo"))).toBe(false);
  });

  it("reconoce el P2002 de username (la colision RECUPERABLE del handle auto-generado)", () => {
    expect(esViolacionUnicaDeUsername(p2002Adapter("User_username_key"))).toBe(true);
    expect(esViolacionUnicaDeUsername(p2002Clasico(["username"]))).toBe(true);
    expect(esViolacionUnicaDeUsername(p2002Adapter("User_email_key"))).toBe(false);
    expect(esViolacionUnicaDeUsername(new Error("otro fallo"))).toBe(false);
  });

  it("registerUser: el P2002 de email es no-op; OTRA columna unica se PROPAGA sin reintentar", async () => {
    const input = {
      email: "x@test.com",
      password: PASS,
      birthDate: BIRTH,
      terminosAceptadosEn: ACEPTO,
      appUrl: "https://x.test",
    };

    // Choque en email -> resuelve sin lanzar, UN solo intento de alta. (Ya no es "silencioso": se
    // busca la cuenta para avisar a su dueño. Aquí la cuenta "no aparece" —el doble devuelve null—
    // porque lo que se prueba es el reintento, no el aviso; el aviso lo prueba
    // `registro-cuenta-existente` contra la base de datos de verdad.)
    let intentosEmail = 0;
    const dbEmail = {
      user: {
        create: async () => {
          intentosEmail++;
          return Promise.reject(p2002Adapter("User_email_key"));
        },
        findUnique: async () => null,
      },
    } as unknown as PrismaClient;
    await expect(registerUser(dbEmail, input)).resolves.toBeUndefined();
    expect(intentosEmail).toBe(1);

    // Choque en OTRA unica (ni email ni username) -> se relanza YA, sin reintentar.
    let intentosOtra = 0;
    const dbOtra = {
      user: {
        create: async () => {
          intentosOtra++;
          return Promise.reject(p2002Adapter("User_algo_key"));
        },
      },
    } as unknown as PrismaClient;
    await expect(registerUser(dbOtra, input)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(intentosOtra).toBe(1);
  });

  it("colision de username: REGENERA y reintenta hasta HANDLE_MAX_INTENTOS y solo entonces propaga", async () => {
    const input = {
      email: "y@test.com",
      password: PASS,
      birthDate: BIRTH,
      terminosAceptadosEn: ACEPTO,
      appUrl: "https://x.test",
    };
    let intentos = 0;
    const dbSiempreChoca = {
      user: {
        create: async () => {
          intentos++;
          return Promise.reject(p2002Adapter("User_username_key"));
        },
      },
    } as unknown as PrismaClient;
    await expect(registerUser(dbSiempreChoca, input)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    // Reintentó (no se rindió al primer choque) y quedó acotado (no bucle infinito).
    expect(intentos).toBe(HANDLE_MAX_INTENTOS);
  });
});

describe("registro: username auto-generado (nunca NULL)", () => {
  it("asigna un handle VÁLIDO y no-nulo al crear la cuenta", async () => {
    await registerUser(prisma, {
      email: "nuevo@test.com",
      password: PASS,
      birthDate: BIRTH,
      terminosAceptadosEn: ACEPTO,
      appUrl: "https://x.test",
    });
    const u = await prisma.user.findUnique({
      where: { email: "nuevo@test.com" },
      select: { username: true },
    });
    expect(u?.username).toMatch(HANDLE_RE);
  });

  it("DIENTES contra la BD real: si el handle generado ya existe, REGENERA y crea igualmente", async () => {
    // Un usuario ya ocupa el handle "usertaken001".
    await prisma.user.create({
      data: {
        referralCode: generarCodigoReferido(),
        email: "ocupa@test.com",
        username: "usertaken001",
      },
    });

    // El generador inyectado devuelve primero el ocupado (choca con el UNIQUE real) y luego uno libre.
    const secuencia = ["usertaken001", "userfresh002"];
    let i = 0;
    await registerUser(
      prisma,
      {
        email: "nueva@test.com",
        password: PASS,
        birthDate: BIRTH,
        terminosAceptadosEn: ACEPTO,
        appUrl: "https://x.test",
      },
      { generarHandle: () => secuencia[i++]! },
    );

    const creada = await prisma.user.findUnique({
      where: { email: "nueva@test.com" },
      select: { username: true },
    });
    expect(creada?.username).toBe("userfresh002"); // se quedó con el segundo (el primero chocaba)
    expect(i).toBe(2); // regeneró exactamente una vez
  });
});
