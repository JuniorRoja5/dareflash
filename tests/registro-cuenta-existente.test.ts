/**
 * LA PANTALLA NO MIENTE: tras un alta con un correo que ya tenía cuenta, SÍ sale un mensaje.
 *
 * ┌─ EL FALLO, TAL Y COMO LO VIO JUNIOR EN PRODUCCIÓN ─────────────────────────────────────────────┐
 * │ Registró una empresa con un correo que ya era cuenta. Resultado: 0 filas en `Empresa`, 0 jobs, │
 * │ ningún correo, ningún aviso — y la pantalla le dijo que todo había ido bien. El servidor hizo  │
 * │ lo previsto (no-op silencioso, sin enumeración); lo que estaba mal era la pantalla, que        │
 * │ afirmaba algo que el servidor sabía que NO era verdad.                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Los cuatro dientes, en las DOS altas (participante y empresa), y a nivel de RUTA —que es donde se
 * puede afirmar «misma respuesta HTTP»—:
 *   1. correo existente → misma respuesta + EXACTAMENTE un aviso «ya tienes cuenta» + 0 empresas +
 *      0 avisos al admin;
 *   2. correo nuevo → una verificación (+ el aviso al admin, en el alta de empresa);
 *   3. mismo tiempo de respuesta (el argon2 se paga en los dos caminos);
 *   4. el aviso «ya tienes cuenta» tiene TOPE: no sirve para bombardear el buzón de nadie.
 *
 * Para romperlo a propósito: volver al `return` mudo en la colisión (rojo el 1); quitar el día de la
 * clave del aviso (rojo el del día siguiente) o la clave entera (rojo el del tope); mirar si el
 * correo existe ANTES de hashear (rojo el del tiempo).
 */
import { contrasenaFalsa, falso } from "./helpers/valores-falsos";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";
import { congelarReloj, soltarReloj } from "./helpers/reloj";
import { costeArgon2, excesoDelHash } from "./helpers/tiempo-argon2";

const H = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
/**
 * EL INTERRUPTOR DEL HASH: el `hashPassword` real, o uno instantáneo cuando la medida de tiempo pide
 * su línea base (ver `excesoDelHash`). Por defecto, el real: los demás casos no lo notan.
 */
const HASH = vi.hoisted(() => ({ real: true }));
vi.mock("@/server/auth/password", async (original) => {
  const m = await original<typeof import("../src/server/auth/password")>();
  return {
    ...m,
    hashPassword: (password: string) =>
      HASH.real ? m.hashPassword(password) : Promise.resolve(m.DUMMY_HASH),
  };
});

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: {
    AUTH_SECRET: falso("auth-secret-cuenta-existente"),
    APP_URL: "https://x.test",
    ADMIN_EMAIL: "admin@dareflash.test",
  },
}));

const { POST: registrar } = await import("../src/app/api/auth/register/route");
const { POST: altaEmpresa } = await import("../src/app/api/empresa/route");
const { altaEmpresaDesdeCero } = await import("../src/server/services/empresas");
const { avisarCuentaExistente } = await import("../src/server/services/aviso-cuenta-existente");

let prisma: PrismaClient;
const PASS = contrasenaFalsa("larga-y-buena");

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
afterEach(() => {
  soltarReloj();
});

let ip = 0;
/** Cada petición con su IP: el rate-limit POR IP no tiene que mezclarse con lo que se prueba. */
const pedir = (handler: (r: Request) => Promise<Response>, cuerpo: unknown) =>
  handler(
    new Request("https://x.test/api", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `10.0.0.${(ip += 1)}` },
      body: JSON.stringify(cuerpo),
    }),
  );

const cuerpoRegistro = (email: string) => ({
  email,
  password: PASS,
  birthDate: "1990-05-05",
  aceptaTerminos: true,
});

const cuerpoEmpresa = (email: string) => ({
  email,
  password: PASS,
  aceptaTerminos: true,
  nombre: "Panadería La Espiga",
  tipoCuenta: "EMPRESA",
  tipoNegocio: "FISICO",
  paisIso: "ES",
  personaContacto: "Lucía",
  webUrl: "https://laespiga.test",
});

/** Una cuenta que ya existe con ese correo (de participante). */
async function yaTieneCuenta(email: string): Promise<string> {
  const id = await crearUsuario(prisma);
  await prisma.user.update({ where: { id }, data: { email } });
  return id;
}

