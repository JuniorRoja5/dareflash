/**
 * MÉTRICAS DEL RESUMEN DEL PANEL (BD). Con dientes: los conteos por estado son REALES y el desglose
 * no se contradice con el total (un DRAFT cuenta como borrador y en el total; un PUBLISHED como
 * publicado y en el total; un CLOSED solo en el total). `usuarios` = filas de User.
 *
 * Y desde que la portada dejó de ser un escaparate de inventario, tres cosas más:
 *
 *  - "ABIERTO" ES EL MISMO ESTADO QUE EN LA LISTA DE RETOS. El conteo lo hace la BD (un `COUNT` no
 *    se puede resolver clasificando filas en memoria) y la lista lo hace `estadoRetoAdmin`, que es
 *    puro. Son dos formas de decir lo mismo, así que el caso crea un reto de CADA estado y exige que
 *    las dos coincidan: si alguien cambia una y no la otra, se pone rojo. El texto de un comentario
 *    no garantizaría eso.
 *  - LAS DENUNCIAS SE CUENTAN POR OBJETO, no por fila. Quince denuncias del mismo vídeo son UNA cosa
 *    que mirar, y es lo que enseña la cola de moderación: un recuento de filas daría un número más
 *    alto que la cola y nadie sabría cuál creer.
 *  - EL DINERO VA APARTE (`metricasDinero`) y "en curso" se DERIVA de la máquina de estados, no de
 *    una lista escrita a mano.
 *
 * Para romperlo a propósito: contar `report.count()` en vez de agrupar (rojo), meter `PAID` en los
 * estados en curso (rojo), o quitar el filtro de `deletedAt` del conteo de abiertos (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { estadoRetoAdmin } from "../src/lib/estado-reto";
import { ESTADOS_RETIRADA, ESTADOS_RETIRADA_EN_CURSO } from "../src/lib/retirada";

vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "m".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-metricas" },
}));

import { metricasDinero, metricasPanel } from "../src/server/services/panel-metricas";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let admin: string;

const AHORA = new Date("2026-06-15T12:00:00Z");
const ANTES = new Date("2026-01-01T00:00:00Z");
const DESPUES = new Date("2026-12-01T00:00:00Z");

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  admin = await crearUsuario(prisma, { username: "adminmetricas" });
});

async function crearReto(
  publicCode: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await prisma.challenge.create({
    data: {
      title: "Reto",
      slug: "reto",
      publicCode,
      category: "fitness",
      status,
      prizeCurrency: "USD",
      startsAt: ANTES,
      deadline: DESPUES,
      createdById: admin,
      ...extra,
    },
  });
}

describe("metricasPanel: el inventario", () => {
  it("cuenta retos por estado y usuarios; el total incluye CLOSED aunque no esté en el desglose", async () => {
    await crearReto("pub00001", "PUBLISHED");
    await crearReto("pub00002", "PUBLISHED");
    await crearReto("dra00001", "DRAFT");
    await crearReto("clo00001", "CLOSED");
    // un segundo usuario además del admin creado en beforeEach
    await crearUsuario(prisma, { username: "otrouser" });

    const m = await metricasPanel(prisma, AHORA);
    expect(m.retosPublicados).toBe(2);
    expect(m.retosBorradores).toBe(1);
    expect(m.retosTotal).toBe(4); // 2 PUBLISHED + 1 DRAFT + 1 CLOSED
    expect(m.usuarios).toBe(2);
  });

  it("sin retos: todo a cero (nunca inventado)", async () => {
    const m = await metricasPanel(prisma, AHORA);
    expect(m).toMatchObject({
      retosTotal: 0,
      retosPublicados: 0,
      retosBorradores: 0,
      retosAbiertos: 0,
      retosEmpatePendiente: 0,
      denunciasAbiertas: 0,
    });
    expect(m.usuarios).toBe(1); // solo el admin del beforeEach
  });
});

describe('"abierto" significa lo mismo en el conteo y en la lista', () => {
  /** Un reto de cada estado que `estadoRetoAdmin` distingue, todos sobre el mismo `AHORA`. */
  const CASOS: Array<{ code: string; status: string; extra: Record<string, unknown> }> = [
    { code: "abierto01", status: "PUBLISHED", extra: {} },
    { code: "borrador1", status: "DRAFT", extra: {} },
    // Publicado pero sin empezar: NO está abierto, y antes era indistinguible de uno que sí.
    { code: "program01", status: "PUBLISHED", extra: { startsAt: DESPUES } },
    // Publicado con el plazo vencido: tampoco. La columna dice PUBLISHED; la realidad, cerrado.
    { code: "vencido01", status: "PUBLISHED", extra: { deadline: ANTES } },
    { code: "cerrado01", status: "CLOSED", extra: { closedAt: AHORA } },
    {
      code: "empate001",
      status: "CLOSED",
      extra: { closedAt: AHORA, motivoCierre: "EMPATE_PENDIENTE" },
    },
    // En camino de desaparecer: el borrado manda sobre todo lo demás.
    { code: "enborra01", status: "PUBLISHED", extra: { eliminacionProgramadaEn: AHORA } },
    { code: "borrado01", status: "PUBLISHED", extra: { deletedAt: AHORA } },
  ];

  it("el COUNT de la BD y `estadoRetoAdmin` dan el mismo número de abiertos", async () => {
    for (const c of CASOS) await crearReto(c.code, c.status, c.extra);

    const filas = await prisma.challenge.findMany({
      select: {
        status: true,
        startsAt: true,
        deadline: true,
        eliminacionProgramadaEn: true,
        deletedAt: true,
        motivoCierre: true,
      },
    });
    const abiertosPuro = filas.filter((f) => estadoRetoAdmin(f, AHORA) === "abierto").length;

    const m = await metricasPanel(prisma, AHORA);
    expect(abiertosPuro, "la fixture no tiene ningún reto abierto: el caso pasaría en vacío").toBe(
      1,
    );
    expect(m.retosAbiertos, "el conteo de la BD y la regla pura no dicen lo mismo").toBe(
      abiertosPuro,
    );
  });

  it("y los empates pendientes se cuentan aparte, porque son una tarea de una persona", async () => {
    for (const c of CASOS) await crearReto(c.code, c.status, c.extra);
    const m = await metricasPanel(prisma, AHORA);
    expect(m.retosEmpatePendiente).toBe(1);
  });

  it("un reto BORRADO no cuenta como abierto ni como empate", async () => {
    await crearReto("borrado02", "PUBLISHED", { deletedAt: AHORA });
    await crearReto("borrado03", "CLOSED", {
      closedAt: AHORA,
      motivoCierre: "EMPATE_PENDIENTE",
      deletedAt: AHORA,
    });
    const m = await metricasPanel(prisma, AHORA);
    expect(m.retosAbiertos).toBe(0);
    expect(m.retosEmpatePendiente).toBe(0);
  });
});

