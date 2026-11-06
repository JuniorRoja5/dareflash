/**
 * EL COBRO DIARIO DE LA PUBLICIDAD, contra la base de datos (Fase 9 · P9).
 *
 * DIENTES:
 *  - Se cobra HOY, una vez por campaña y día (clave `consumo:{publicidadId}:{dia}`), y repetir el
 *    barrido no cobra dos veces.
 *  - NUNCA UN ANUNCIO SERVIDO SIN COBRAR: hasta que el día está pagado, la entrega no la sirve.
 *  - Los días ANTERIORES al inicio del cobro no se cobran nunca, tampoco cuando llega el cobro.
 *  - Lo comprometido deja de contar HOY en cuanto se cobra (no se resta dos veces).
 *  - Sin saldo el día del cobro: no se sirve, se liberan sus días (hoy incluido), se pausa y se avisa
 *    a la empresa; no se le descuenta nada.
 *  - Una campaña en revisión o retirada no se cobra ese día.
 *
 * Para romperlo a propósito: quitar `filtroPagadoEl` de `campanasDeHoy` (rojo el de «sin cobrar no se
 * sirve»); quitar el `NOT EXISTS` de `compromisoDeEmpresa` (rojo el de lo comprometido); cobrar en el
 * barrido sin mirar `seCobra` (rojo el de los días gratis); no liberar HOY sin saldo (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CLAVE_INICIO_COBRO_PUBLICIDAD, CREDITOS_POR_DIA } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { aplicarCreditos } from "../src/server/services/creditos";
import { denunciar } from "../src/server/services/denuncias";
import {
  type DatosCampana,
  activarPublicidad,
  apuntarImagenPublicidad,
  compromisoDeEmpresa,
  crearBorrador,
  miPublicidad,
  reanudarPublicidad,
} from "../src/server/services/publicidad";
import { cobrarPublicidadDeHoy } from "../src/server/services/publicidad-cobro";
import { campanasDeHoy, olvidarCacheDeHoy } from "../src/server/services/publicidad-entrega";
import { retirarPublicidad } from "../src/server/services/publicidad-moderacion";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  olvidarCacheDeHoy();
});

const APP = "https://dareflash.test";
const TARIFA = CREDITOS_POR_DIA.CIUDAD;
const el = (dia: string, hora = "10:00") => new Date(`${dia}T${hora}:00.000Z`);
const DIA1 = el("2026-12-01");
const DIA2 = el("2026-12-02", "00:01");

const BASE: DatosCampana = {
  nombre: "Desayunos",
  alcance: "CIUDAD",
  ciudadId: 2509954,
  estadoCodigo: undefined,
  paises: [],
  texto: "Ven a probar nuestro pan",
  destinoUrl: "https://panaderia.example.com",
  fechaInicio: "2026-12-02",
  dias: 3,
};

let n = 0;
async function unaEmpresa(creditos = 50): Promise<string> {
  n += 1;
  const owner = await crearUsuario(prisma);
  await prisma.user.update({
    where: { id: owner },
    data: { email: `cobro${n}@empresa.test`, esCuentaEmpresa: true },
  });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: owner,
      nombre: `Panadería ${n}`,
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      estado: "VERIFICADA",
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  await aplicarCreditos(prisma, {
    empresaId: e.id,
    delta: creditos,
    reason: "AJUSTE_ADMIN",
    idempotencyKey: `test:${e.id}`,
    nota: "saldo de prueba",
  });
  return e.id;
}

/** Activa (desde el día 1) una campaña con `datos`. Por defecto, una RESERVA que empieza el día 2. */
async function unaCampana(empresaId: string, datos: Partial<DatosCampana> = {}): Promise<string> {
  const { id } = await crearBorrador(prisma, empresaId, { ...BASE, ...datos }, DIA1);
  await apuntarImagenPublicidad(prisma, empresaId, id, `/portadas/publicidad-${id}.webp`);
  expect((await activarPublicidad(prisma, empresaId, id, { ahora: DIA1 })).ok).toBe(true);
  return id;
}

const barrer = (ahora: Date) => cobrarPublicidadDeHoy(prisma, { appUrl: APP, ahora });
const saldo = async (e: string) =>
  (await prisma.empresa.findUniqueOrThrow({ where: { id: e } })).creditosSaldo;
