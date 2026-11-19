/**
 * EL ARGON2 SE PAGA SIEMPRE, UNA VEZ Y ANTES DE TOCAR LA CUENTA (Fase 11 · PTA). Sin reloj.
 *
 * El invariante, que no se negocia: registrarse con un correo que YA existe no se distingue de
 * registrarse con uno nuevo. El coste dominante —el hash de la contraseña— se paga en los DOS
 * caminos y ANTES de que la base de datos diga si la dirección existe. Si un camino lo saltara (o lo
 * pagara después de saberlo), el tiempo de respuesta delataría qué correos tienen cuenta.
 *
 * Los tests de tiempo (`registration`, `registro-cuenta-existente`) lo comprueban con un cronómetro,
 * y un cronómetro con la máquina cargada da falsos rojos. Este lo comprueba SIN reloj, para el
 * registro de participante (`registerUser`) y para el alta de empresa (`altaEmpresaDesdeCero`), con
 * los módulos REALES:
 *  - un ESPÍA envuelve el `hashPassword` de verdad (sigue hasheando) y apunta cuándo se llama;
 *  - una extensión de Prisma apunta, en el mismo orden, cada operación sobre la base de datos.
 * Y exige, con correo nuevo y con correo existente: el hash se llama EXACTAMENTE una vez, y antes
 * de la primera operación sobre `User` —que es la que descubre si la dirección existe: estos
 * servicios no preguntan, insertan y deja decidir a la restricción UNIQUE—.
 *
 * Para romperlo a propósito: mirar si el correo existe y solo entonces hashear (rojo: el existente
 * no hashea, o hashea después de mirar); hashear dos veces en un camino (rojo).
 */
import { contrasenaFalsa, falso } from "./helpers/valores-falsos";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

/** El orden en que pasan las cosas: `hash`, y cada operación de Prisma como `Modelo.operación`. */
const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, orden: [] as string[] }));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: falso("auth-secret-argon2-orden"),
    APP_URL: "https://x.test",
    ADMIN_EMAIL: "admin@dareflash.test",
  },
}));
// EL ESPÍA: el `hashPassword` REAL, envuelto. Lo importan `registration` (por ruta relativa) y
// `empresas` (por alias): los dos resuelven a este mismo módulo, así que los dos lo ven.
vi.mock("@/server/auth/password", async (original) => {
  const real = await original<typeof import("../src/server/auth/password")>();
  return {
    ...real,
    hashPassword: async (password: string) => {
      H.orden.push("hash");
      return real.hashPassword(password);
    },
  };
});

const { registerUser } = await import("../src/server/auth/registration");
const { altaEmpresaDesdeCero } = await import("../src/server/services/empresas");

let base: PrismaClient;
/** El cliente que ven los servicios: el de verdad, con cada operación apuntada en `H.orden`. */
let db: PrismaClient;

beforeAll(() => {
  base = createTestPrisma();
  db = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          H.orden.push(`${model}.${operation}`);
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
  H.prisma = db;
});
afterAll(async () => {
  await base.$disconnect();
});
beforeEach(async () => {
  await resetDb(base);
});

const PASS = contrasenaFalsa("argon2-orden");
const EXISTE = "existe@test.test";

async function conCuenta(email: string) {
  const id = await crearUsuario(base);
  await base.user.update({ where: { id }, data: { email } });
}

/** Lo que pasó durante `accion`, en orden. */
async function ordenDe(accion: () => Promise<unknown>): Promise<string[]> {
  H.orden.length = 0;
  await accion();
  return [...H.orden];
}

/** El invariante, sobre un orden: un hash, y antes de la primera operación sobre `User`. */
function pagaAntesDeMirar(orden: string[]) {
  const hashes = orden.filter((o) => o === "hash").length;
  expect(hashes, `el hash se llamó ${hashes} veces: ${orden.join(" → ")}`).toBe(1);
  const primeraSobreUser = orden.findIndex((o) => o.startsWith("User."));
  expect(primeraSobreUser, "no tocó la cuenta: el caso no mide nada").toBeGreaterThan(-1);
  expect(
    orden.indexOf("hash"),
    `el hash llega DESPUÉS de mirar la cuenta: ${orden.join(" → ")}`,
  ).toBeLessThan(primeraSobreUser);
}

describe("registro de participante (registerUser)", () => {
  const registrar = (email: string) =>
    registerUser(db, {
      email,
      password: PASS,
      birthDate: new Date("2000-01-01T00:00:00.000Z"),
      terminosAceptadosEn: new Date(),
      appUrl: "https://x.test",
    });

  it("correo NUEVO: un hash, antes de tocar la cuenta", async () => {
    const orden = await ordenDe(() => registrar("nuevo@test.test"));
    pagaAntesDeMirar(orden);
    expect(await base.user.count({ where: { email: "nuevo@test.test" } })).toBe(1);
  });

  it("correo EXISTENTE: lo mismo, un hash y antes de saber que existe", async () => {
    await conCuenta(EXISTE);
    const orden = await ordenDe(() => registrar(EXISTE));
    pagaAntesDeMirar(orden);
    // Y de verdad era el camino del existente: sigue habiendo UNA cuenta con esa dirección.
    expect(await base.user.count({ where: { email: EXISTE } })).toBe(1);
  });
});

describe("alta de empresa (altaEmpresaDesdeCero)", () => {
  const aviso = {
    adminEmail: "admin@x.test",
    urlPanel: "https://x.test/p",
    appUrl: "https://x.test",
  };
  const alta = (email: string) =>
    altaEmpresaDesdeCero(
      db,
      {
        email,
        password: PASS,
        terminosAceptadosEn: new Date(),
        nombre: "Panadería La Espiga",
        tipoCuenta: "EMPRESA",
        tipoNegocio: "FISICO",
        paisIso: "ES",
        personaContacto: "Lucía",
        webUrl: "https://laespiga.test",
      },
      aviso,
    );

  it("correo NUEVO: un hash, antes de tocar la cuenta", async () => {
    const orden = await ordenDe(() => alta("nueva@test.test"));
    pagaAntesDeMirar(orden);
    expect(await base.empresa.count()).toBe(1);
  });

  it("correo EXISTENTE: lo mismo, y no se crea ninguna empresa", async () => {
    await conCuenta(EXISTE);
    const orden = await ordenDe(() => alta(EXISTE));
    pagaAntesDeMirar(orden);
    expect(await base.empresa.count()).toBe(0);
  });
});

describe("control: el registro de orden ve lo que tiene que ver", () => {
  it("la versión ROTA (mirar existencia y solo entonces hashear) incumple el invariante", async () => {
    // Si el detector no viera esto, los verdes de arriba no valdrían nada.
    const { hashPassword } = await import("@/server/auth/password");
    await conCuenta(EXISTE);
    const rota = async (email: string) => {
      const ya = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (ya) return;
      await hashPassword(PASS);
    };
    const orden = await ordenDe(() => rota(EXISTE));
    expect(orden.filter((o) => o === "hash")).toHaveLength(0);
    const ordenNuevo = await ordenDe(() => rota("otro@test.test"));
    expect(ordenNuevo.indexOf("hash")).toBeGreaterThan(ordenNuevo.indexOf("User.findUnique"));
  });
});