describe("las denuncias se cuentan por OBJETO, no por fila", () => {
  async function denunciar(targetId: string, cuantos: number, status = "OPEN"): Promise<void> {
    for (let i = 0; i < cuantos; i++) {
      const quien = await crearUsuario(prisma, { username: `den_${targetId}_${i}` });
      await prisma.report.create({
        data: {
          reporterId: quien,
          targetType: "VIDEO",
          targetId,
          reason: "SPAM",
          status,
        },
      });
    }
  }

  it("tres personas denunciando el mismo vídeo son UNA cosa que revisar", async () => {
    await denunciar("video-a", 3);
    await denunciar("video-b", 1);

    const m = await metricasPanel(prisma, AHORA);
    // Si esto dijera 4, sería el recuento de FILAS: un número más alto que el de la cola de
    // moderación, que agrupa por objeto. Dos cifras del mismo hecho y nadie sabría cuál creer.
    expect(m.denunciasAbiertas).toBe(2);
    expect(await prisma.report.count()).toBe(4);
  });

  it("y lo ya resuelto o descartado no cuenta: la cola es de lo ABIERTO", async () => {
    await denunciar("video-c", 2, "RESOLVED");
    await denunciar("video-d", 1, "DISMISSED");
    await denunciar("video-e", 1, "OPEN");

    expect((await metricasPanel(prisma, AHORA)).denunciasAbiertas).toBe(1);
  });
});