const seSirve = async (id: string, ahora: Date) => {
  olvidarCacheDeHoy();
  return (await campanasDeHoy(prisma, ahora)).some((c) => c.id === id);
};
const consumos = (id: string) =>
  prisma.creditoLedger.findMany({
    where: { publicidadId: id, reason: "CONSUMO" },
    select: { dia: true, delta: true, idempotencyKey: true },
    orderBy: { dia: "asc" },
  });
const inicioDelCobroEn = (dia: string) =>
  prisma.systemState.upsert({
    where: { key: CLAVE_INICIO_COBRO_PUBLICIDAD },
    create: { key: CLAVE_INICIO_COBRO_PUBLICIDAD, value: dia },
    update: { value: dia },
  });

describe("el barrido cobra HOY, una vez", () => {
  it("cobra el día con su clave, y repetir el barrido no cobra dos veces", async () => {
    const e = await unaEmpresa();
    const id = await unaCampana(e);
    expect(await saldo(e)).toBe(50); // una reserva no cobra al activarse

    expect(await barrer(DIA2)).toMatchObject({ revisadas: 1, cobradas: 1, pausadas: 0 });
    expect(await barrer(el("2026-12-02", "00:06"))).toMatchObject({ revisadas: 0, cobradas: 0 });
    expect(await saldo(e)).toBe(50 - TARIFA);
    expect(await consumos(id)).toEqual([
      {
        dia: new Date("2026-12-02T00:00:00.000Z"),
        delta: -TARIFA,
        idempotencyKey: `consumo:${id}:2026-12-02`,
      },
    ]);
  });

  it("NUNCA UN ANUNCIO SERVIDO SIN COBRAR: hasta que el barrido cobra el día, no sale", async () => {
    const e = await unaEmpresa();
    const id = await unaCampana(e);
    expect(await seSirve(id, DIA2)).toBe(false);
    await barrer(DIA2);
    expect(await seSirve(id, DIA2)).toBe(true);
  });

  it("solo cobra HOY: un día que se escapó no se cobra después", async () => {
    const e = await unaEmpresa();
    const id = await unaCampana(e);
    // El worker no pasó el día 2; el 3 sí. El 2 no se sirvió (no estaba pagado), y no se cobra.
    await barrer(el("2026-12-03", "08:00"));
    expect((await consumos(id)).map((c) => c.dia?.toISOString().slice(0, 10))).toEqual([
      "2026-12-03",
    ]);
  });
});

describe("los días de antes del cobro no se cobran nunca", () => {
  it("ni al activar, ni en el barrido, ni cuando llega el primer día que se cobra", async () => {
    // La migración fija el inicio en el día SIGUIENTE al despliegue. Aquí: se despliega el 1, cobra
    // desde el 3.
    await inicioDelCobroEn("2026-12-03");
    const e = await unaEmpresa();
    const id = await unaCampana(e, { fechaInicio: "2026-12-01", dias: 4 });
    // Empieza hoy (día 1) y no cobra: el día 1 se muestra gratis (sin cobro y sin esperar al barrido).
    expect(await saldo(e)).toBe(50);
    expect(await seSirve(id, DIA1)).toBe(true);
    await barrer(DIA1);
    await barrer(DIA2);
    expect(await consumos(id)).toEqual([]);
    expect(await seSirve(id, DIA2)).toBe(true);
    // Llega el día 3: se cobra el 3, y SOLO el 3 (P9 no se «pone al día»).
    await barrer(el("2026-12-03", "00:01"));
    expect((await consumos(id)).map((c) => c.dia?.toISOString().slice(0, 10))).toEqual([
      "2026-12-03",
    ]);
    expect(await saldo(e)).toBe(50 - TARIFA);
    // Y lo comprometido no contaba los días gratis: hoy, el 4 (sin pagar) y nada más.
    expect(await compromisoDeEmpresa(prisma, e, el("2026-12-03"))).toBe(TARIFA);
  });
});

describe("lo comprometido deja de contar HOY en cuanto se cobra", () => {
  it("antes del cobro cuenta hoy; después, no: lo disponible es el mismo (no se resta dos veces)", async () => {
    const e = await unaEmpresa();
    await unaCampana(e);
    const comprometidoAntes = await compromisoDeEmpresa(prisma, e, DIA2);
    const disponibleAntes = (await saldo(e)) - comprometidoAntes;
    expect(comprometidoAntes).toBe(3 * TARIFA);

    await barrer(DIA2);
    const comprometidoDespues = await compromisoDeEmpresa(prisma, e, DIA2);
    expect(comprometidoDespues).toBe(2 * TARIFA);
    expect((await saldo(e)) - comprometidoDespues).toBe(disponibleAntes);
  });
});

