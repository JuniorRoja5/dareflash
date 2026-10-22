/**
 * Crear/publicar retos (M5). Con dientes:
 *  - SCHEMA (Zod puro): categoría inválida, cierre <= apertura, cierre en el pasado, ganadores < 1,
 *    premio negativo, título corto -> rechazados.
 *  - CREACIÓN (BD): queda DRAFT, publicCode único (8), slug del título, createdById = admin.
 *  - VISIBILIDAD (BD): buscarRetos NO lo encuentra en DRAFT; tras publicar SÍ. Publicar es idempotente.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { buscarRetos } from "../src/server/services/buscar";
import {
  crearRetoAdmin,
  crearRetoSchema,
  editarRetoAdmin,
  listarRetosAdmin,
  publicarReto,
} from "../src/server/services/retos-admin";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const NOW = new Date("2026-08-20T00:00:00.000Z");

function baseInput(over: Record<string, unknown> = {}) {
  return {
    title: "Salto mortal en caja",
    category: "fitness",
    prizeAmountCents: 2000,
    startsAt: "2026-08-21T00:00:00.000Z",
    deadline: "2026-08-28T00:00:00.000Z",
    winnersCount: 1,
    ...over,
  };
}

describe("crearRetoSchema (dominio)", () => {
  const schema = crearRetoSchema(NOW);

  it("acepta un input válido y normaliza opcionales vacíos a null", () => {
    const r = schema.safeParse(baseInput({ description: "", rules: "  " }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.description).toBeNull();
      expect(r.data.rules).toBeNull();
      // el `status` NO es un campo del schema (la creación es siempre DRAFT en el servicio):
      expect("status" in r.data).toBe(false);
    }
  });

  it("rechaza categoría fuera de la lista", () => {
    expect(schema.safeParse(baseInput({ category: "inexistente" })).success).toBe(false);
  });

  it("rechaza cierre <= apertura", () => {
    expect(schema.safeParse(baseInput({ deadline: "2026-08-21T00:00:00.000Z" })).success).toBe(
      false,
    ); // igual a apertura
    expect(schema.safeParse(baseInput({ deadline: "2026-08-20T12:00:00.000Z" })).success).toBe(
      false,
    ); // antes
  });

  it("rechaza cierre en el pasado (respecto a now)", () => {
    expect(
      schema.safeParse(
        baseInput({ startsAt: "2026-08-10T00:00:00.000Z", deadline: "2026-08-15T00:00:00.000Z" }),
      ).success,
    ).toBe(false);
  });

  it("rechaza ganadores < 1, premio negativo y título corto", () => {
    expect(schema.safeParse(baseInput({ winnersCount: 0 })).success).toBe(false);
    expect(schema.safeParse(baseInput({ prizeAmountCents: -1 })).success).toBe(false);
    expect(schema.safeParse(baseInput({ title: "ab" })).success).toBe(false);
  });
});

describe("crearRetoAdmin + publicarReto (BD)", () => {
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

  async function crearRetoValido(adminId: string) {
    const datos = crearRetoSchema(NOW).parse(baseInput());
    return crearRetoAdmin(prisma, adminId, datos);
  }

  it("crea el reto como DRAFT, con publicCode (8) y slug del título, createdById = admin", async () => {
    const admin = await crearUsuario(prisma, { username: "admin1" });
    const reto = await crearRetoAdmin(prisma, admin, crearRetoSchema(NOW).parse(baseInput()));

    expect(reto.status).toBe("DRAFT");
    expect(reto.publicCode).toHaveLength(8);
    expect(reto.slug).toBe("salto-mortal-en-caja");

    const fila = await prisma.challenge.findUnique({
      where: { id: reto.id },
      select: { createdById: true, status: true, prizeAmountCents: true },
    });
    expect(fila?.createdById).toBe(admin);
    expect(fila?.status).toBe("DRAFT");
  });

  it("DIENTES: un DRAFT NO es buscable; tras publicar SÍ (publicar idempotente)", async () => {
    const admin = await crearUsuario(prisma, { username: "admin2" });
    const reto = await crearRetoValido(admin);

    // DRAFT -> buscarRetos (filtra PUBLISHED) NO lo encuentra.
    const antes = await buscarRetos(prisma, "salto", null);
    expect(antes.items.map((r) => r.id)).not.toContain(reto.id);

    // Publicar: DRAFT -> PUBLISHED.
    expect(await publicarReto(prisma, reto.id)).toEqual({ publicado: true });

    const despues = await buscarRetos(prisma, "salto", null);
    expect(despues.items.map((r) => r.id)).toContain(reto.id);

    // Idempotente: volver a publicar no cambia nada.
    expect(await publicarReto(prisma, reto.id)).toEqual({ publicado: false });
  });

  it("DIENTES editar: cambia título -> regenera slug, MANTIENE publicCode y status; conserva coverImage", async () => {
    const admin = await crearUsuario(prisma, { username: "admined" });
    const reto = await crearRetoValido(admin);
    // Publica (status PUBLISHED) y pon una portada, para probar que NINGUNO cambia al editar.
    await publicarReto(prisma, reto.id);
    await prisma.challenge.update({
      where: { id: reto.id },
      data: { coverImage: "/portadas/x.webp?v=1" },
    });

    const datos = crearRetoSchema(NOW).parse(baseInput({ title: "Otro título distinto" }));
    const editado = await editarRetoAdmin(prisma, reto.id, reto.publicCode, datos);

    expect(editado).not.toBeNull();
    expect(editado!.publicCode).toBe(reto.publicCode); // INVARIANTE: no cambia
    expect(editado!.slug).toBe("otro-titulo-distinto"); // regenerado del nuevo título
    expect(editado!.status).toBe("PUBLISHED"); // editar NO despublica

    const fila = await prisma.challenge.findUnique({
      where: { id: reto.id },
      select: { title: true, status: true, publicCode: true, coverImage: true },
    });
    expect(fila?.title).toBe("Otro título distinto");
    expect(fila?.status).toBe("PUBLISHED");
    expect(fila?.publicCode).toBe(reto.publicCode);
    expect(fila?.coverImage).toBe("/portadas/x.webp?v=1"); // editarRetoAdmin NO toca la portada
  });

  it("editar un id inexistente -> null (el endpoint lo traduce a 404)", async () => {
    const datos = crearRetoSchema(NOW).parse(baseInput());
    expect(await editarRetoAdmin(prisma, "no-existe", "abcd2345", datos)).toBeNull();
  });
});

/**
 * LA LISTA DEL PANEL ESTÁ PAGINADA, y no era así.
 *
 * Antes `listarRetosAdmin` hacía un `findMany` SIN `take`: todos los retos creados nunca, con su
 * descripción y sus reglas, en cada carga del panel. Y sin desempate por id en el orden, así que
 * dos retos del mismo milisegundo —una siembra, un script— bailaban entre dos cargas de la misma
 * página. Las dos cosas se arreglan juntas porque el keyset necesita las dos.
 */