const claves = async () =>
  (await prisma.job.findMany({ select: { idempotencyKey: true } })).map(
    (j) => j.idempotencyKey ?? "",
  );

const respuesta = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });

describe.each([
  {
    flujo: "registro de participante",
    ruta: () => registrar,
    cuerpo: cuerpoRegistro,
    motivo: "REGISTRO",
  },
  { flujo: "alta de empresa", ruta: () => altaEmpresa, cuerpo: cuerpoEmpresa, motivo: "EMPRESA" },
])("$flujo", ({ ruta, cuerpo, motivo }) => {
  it("correo existente: MISMA respuesta que uno nuevo", async () => {
    await yaTieneCuenta("ya@existe.test");
    const nuevo = await respuesta(await pedir(ruta(), cuerpo("nuevo@test.test")));
    const existente = await respuesta(await pedir(ruta(), cuerpo("ya@existe.test")));
    expect(nuevo.status).toBe(200);
    // Igualdad EXACTA de status y cuerpo: cualquier diferencia es un oráculo de direcciones.
    expect(existente).toEqual(nuevo);
  });

  it("correo existente: EXACTAMENTE un aviso «ya tienes cuenta», 0 empresas, 0 avisos al admin", async () => {
    await yaTieneCuenta("ya@existe.test");
    await pedir(ruta(), cuerpo("ya@existe.test"));

    const k = await claves();
    expect(k).toHaveLength(1);
    expect(k[0]).toMatch(new RegExp(`^cuenta-existente:${motivo}:`));
    expect(await prisma.empresa.count()).toBe(0);
    expect(k.some((c) => c.startsWith("empresa-pendiente:"))).toBe(false);
    // Y la cuenta existente sigue siendo lo que era.
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "ya@existe.test" } });
    expect(u.esCuentaEmpresa).toBe(false);
  });

  it("correo nuevo: sale la verificación (y en empresa, además, el aviso al admin)", async () => {
    await pedir(ruta(), cuerpo("nuevo@test.test"));
    const k = await claves();
    expect(k.filter((c) => c.startsWith("email:verify:"))).toHaveLength(1);
    expect(k.filter((c) => c.startsWith("empresa-pendiente:"))).toHaveLength(
      motivo === "EMPRESA" ? 1 : 0,
    );
    expect(k.some((c) => c.startsWith("cuenta-existente:"))).toBe(false);
  });

  it("el aviso tiene TOPE: tres intentos el mismo día, UN correo; y el cuarto choca con el rate-limit", async () => {
    // RELOJ QUIETO: «el mismo día» (la clave del aviso) y «3 por hora» (el rate-limit) son ventanas
    // alineadas al reloj; cruzar medianoche o un `:00:00` entre intentos rompería las dos cuentas.
    congelarReloj();
    await yaTieneCuenta("victima@test.test");
    for (let i = 0; i < 3; i += 1) {
      expect((await pedir(ruta(), cuerpo("victima@test.test"))).status).toBe(200);
    }
    // La clave de idempotencia (cuenta + motivo + día) es el tope de verdad: no depende de cómo
    // esté configurado el rate-limit, y por eso se prueba ANTES de que el rate-limit muerda.
    expect((await claves()).filter((c) => c.startsWith("cuenta-existente:"))).toHaveLength(1);

    // Y encima, el rate-limit por dirección del registro (3/hora) corta el cuarto.
    expect((await pedir(ruta(), cuerpo("victima@test.test"))).status).toBe(429);
    expect((await claves()).filter((c) => c.startsWith("cuenta-existente:"))).toHaveLength(1);
  });
});