describe("metricasDinero", () => {
  /** Deja una retirada por el camino real: saldo por ledger, método guardado y solicitud. */
  async function retirada(cents: number, n: number): Promise<string> {
    const { applyWallet } = await import("../src/server/services/ledger");
    const { guardarMetodoPago } = await import("../src/server/services/metodos-pago");
    const { solicitarRetirada } = await import("../src/server/services/retirada");

    await applyWallet(prisma, {
      userId: admin,
      amountCents: cents,
      currency: "USD",
      entryType: "CREDIT",
      idempotencyKey: `semilla:${admin}:${n}`,
    });
    const m = await guardarMetodoPago(prisma, {
      userId: admin,
      destino: { metodo: "BANK", iban: "ES9121000418450200051332", titular: "Marta Ruiz" },
    });
    const r = await solicitarRetirada(prisma, {
      userId: admin,
      importeCents: cents,
      metodoPagoId: m.ok ? m.id : "",
      clave: `7777777${n}-2222-4333-8444-555555555551`,
    });
    expect(r.ok, "la fixture no pudo pedir la retirada").toBe(true);
    return r.retiradaId!;
  }

  it("sin nada: todo a cero, y el cero aquí es un dato (no un hueco)", async () => {
    expect(await metricasDinero(prisma)).toEqual({
      retiradasPendientes: 0,
      retiradasEnCurso: 0,
      retiradasEnCursoCents: 0,
      pagadoCents: 0,
      monederosCents: 0,
    });
  });

  it("separa lo que espera decisión, lo que está en curso y lo ya pagado", async () => {
    const { transicionarRetirada } = await import("../src/server/services/retirada-admin");

    // Todos por encima de `RETIRADA_MINIMA_CENTS`: por debajo la solicitud se rechaza y la fixture
    // no llegaría a crear la fila (me pasó con 3.000).
    const a = await retirada(10_000, 1); // se queda PENDING
    const b = await retirada(7_000, 2); // pasa a APPROVED: en curso, pero ya no pendiente
    const c = await retirada(5_000, 3); // llega a PAID
    const d = await retirada(6_000, 4); // se rechaza: el dinero vuelve al monedero

    await transicionarRetirada(prisma, { retiradaId: b, adminId: admin, hasta: "APPROVED" });
    for (const hasta of ["APPROVED", "PROCESSING", "PAID"] as const) {
      await transicionarRetirada(prisma, { retiradaId: c, adminId: admin, hasta });
    }
    await transicionarRetirada(prisma, { retiradaId: d, adminId: admin, hasta: "REJECTED" });

    const m = await metricasDinero(prisma);
    expect(m.retiradasPendientes, "solo la que espera una firma").toBe(1);
    expect(m.retiradasEnCurso, "la PENDING y la APPROVED").toBe(2);
    expect(m.retiradasEnCursoCents).toBe(17_000);
    expect(m.pagadoCents).toBe(5_000);
    // El rechazo DEVOLVIÓ los 6.000 al monedero, así que eso es lo que queda de saldo.
    expect(m.monederosCents).toBe(6_000);
    expect(a).toBeTruthy();
  });

  it('"en curso" sale de la máquina de estados, no de una lista escrita a mano', () => {
    // El invariante: en curso = lo que NO es final. Si mañana entra otro estado final, esta lista se
    // encoge sola. Enumerarla en el servicio sería una segunda verdad, y la que contaría mal es la
    // del dinero.
    expect([...ESTADOS_RETIRADA_EN_CURSO]).toEqual(["PENDING", "APPROVED", "PROCESSING"]);
    expect([...ESTADOS_RETIRADA].sort()).toEqual([
      "APPROVED",
      "PAID",
      "PENDING",
      "PROCESSING",
      "REJECTED",
    ]);
  });

  it("y el saldo de los monederos suma TODAS las cuentas, no solo las que han pedido algo", async () => {
    const { applyWallet } = await import("../src/server/services/ledger");
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    for (const [quien, cents] of [
      [admin, 1_234],
      [otra, 8_766],
    ] as const) {
      await applyWallet(prisma, {
        userId: quien,
        amountCents: cents,
        currency: "USD",
        entryType: "CREDIT",
        idempotencyKey: `semilla:total:${quien}`,
      });
    }
    expect((await metricasDinero(prisma)).monederosCents).toBe(10_000);
  });
});