describe("listarRetosAdmin: la lista del panel", () => {
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

  async function nRetos(n: number): Promise<string[]> {
    const admin = await crearUsuario(prisma, { username: "adminpag" });
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const r = await crearRetoAdmin(
        prisma,
        admin,
        crearRetoSchema(NOW).parse(baseInput({ title: `Reto de prueba numero ${i}` })),
      );
      // Instantes distintos para un orden observable (el `createdAt` lo pone la base al insertar).
      await prisma.challenge.update({
        where: { id: r.id },
        data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) },
      });
      ids.push(r.id);
    }
    return ids;
  }

  it("trae UNA página, no la tabla entera, y dice si hay más", async () => {
    const ids = await nRetos(5);

    const p1 = await listarRetosAdmin(prisma, { limite: 2 });

    expect(p1.filas).toHaveLength(2);
    expect(p1.filas.map((f) => f.id)).toEqual([ids[4], ids[3]]); // más nuevos primero
    expect(p1.proximoCursor).not.toBeNull();
  });

  it("se recorre entera sin saltarse ni repetir ninguno", async () => {
    const ids = await nRetos(5);

    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let vuelta = 0; vuelta < 10; vuelta += 1) {
      const p: Awaited<ReturnType<typeof listarRetosAdmin>> = await listarRetosAdmin(prisma, {
        cursor,
        limite: 2,
      });
      vistos.push(...p.filas.map((f) => f.id));
      cursor = p.proximoCursor;
      if (!cursor) break;
    }

    expect(vistos).toEqual([...ids].reverse());
    expect(new Set(vistos).size).toBe(5);
  });

  it("borrar el reto del cursor entre dos páginas no descoloca la siguiente", async () => {
    const ids = await nRetos(5);

    const p1 = await listarRetosAdmin(prisma, { limite: 2 });
    // El borrado DURO: el panel no lo ofrece (marca `deletedAt` y conserva la fila como registro),
    // pero es el caso extremo del que la paginación tiene que salir entera igualmente.
    await prisma.challenge.delete({ where: { id: ids[3]! } });

    const p2 = await listarRetosAdmin(prisma, { cursor: p1.proximoCursor, limite: 2 });

    expect(
      p2.filas.map((f) => f.id),
      "la página 2 se ha descolocado",
    ).toEqual([ids[2], ids[1]]);
  });

  it("dos retos del MISMO instante no se saltan ni se duplican", async () => {
    const admin = await crearUsuario(prisma, { username: "adminemp" });
    const mismo = new Date(Date.UTC(2026, 5, 1, 10, 0, 0, 0));
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await crearRetoAdmin(
        prisma,
        admin,
        crearRetoSchema(NOW).parse(baseInput({ title: `Reto empatado numero ${i}` })),
      );
      await prisma.challenge.update({ where: { id: r.id }, data: { createdAt: mismo } });
      ids.push(r.id);
    }

    const p1 = await listarRetosAdmin(prisma, { limite: 2 });
    const p2 = await listarRetosAdmin(prisma, { cursor: p1.proximoCursor, limite: 2 });
    const vistos = [...p1.filas, ...p2.filas].map((f) => f.id);

    expect(vistos, "un empate de fecha se ha saltado o duplicado una fila").toHaveLength(3);
    expect(new Set(vistos)).toEqual(new Set(ids));
  });

  it("y el `createdAt` del cursor NO se cuela en el DTO que baja al cliente", async () => {
    // La lista lo selecciona para construir el cursor. Si el mapeo lo dejara pasar, viajaría al
    // navegador como `Date` dentro de un componente de cliente.
    await nRetos(1);
    const { filas } = await listarRetosAdmin(prisma);
    expect(Object.keys(filas[0]!)).not.toContain("createdAt");
  });
});