describe("sin saldo el día del cobro", () => {
  it("no se sirve, libera sus días (hoy incluido), se pausa, se avisa y no se descuenta nada", async () => {
    const e = await unaEmpresa(3 * TARIFA);
    const id = await unaCampana(e);
    // Entre la reserva y el día 2, el saldo se queda corto (un ajuste del equipo, p. ej.).
    await aplicarCreditos(prisma, {
      empresaId: e,
      delta: -(3 * TARIFA),
      reason: "AJUSTE_ADMIN",
      idempotencyKey: `test:vaciar:${e}`,
      nota: "corrección",
    });

    expect(await barrer(DIA2)).toMatchObject({ revisadas: 1, cobradas: 0, pausadas: 1 });
    expect((await miPublicidad(prisma, e, id, DIA2))?.estado).toBe("PAUSADA");
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: id } })).toBe(0);
    expect(await consumos(id)).toEqual([]);
    expect(await saldo(e)).toBe(0);
    expect(await seSirve(id, DIA2)).toBe(false);
    const [correo] = await prisma.job.findMany({
      where: { idempotencyKey: `publicidad-sin-saldo:${id}:2026-12-02` },
    });
    const texto = JSON.stringify(correo?.payload);
    expect(texto).toMatch(/no te quedan créditos/);
    expect(texto).toContain("no te hemos descontado nada");

    // Cuando vuelve a tener créditos y la reanuda, recupera sus 3 días DESDE HOY y paga hoy.
    await aplicarCreditos(prisma, {
      empresaId: e,
      delta: 3 * TARIFA,
      reason: "AJUSTE_ADMIN",
      idempotencyKey: `test:recargar:${e}`,
      nota: "recarga",
    });
    expect(await reanudarPublicidad(prisma, e, id, { ahora: DIA2 })).toMatchObject({
      ok: true,
      dias: 3,
    });
    expect(await seSirve(id, DIA2)).toBe(true);
    expect(await saldo(e)).toBe(2 * TARIFA);
  });

  it("el correo va a la cuenta de la empresa", async () => {
    const e = await unaEmpresa(TARIFA);
    const id = await unaCampana(e, { dias: 1 });
    await aplicarCreditos(prisma, {
      empresaId: e,
      delta: -TARIFA,
      reason: "AJUSTE_ADMIN",
      idempotencyKey: `test:vaciar:${e}`,
      nota: "corrección",
    });
    await barrer(DIA2);
    const owner = await prisma.empresa.findUniqueOrThrow({
      where: { id: e },
      select: { user: { select: { email: true } } },
    });
    const [correo] = await prisma.job.findMany({
      where: { idempotencyKey: `publicidad-sin-saldo:${id}:2026-12-02` },
    });
    expect((correo?.payload as { to?: string }).to).toBe(owner.user.email);
  });
});

describe("en revisión o retirada, ese día no se cobra", () => {
  it("una campaña que el umbral pausó antes del barrido no se cobra", async () => {
    const e = await unaEmpresa();
    const id = await unaCampana(e);
    for (let i = 0; i < 3; i += 1) {
      await denunciar(prisma, {
        reporterId: await crearUsuario(prisma),
        targetType: "PUBLICIDAD",
        targetId: id,
        reason: "SPAM",
        ahora: DIA1,
      });
    }
    expect(await barrer(DIA2)).toMatchObject({ revisadas: 0, cobradas: 0 });
    expect(await consumos(id)).toEqual([]);
  });

  it("una retirada no se cobra; y si se retira el día ya cobrado, se le devuelve", async () => {
    const admin = await crearUsuario(prisma);
    const e = await unaEmpresa();
    const id = await unaCampana(e);
    await barrer(DIA2);
    expect(await saldo(e)).toBe(50 - TARIFA);
    await retirarPublicidad(prisma, {
      publicidadId: id,
      adminId: admin,
      motivo: "ENGANOSA",
      appUrl: APP,
      ahora: el("2026-12-02", "12:00"),
    });
    expect(await saldo(e)).toBe(50);
    expect(await seSirve(id, el("2026-12-02", "12:01"))).toBe(false);
    // Y al día siguiente, nada que cobrar.
    expect(await barrer(el("2026-12-03", "00:01"))).toMatchObject({ revisadas: 0 });
  });
});