describe("el tope es por DÍA, no para siempre", () => {
  it("al día siguiente, el dueño vuelve a enterarse de un intento nuevo", async () => {
    await yaTieneCuenta("dueno@test.test");
    const base = { email: "dueno@test.test", motivo: "EMPRESA" as const, appUrl: "https://x.test" };
    await avisarCuentaExistente(prisma, { ...base, ahora: new Date("2027-03-01T10:00:00Z") });
    await avisarCuentaExistente(prisma, { ...base, ahora: new Date("2027-03-01T22:00:00Z") });
    await avisarCuentaExistente(prisma, { ...base, ahora: new Date("2027-03-02T09:00:00Z") });
    // Un tope que no caduca dejaría a alguien sin enterarse de un intento real semanas después.
    expect(await prisma.job.count()).toBe(2);
  });

  it("si el correo ya es de una EMPRESA, el aviso la manda a ENTRAR, no a registrar otra", async () => {
    await altaEmpresaDesdeCero(
      prisma,
      {
        ...cuerpoEmpresa("empresa@test.test"),
        terminosAceptadosEn: new Date(),
        tipoCuenta: "EMPRESA",
        tipoNegocio: "FISICO",
      },
      { adminEmail: null, urlPanel: "https://x.test/panel/empresas", appUrl: "https://x.test" },
    );
    await prisma.job.deleteMany();

    await avisarCuentaExistente(prisma, {
      email: "empresa@test.test",
      motivo: "EMPRESA",
      appUrl: "https://x.test",
      ahora: new Date(),
    });
    const [job] = await prisma.job.findMany();
    const texto = (job?.payload as { text?: string }).text ?? "";
    // Decirle «usa otro correo para registrar una empresa» la empujaría a crear una SEGUNDA.
    expect(texto).toContain("ya es de una cuenta de empresa");
    expect(texto).not.toContain("usa otro correo");
  });
});

/*
 * EL TIEMPO, COMO SEGUNDA RED (la primera, sin reloj, es `argon2-antes-de-mirar`). La medida vive en
 * `helpers/tiempo-argon2`, compartida con el registro de participante: H es la mediana de varios
 * hashes, y lo que se compara con H/2 es lo que AÑADE EL HASH a la separación entre caminos
 * (`excesoDelHash`), no la separación entera.
 *
 * DECISIÓN (analista, 19 nov 2026): la diferencia de trabajo de BASE DE DATOS entre «correo nuevo» y
 * «correo existente» es un RIESGO RESIDUAL ACEPTADO, no algo que este test ignore por comodidad. Es
 * pequeña frente al argon2, que es lo que se iguala; el alta tiene límite de intentos por IP; e
 * igualarla exigiría trabajo falso en el alta. Aquí es mayor que en el registro de participante (el
 * alta nueva crea la cuenta, la empresa y el aviso al admin en una transacción). Su tamaño, medido
 * SIN carga (mediana de la separación con el hash instantáneo, 10 pasadas, 19 nov 2026): ~10 ms
 * (máx. 10,9), frente a un argon2 de ~73 ms. Si crece mucho, se revisa.
 */
describe("mismo tiempo de respuesta en el alta de empresa", () => {
  const aviso = {
    adminEmail: "admin@x.test",
    urlPanel: "https://x.test/p",
    appUrl: "https://x.test",
  };
  const datos = (email: string) => ({
    ...cuerpoEmpresa(email),
    terminosAceptadosEn: new Date(),
    tipoCuenta: "EMPRESA" as const,
    tipoNegocio: "FISICO" as const,
  });
  const interruptor = (activo: boolean) => void (HASH.real = activo);

  it("correo nuevo y existente tardan casi igual: el argon2 se paga en los dos caminos", async () => {
    const argon2 = await costeArgon2();

    await yaTieneCuenta("existe@test.test");
    const { exceso } = await excesoDelHash({
      existente: () => altaEmpresaDesdeCero(prisma, datos("existe@test.test"), aviso),
      nuevo: (i) => altaEmpresaDesdeCero(prisma, datos(`nuevo${i}@test.test`), aviso),
      hashReal: interruptor,
    });
    // Con el hash en los dos caminos, el hash no añade separación: ~0. La versión rota (abajo) lo
    // supera con un argon2 entero.
    expect(Math.abs(exceso)).toBeLessThan(argon2 * 0.5);
  });

  it("DIENTES: la versión ROTA (mirar si existe y solo entonces dar el alta) SÍ lo supera", async () => {
    // Un camino que no paga el argon2: el existente vuelve en cuanto ve la cuenta, y solo el nuevo
    // llega al alta (que hashea). Con LA MISMA medida que el caso de arriba: si el diente midiera
    // de otra forma, no probaría nada.
    const altaRota = async (email: string) => {
      const ya = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (ya) return;
      await altaEmpresaDesdeCero(prisma, datos(email), aviso);
    };
    const argon2 = await costeArgon2();
    await yaTieneCuenta("existe@test.test");
    const { exceso } = await excesoDelHash({
      existente: () => altaRota("existe@test.test"),
      nuevo: (i) => altaRota(`nuevo${i}@test.test`),
      hashReal: interruptor,
    });
    expect(exceso).toBeGreaterThan(argon2 * 0.5);
  });
});
