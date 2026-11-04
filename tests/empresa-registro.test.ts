/**
 * REGISTRO Y VERIFICACIÓN DE UNA EMPRESA (Fase 9 · P1), contra la BD.
 *
 * Cuatro invariantes, y los cuatro nacen de una decisión que se puede deshacer en silencio:
 *
 *  1. UNA PERSONA, UNA EMPRESA. Lo impide el UNIQUE de `ownerUserId`, no un `if`: un doble clic o
 *     dos pestañas devuelven la misma, sin segunda fila y SIN SEGUNDO CORREO.
 *  2. UN HECHO, UN CORREO. La clave del aviso se deriva de la empresa (`empresa-pendiente:{id}`), no
 *     del momento, así que un reintento no manda dos.
 *  3. SIN DESTINATARIO SE REGISTRA IGUAL, y el aviso NO se da por enviado. Que no tengamos a quién
 *     avisar no puede impedir que alguien se dé de alta.
 *  4. REPETIR UN GESTO NO ES UN HECHO NUEVO: verificar lo ya verificado no escribe rastro ni mueve
 *     `verificadaEn` —la fecha que decidirá el regalo de Socio Fundador—, y rechazar con el mismo
 *     motivo tampoco.
 *
 * Para romperlo a propósito: quitar el `select` previo de `registrarEmpresa` (rojo el doble alta);
 * usar la fecha en la clave del aviso (rojo el del segundo correo); escribir `verificadaEn` siempre
 * (rojo el de la fecha sellada); borrar la guarda de `sin_cambios` (rojo el del rastro).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  claveAvisoEmpresa,
  EmpresaError,
  listarEmpresas,
  miEmpresa,
  rechazarEmpresa,
  registrarEmpresa,
  verificarEmpresa,
} from "../src/server/services/empresas";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let dueno: string;
let admin: string;

const ADMIN_EMAIL = "admin@dareflash.com";
const URL_PANEL = "https://dareflash.com/panel/empresas";

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  dueno = await crearUsuario(prisma, { username: "dueno_empresa" });
  admin = await crearUsuario(prisma, { username: "admin_empresas" });
});

const avisoReal = (log?: (m: string) => void) => ({
  adminEmail: ADMIN_EMAIL,
  urlPanel: URL_PANEL,
  ...(log ? { log } : {}),
});

const registrar = (userId = dueno, nombre = "Bar Manolo") =>
  registrarEmpresa(
    prisma,
    { userId, nombre, tipoCuenta: "EMPRESA", tipoNegocio: "FISICO", direccion: "Valencia" },
    avisoReal(),
  );

const jobsDeEmpresa = (empresaId: string) =>
  prisma.job.findMany({ where: { idempotencyKey: claveAvisoEmpresa(empresaId) } });

const rastroDe = (empresaId: string) =>
  prisma.auditLog.findMany({
    where: { targetType: "EMPRESA", targetId: empresaId },
    orderBy: { createdAt: "asc" },
  });

describe("registrar una empresa", () => {
  it("nace PENDIENTE y con su aviso al admin encolado", async () => {
    const r = await registrar();
    expect(r.creado).toBe(true);

    const fila = await prisma.empresa.findUnique({ where: { id: r.id } });
    expect(fila?.estado).toBe("PENDIENTE");
    expect(fila?.verificadaEn).toBeNull();
    expect(fila?.ownerUserId).toBe(dueno);

    const jobs = await jobsDeEmpresa(r.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.type).toBe("SEND_EMAIL");
    const payload = jobs[0]?.payload as { to?: string; subject?: string; text?: string };
    expect(payload.to).toBe(ADMIN_EMAIL);
    expect(payload.text).toContain("Bar Manolo");
    expect(payload.text).toContain(URL_PANEL);
  });

  it("el correo NO lleva el email de nadie (ni el del dueño)", async () => {
    // El panel no pinta direcciones en sus listados y su única puerta escribe `AuditLog`; un correo
    // automático no puede ser la rendija que se lo salta.
    await prisma.user.update({ where: { id: dueno }, data: { email: "manolo@ejemplo.com" } });
    const r = await registrar();
    const jobs = await jobsDeEmpresa(r.id);
    expect(JSON.stringify(jobs[0]?.payload)).not.toContain("manolo@ejemplo.com");
  });

  it("el segundo intento del mismo usuario devuelve la misma, sin segunda fila ni segundo correo", async () => {
    const primera = await registrar();
    const segunda = await registrar(dueno, "Bar Manolo (otra vez)");

    expect(segunda.id).toBe(primera.id);
    expect(segunda.creado).toBe(false);
    expect(await prisma.empresa.count()).toBe(1);
    expect(await jobsDeEmpresa(primera.id)).toHaveLength(1);
    // Y no ha cambiado el nombre: el segundo alta no es una edición disfrazada.
    const fila = await prisma.empresa.findUnique({ where: { id: primera.id } });
    expect(fila?.nombre).toBe("Bar Manolo");
  });

  it("sin ADMIN_EMAIL se registra igual, sin encolar nada y dejando una línea en el log", async () => {
    const dicho: string[] = [];
    const r = await registrarEmpresa(
      prisma,
      {
        userId: dueno,
        nombre: "Marca Sin Avisos",
        tipoCuenta: "MARCA_PERSONAL",
        tipoNegocio: "MARCA_O_DIGITAL",
      },
      { adminEmail: null, urlPanel: URL_PANEL, log: (m) => dicho.push(m) },
    );
    expect(r.creado).toBe(true);
    expect(await prisma.job.count()).toBe(0);
    expect(dicho.join(" ")).toMatch(/ADMIN_EMAIL/);
  });

  it("un nombre vacío no entra en la base de datos", async () => {
    await expect(registrar(dueno, "  ")).rejects.toBeInstanceOf(EmpresaError);
    expect(await prisma.empresa.count()).toBe(0);
  });

  it("si el hecho falla, el aviso no se queda suelto", async () => {
    // Un `userId` que no existe revienta la FK. Lo que importa no es el error: es que la
    // transacción se deshace ENTERA y no queda un correo prometiendo una empresa que no hay.
    await expect(registrar("usuario-que-no-existe")).rejects.toThrow();
    expect(await prisma.empresa.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
  });
});

describe("verificar", () => {
  it("sella la fecha, firma quién y deja rastro", async () => {
    const r = await registrar();
    const res = await verificarEmpresa(prisma, { empresaId: r.id, actorId: admin });
    expect(res.estado).toBe("hecho");

    const fila = await prisma.empresa.findUnique({ where: { id: r.id } });
    expect(fila?.estado).toBe("VERIFICADA");
    expect(fila?.verificadaEn).not.toBeNull();
    expect(fila?.verificadaPor).toBe(admin);

    const rastro = await rastroDe(r.id);
    expect(rastro).toHaveLength(1);
    expect(rastro[0]?.action).toBe("EMPRESA_VERIFY");
    expect(rastro[0]?.actorId).toBe(admin);
  });

  it("verificar lo ya verificado no escribe nada", async () => {
    const r = await registrar();
    await verificarEmpresa(prisma, { empresaId: r.id, actorId: admin });
    const antes = (await prisma.empresa.findUnique({ where: { id: r.id } }))?.verificadaEn;

    const otra = await verificarEmpresa(prisma, { empresaId: r.id, actorId: admin });
    expect(otra.estado).toBe("sin_cambios");
    expect(await rastroDe(r.id)).toHaveLength(1);
    expect((await prisma.empresa.findUnique({ where: { id: r.id } }))?.verificadaEn).toEqual(antes);
  });

  it("y tras un rechazo revertido, la fecha NO se mueve y el motivo se limpia", async () => {
    const r = await registrar();
    const sello = new Date("2027-01-15T10:00:00.000Z");
    await verificarEmpresa(prisma, { empresaId: r.id, actorId: admin, ahora: sello });
    await rechazarEmpresa(prisma, { empresaId: r.id, actorId: admin, motivo: "SOSPECHA_FRAUDE" });
    await verificarEmpresa(prisma, {
      empresaId: r.id,
      actorId: admin,
      ahora: new Date("2027-12-01T10:00:00.000Z"),
    });

    const fila = await prisma.empresa.findUnique({ where: { id: r.id } });
    // La fecha es la de la PRIMERA verificación: es la que decide el regalo de Socio Fundador, y
    // nadie debe perderlo porque un rechazo se revirtiera meses después.
    expect(fila?.verificadaEn).toEqual(sello);
    // Y el motivo anterior no puede quedarse: el dueño lo vería y ya no describe nada.
    expect(fila?.motivoRechazo).toBeNull();
  });

  it("una empresa que no existe es un 404, no un 403", async () => {
    const res = await verificarEmpresa(prisma, { empresaId: "no-existe", actorId: admin });
    expect(res).toEqual({ estado: "rechazado", motivo: "NO_ENCONTRADA" });
  });
});

describe("rechazar", () => {
  it("guarda el motivo (que se ve) y la nota (que no), con su rastro", async () => {
    const r = await registrar();
    const res = await rechazarEmpresa(prisma, {
      empresaId: r.id,
      actorId: admin,
      motivo: "WEB_NO_VALIDA",
      nota: "El dominio no resuelve.",
    });
    expect(res.estado).toBe("hecho");

    const fila = await prisma.empresa.findUnique({ where: { id: r.id } });
    expect(fila?.estado).toBe("RECHAZADA");
    expect(fila?.motivoRechazo).toBe("WEB_NO_VALIDA");
    expect(fila?.notaInterna).toBe("El dominio no resuelve.");

    const rastro = await rastroDe(r.id);
    expect(rastro).toHaveLength(1);
    expect(rastro[0]?.action).toBe("EMPRESA_REJECT");
    expect(rastro[0]?.metadata).toMatchObject({ motivo: "WEB_NO_VALIDA" });
    // La NOTA no se duplica en el rastro: ya vive en su columna y dos copias pueden discrepar.
    expect(JSON.stringify(rastro[0]?.metadata)).not.toContain("no resuelve");
  });

  it("el mismo rechazo dos veces no escribe un segundo rastro; cambiar el motivo sí", async () => {
    const r = await registrar();
    const entrada = { empresaId: r.id, actorId: admin, motivo: "DUPLICADA" as const };
    await rechazarEmpresa(prisma, entrada);
    expect((await rechazarEmpresa(prisma, entrada)).estado).toBe("sin_cambios");
    expect(await rastroDe(r.id)).toHaveLength(1);

    const otro = await rechazarEmpresa(prisma, { ...entrada, motivo: "SOSPECHA_FRAUDE" });
    expect(otro.estado).toBe("hecho");
    expect(await rastroDe(r.id)).toHaveLength(2);
  });
});

describe("la cola del panel", () => {
  it("filtra por estado y pagina por keyset, sin repetir ni saltarse filas", async () => {
    // Tres empresas con fechas separadas: el orden es (createdAt, id) DESC.
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const u = await crearUsuario(prisma, { username: `empresa_${i}` });
      const r = await registrarEmpresa(
        prisma,
        { userId: u, nombre: `Negocio ${i}`, tipoCuenta: "EMPRESA", tipoNegocio: "ONLINE" },
        avisoReal(),
        new Date(Date.UTC(2027, 0, 10 + i, 12)),
      );
      ids.push(r.id);
    }
    // La tercera, verificada: deja de estar pendiente.
    await verificarEmpresa(prisma, { empresaId: ids[2]!, actorId: admin });

    const pendientes = await listarEmpresas(prisma, { estado: "PENDIENTE" });
    expect(pendientes.items.map((e) => e.id)).toEqual([ids[1], ids[0]]);

    const p1 = await listarEmpresas(prisma, { limite: 1 });
    expect(p1.items).toHaveLength(1);
    expect(p1.proximoCursor).not.toBeNull();
    const p2 = await listarEmpresas(prisma, { limite: 1, cursor: p1.proximoCursor });
    expect(p2.items[0]?.id).not.toBe(p1.items[0]?.id);

    const vistos = [p1.items[0]?.id, p2.items[0]?.id];
    expect(new Set(vistos).size).toBe(2);
    // Y el handle del dueño sale resuelto, sin su correo.
    expect(p1.items[0]?.dueno).toMatch(/^empresa_\d$/);
  });

  it("el DTO del panel trae la nota; el del dueño NO la trae", async () => {
    const r = await registrar();
    await rechazarEmpresa(prisma, {
      empresaId: r.id,
      actorId: admin,
      motivo: "DATOS_INSUFICIENTES",
      nota: "Traza interna del equipo.",
    });

    const [enPanel] = (await listarEmpresas(prisma, {})).items;
    expect(enPanel?.notaInterna).toBe("Traza interna del equipo.");

    const suya = await miEmpresa(prisma, r.id);
    // IGUALDAD EXACTA de claves, no "no contiene": así un `select` que crezca se pone rojo, que es
    // el hueco de verdad (el de siempre no es una consulta sin filtro, es un DTO que engordó).
    expect(Object.keys(suya ?? {}).sort()).toEqual(
      [
        "creadaMs",
        "direccion",
        "estado",
        "id",
        "motivoRechazo",
        "nombre",
        "tipoCuenta",
        "tipoNegocio",
        "verificadaMs",
        "webUrl",
      ].sort(),
    );
    // El motivo SÍ viaja (es lo que tiene que poder leer); la nota y el handle del admin, no.
    expect(suya?.motivoRechazo).toBe("DATOS_INSUFICIENTES");
    expect(JSON.stringify(suya)).not.toContain("Traza interna");
    expect(JSON.stringify(suya)).not.toContain(admin);
  });
});
