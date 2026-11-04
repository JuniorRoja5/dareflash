/**
 * EL ALTA DE UNA EMPRESA (Fase 9 · P1), contra la BD. SIEMPRE DESDE CERO: crea la cuenta y la
 * empresa juntas.
 *
 * Cinco invariantes, y los cinco nacen de una decisión que se puede deshacer en silencio:
 *
 *  1. LA CUENTA NACE SIENDO DE EMPRESA (`esCuentaEmpresa`), en la MISMA transacción que la fila de
 *     `Empresa`. Por eso el cache no puede discrepar: no hay forma de crear una sin la otra.
 *  2. UN PARTICIPANTE NO SE CONVIERTE. Un correo que ya tiene cuenta es un no-op SILENCIOSO —sin
 *     enumeración— y la cuenta existente NO se toca.
 *  3. UN HECHO, UN CORREO. La clave del aviso se deriva de la empresa, no del momento.
 *  4. SIN DESTINATARIO SE REGISTRA IGUAL, y el aviso NO se da por enviado.
 *  5. REPETIR UN GESTO NO ES UN HECHO NUEVO: verificar lo ya verificado no escribe rastro ni mueve
 *     `verificadaEn` —la fecha que decidirá el regalo de Socio Fundador—.
 *
 * Y la regla de los DTO: la identificación fiscal solo sale en la ficha del admin.
 *
 * Para romperlo a propósito: quitar `esCuentaEmpresa: true` del alta (rojo el primero); tragarse el
 * P2002 de email creando igual la empresa (rojo el segundo); usar la fecha en la clave del aviso
 * (rojo el tercero); escribir `verificadaEn` siempre (rojo el quinto); añadir `fiscalId` al listado
 * o al DTO del dueño (rojo el de las claves).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  altaEmpresaDesdeCero,
  claveAvisoEmpresa,
  EmpresaError,
  fichaEmpresa,
  listarEmpresas,
  miEmpresa,
  rechazarEmpresa,
  verificarEmpresa,
} from "../src/server/services/empresas";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;

const ADMIN_EMAIL = "admin@dareflash.com";
const URL_PANEL = "https://dareflash.com/panel/empresas";
const APP_URL = "https://dareflash.com";
const PASS = "Un4-Contrasena-Larga-Y-Buena!";

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "admin_empresas" });
});

const aviso = (adminEmail: string | null = ADMIN_EMAIL, log?: (m: string) => void) => ({
  adminEmail,
  urlPanel: URL_PANEL,
  appUrl: APP_URL,
  ...(log ? { log } : {}),
});

type Overrides = Partial<Parameters<typeof altaEmpresaDesdeCero>[1]>;

const alta = (email = "bar@manolo.test", extra: Overrides = {}, adminEmail = ADMIN_EMAIL) =>
  altaEmpresaDesdeCero(
    prisma,
    {
      email,
      password: PASS,
      terminosAceptadosEn: new Date(),
      nombre: "Bar Manolo",
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      paisIso: "ES",
      personaContacto: "Manolo Pérez",
      ciudadTexto: "València",
      webUrl: "https://barmanolo.test",
      ...extra,
    },
    aviso(adminEmail),
  );

const laEmpresa = () => prisma.empresa.findFirstOrThrow({ select: { id: true } });

const jobsDeEmpresa = (empresaId: string) =>
  prisma.job.findMany({ where: { idempotencyKey: claveAvisoEmpresa(empresaId) } });

const rastroDe = (empresaId: string) =>
  prisma.auditLog.findMany({
    where: { targetType: "EMPRESA", targetId: empresaId },
    orderBy: { createdAt: "asc" },
  });

describe("el alta crea la cuenta y la empresa", () => {
  it("la cuenta nace SIENDO de empresa y sin verificar; la empresa, PENDIENTE", async () => {
    expect((await alta()).creado).toBe(true);

    const u = await prisma.user.findFirstOrThrow({ where: { email: "bar@manolo.test" } });
    expect(u.esCuentaEmpresa).toBe(true);
    expect(u.emailVerified).toBeNull();
    expect(u.passwordHash).toBeTruthy();
    expect(u.terminosAceptadosEn).not.toBeNull();

    const e = await prisma.empresa.findFirstOrThrow();
    expect(e.ownerUserId).toBe(u.id);
    expect(e.estado).toBe("PENDIENTE");
    expect(e.paisIso).toBe("ES");
    expect(e.personaContacto).toBe("Manolo Pérez");
    expect(e.ciudadTexto).toBe("València");
  });

  it("y encola DOS correos: el de verificación de la cuenta y el aviso al admin", async () => {
    await alta();
    const e = await laEmpresa();

    const jobs = await prisma.job.findMany({ select: { type: true, idempotencyKey: true } });
    expect(jobs).toHaveLength(2);
    // El del admin, con la clave derivada del HECHO (no del momento).
    const delAdmin = await jobsDeEmpresa(e.id);
    expect(delAdmin).toHaveLength(1);
    expect(delAdmin[0]?.type).toBe("SEND_EMAIL");
    const payload = delAdmin[0]?.payload as { to?: string; text?: string };
    expect(payload.to).toBe(ADMIN_EMAIL);
    expect(payload.text).toContain("Bar Manolo");
    expect(payload.text).toContain(URL_PANEL);
  });

  it("el aviso NO lleva la identificación fiscal ni el correo de nadie", async () => {
    await alta("bar@manolo.test", { fiscalId: "B12345678", fiscalPaisIso: "ES" });
    const e = await laEmpresa();
    const crudo = JSON.stringify((await jobsDeEmpresa(e.id))[0]?.payload);
    // En una marca personal esto es el documento de una PERSONA: no sale en ningún correo.
    expect(crudo).not.toContain("B12345678");
    expect(crudo).not.toContain("bar@manolo.test");
  });

  it("sin ADMIN_EMAIL se registra igual, sin avisar y dejando una línea en el log", async () => {
    const dicho: string[] = [];
    await altaEmpresaDesdeCero(
      prisma,
      {
        email: "sin@avisos.test",
        password: PASS,
        terminosAceptadosEn: new Date(),
        nombre: "Marca Sin Avisos",
        tipoCuenta: "MARCA_PERSONAL",
        tipoNegocio: "MARCA_O_DIGITAL",
        paisIso: "CO",
        personaContacto: "Ana",
        redes: "@marcasinavisos",
      },
      aviso(null, (m) => dicho.push(m)),
    );
    expect(await prisma.empresa.count()).toBe(1);
    // Solo queda el de verificación de la cuenta.
    expect(await prisma.job.count()).toBe(1);
    expect(dicho.join(" ")).toMatch(/ADMIN_EMAIL/);
  });
});

describe("un participante NO se convierte en empresa", () => {
  it("su correo da un no-op silencioso, y su cuenta no se toca", async () => {
    const yaExiste = await crearUsuario(prisma, { username: "participante" });
    await prisma.user.update({
      where: { id: yaExiste },
      data: { email: "yo@participante.test", passwordHash: "hash-de-antes" },
    });

    const r = await alta("yo@participante.test");

    // Sin enumeración: la misma forma de respuesta que un alta buena. Quien llama responde igual.
    expect(r.creado).toBe(false);
    expect(await prisma.empresa.count()).toBe(0);

    const intacto = await prisma.user.findUniqueOrThrow({ where: { id: yaExiste } });
    expect(intacto.esCuentaEmpresa).toBe(false);
    expect(intacto.passwordHash).toBe("hash-de-antes");
    // Y no se le ha encolado ningún correo por el intento ajeno.
    expect(await prisma.job.count()).toBe(0);
  });

  it("la segunda alta con el mismo correo tampoco crea una segunda empresa", async () => {
    await alta();
    const r = await alta();
    expect(r.creado).toBe(false);
    expect(await prisma.empresa.count()).toBe(1);
    expect(await prisma.user.count({ where: { esCuentaEmpresa: true } })).toBe(1);
  });
});

describe("lo que no entra en la base de datos", () => {
  it("un nombre vacío", async () => {
    await expect(alta("a@b.test", { nombre: " " })).rejects.toBeInstanceOf(EmpresaError);
    expect(await prisma.empresa.count()).toBe(0);
    expect(await prisma.user.count({ where: { esCuentaEmpresa: true } })).toBe(0);
  });

  it("ni web ni redes: no habría con qué verificar", async () => {
    await expect(alta("a@b.test", { webUrl: null, redes: null })).rejects.toThrow(
      /web o tus redes/i,
    );
    expect(await prisma.empresa.count()).toBe(0);
  });

  it("un país que no existe", async () => {
    await expect(alta("a@b.test", { paisIso: "XX" })).rejects.toBeInstanceOf(EmpresaError);
    expect(await prisma.empresa.count()).toBe(0);
  });
});

describe("verificar", () => {
  it("sella la fecha, firma quién y deja rastro", async () => {
    await alta();
    const { id } = await laEmpresa();
    expect((await verificarEmpresa(prisma, { empresaId: id, actorId: admin })).estado).toBe(
      "hecho",
    );

    const fila = await prisma.empresa.findUniqueOrThrow({ where: { id } });
    expect(fila.estado).toBe("VERIFICADA");
    expect(fila.verificadaEn).not.toBeNull();
    expect(fila.verificadaPor).toBe(admin);

    const rastro = await rastroDe(id);
    expect(rastro).toHaveLength(1);
    expect(rastro[0]?.action).toBe("EMPRESA_VERIFY");
  });

  it("verificar lo ya verificado no escribe nada", async () => {
    await alta();
    const { id } = await laEmpresa();
    await verificarEmpresa(prisma, { empresaId: id, actorId: admin });
    const antes = (await prisma.empresa.findUniqueOrThrow({ where: { id } })).verificadaEn;

    expect((await verificarEmpresa(prisma, { empresaId: id, actorId: admin })).estado).toBe(
      "sin_cambios",
    );
    expect(await rastroDe(id)).toHaveLength(1);
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id } })).verificadaEn).toEqual(antes);
  });

  it("y tras un rechazo revertido, la fecha NO se mueve y el motivo se limpia", async () => {
    await alta();
    const { id } = await laEmpresa();
    const sello = new Date("2027-01-15T10:00:00.000Z");
    await verificarEmpresa(prisma, { empresaId: id, actorId: admin, ahora: sello });
    await rechazarEmpresa(prisma, { empresaId: id, actorId: admin, motivo: "SOSPECHA_FRAUDE" });
    await verificarEmpresa(prisma, {
      empresaId: id,
      actorId: admin,
      ahora: new Date("2027-12-01T10:00:00.000Z"),
    });

    const fila = await prisma.empresa.findUniqueOrThrow({ where: { id } });
    // Es la fecha que decide el regalo de Socio Fundador: nadie debe perderlo porque un rechazo se
    // revirtiera meses después.
    expect(fila.verificadaEn).toEqual(sello);
    expect(fila.motivoRechazo).toBeNull();
  });

  it("una empresa que no existe es un 404, no un 403", async () => {
    expect(await verificarEmpresa(prisma, { empresaId: "no-existe", actorId: admin })).toEqual({
      estado: "rechazado",
      motivo: "NO_ENCONTRADA",
    });
  });
});

describe("rechazar", () => {
  it("guarda el motivo (que se ve) y la nota (que no), con su rastro", async () => {
    await alta();
    const { id } = await laEmpresa();
    const r = await rechazarEmpresa(prisma, {
      empresaId: id,
      actorId: admin,
      motivo: "WEB_NO_VALIDA",
      nota: "El dominio no resuelve.",
    });
    expect(r.estado).toBe("hecho");

    const fila = await prisma.empresa.findUniqueOrThrow({ where: { id } });
    expect(fila.motivoRechazo).toBe("WEB_NO_VALIDA");
    expect(fila.notaInterna).toBe("El dominio no resuelve.");

    const rastro = await rastroDe(id);
    expect(rastro[0]?.metadata).toMatchObject({ motivo: "WEB_NO_VALIDA" });
    // La NOTA no se duplica en el rastro: ya vive en su columna y dos copias pueden discrepar.
    expect(JSON.stringify(rastro[0]?.metadata)).not.toContain("no resuelve");
  });

  it("el mismo rechazo dos veces no escribe un segundo rastro; cambiar el motivo sí", async () => {
    await alta();
    const { id } = await laEmpresa();
    const entrada = { empresaId: id, actorId: admin, motivo: "DUPLICADA" as const };
    await rechazarEmpresa(prisma, entrada);
    expect((await rechazarEmpresa(prisma, entrada)).estado).toBe("sin_cambios");
    expect(await rastroDe(id)).toHaveLength(1);

    expect((await rechazarEmpresa(prisma, { ...entrada, motivo: "SOSPECHA_FRAUDE" })).estado).toBe(
      "hecho",
    );
    expect(await rastroDe(id)).toHaveLength(2);
  });
});

describe("los DTO: quién ve qué", () => {
  it("el del dueño no trae la nota interna NI la identificación fiscal", async () => {
    await alta("bar@manolo.test", { fiscalId: "B12345678", fiscalPaisIso: "ES" });
    const { id } = await laEmpresa();
    await rechazarEmpresa(prisma, {
      empresaId: id,
      actorId: admin,
      motivo: "DATOS_INSUFICIENTES",
      nota: "Traza interna del equipo.",
    });

    const suya = await miEmpresa(prisma, id);
    // IGUALDAD EXACTA de claves, no "no contiene": así un `select` que crezca se pone rojo, que es
    // el hueco de verdad (no es una consulta sin filtro, es un DTO que engordó).
    expect(Object.keys(suya ?? {}).sort()).toEqual(
      [
        "ciudadTexto",
        "creadaMs",
        "direccion",
        "estado",
        "id",
        "motivoRechazo",
        "nombre",
        "paisIso",
        "personaContacto",
        "redes",
        "tipoCuenta",
        "tipoNegocio",
        "verificadaMs",
        "webUrl",
      ].sort(),
    );
    expect(suya?.motivoRechazo).toBe("DATOS_INSUFICIENTES");
    expect(JSON.stringify(suya)).not.toContain("Traza interna");
    expect(JSON.stringify(suya)).not.toContain("B12345678");
  });

  it("el del LISTADO del panel trae la nota y NO la identificación fiscal", async () => {
    await alta("bar@manolo.test", { fiscalId: "B12345678", fiscalPaisIso: "ES" });
    const [fila] = (await listarEmpresas(prisma, {})).items;
    expect(Object.keys(fila ?? {}).sort()).toEqual(
      [
        "ciudadTexto",
        "creadaMs",
        "direccion",
        "dueno",
        "estado",
        "id",
        "motivoRechazo",
        "nombre",
        "notaInterna",
        "paisIso",
        "personaContacto",
        "redes",
        "tipoCuenta",
        "tipoNegocio",
        "verificadaMs",
        "verificadaPor",
        "webUrl",
      ].sort(),
    );
    expect(JSON.stringify(fila)).not.toContain("B12345678");
  });

  it("y SOLO la ficha del admin la trae", async () => {
    await alta("bar@manolo.test", { fiscalId: "B12345678", fiscalPaisIso: "ES" });
    const { id } = await laEmpresa();
    const ficha = await fichaEmpresa(prisma, id);
    expect(ficha?.fiscalId).toBe("B12345678");
    expect(ficha?.fiscalPaisIso).toBe("ES");
  });
});

describe("la cola del panel", () => {
  it("filtra por estado y pagina por keyset, sin repetir ni saltarse filas", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await altaEmpresaDesdeCero(
        prisma,
        {
          email: `negocio${i}@test.test`,
          password: PASS,
          terminosAceptadosEn: new Date(),
          nombre: `Negocio ${i}`,
          tipoCuenta: "EMPRESA",
          tipoNegocio: "ONLINE",
          paisIso: "ES",
          personaContacto: `Contacto ${i}`,
          webUrl: `https://negocio${i}.test`,
        },
        aviso(),
        new Date(Date.UTC(2027, 0, 10 + i, 12)),
      );
      const ultima = await prisma.empresa.findFirstOrThrow({
        where: { nombre: `Negocio ${i}` },
        select: { id: true },
      });
      ids.push(ultima.id);
    }
    await verificarEmpresa(prisma, { empresaId: ids[2]!, actorId: admin });

    const pendientes = await listarEmpresas(prisma, { estado: "PENDIENTE" });
    expect(pendientes.items.map((e) => e.id)).toEqual([ids[1], ids[0]]);

    const p1 = await listarEmpresas(prisma, { limite: 1 });
    expect(p1.items).toHaveLength(1);
    expect(p1.proximoCursor).not.toBeNull();
    const p2 = await listarEmpresas(prisma, { limite: 1, cursor: p1.proximoCursor });
    expect(p2.items[0]?.id).not.toBe(p1.items[0]?.id);
  });
});
