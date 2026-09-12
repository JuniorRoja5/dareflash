/**
 * NOTIFICACIONES — el servicio. Emitir es "insertar si no está", la bandeja pagina por keyset sin
 * repetir ni comerse filas, el contador de no-leídas cuadra, y marcar leído solo toca lo propio.
 *
 * Para romperlos a propósito, que es la comprobación de verdad:
 *  - quitar `skipDuplicates` de `emitirAviso` -> la segunda emisión revienta con P2002;
 *  - quitar el @@unique de la migración -> la emisión repetida escribe dos filas;
 *  - paginar por OFFSET, o sin el `id` desempatando -> las páginas repiten o se saltan avisos;
 *  - quitar `userId` del WHERE de `marcarLeidas` -> se marcan avisos ajenos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { NOTIF_NO_LEIDAS_TOPE, TipoNotificacionSchema } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  AvisoSchema,
  avisoAnuncio,
  avisoGanasteReto,
  avisoSubisteNivel,
  avisoTop20,
  avisoVideoFallido,
  avisoVideoListo,
  avisoVotoRecibido,
  textoAviso,
  type Aviso,
} from "../src/lib/notificaciones";
import {
  contarNoLeidas,
  emitirAviso,
  listarNotificaciones,
  marcarLeidas,
} from "../src/server/services/notificaciones";

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

const RETO = { titulo: "Reto de prueba", codigo: "ABC234", slug: "reto-de-prueba" };
const cuantas = (u = userId) => prisma.notification.count({ where: { userId: u } });

/** Un aviso de CADA tipo, para los tests que recorren la unión entera. */
const UNO_DE_CADA: Aviso[] = [
  avisoVideoListo("v1"),
  avisoVideoFallido("v2", "TOO_LONG"),
  avisoVotoRecibido({ submissionId: "s1", votanteId: "u9", reto: RETO }),
  avisoGanasteReto({ challengeId: "c1", reto: RETO, puntos: 30 }),
  avisoTop20({ challengeId: "c1", reto: RETO, puntos: 10 }),
  avisoSubisteNivel("challenger"),
  avisoAnuncio("a1"),
];
/** El texto de los anuncios vive en `Announcement`: se une por refId al pintar. */
const TEXTOS_ANUNCIO = new Map([["a1", "Mantenimiento programado el sábado por la mañana."]]);

describe("emitir es insertar-si-no-está", () => {
  it("el mismo hecho dos veces deja UNA fila", async () => {
    expect(await emitirAviso(prisma, userId, avisoVideoListo("v1"))).toBe(true);
    expect(await emitirAviso(prisma, userId, avisoVideoListo("v1"))).toBe(false);
    expect(await cuantas()).toBe(1);
  });

  it("cinco emisiones A LA VEZ del mismo hecho dejan UNA", async () => {
    const aviso = avisoGanasteReto({ challengeId: "c1", reto: RETO, puntos: 30 });
    const r = await Promise.all(
      Array.from({ length: 5 }, () => emitirAviso(prisma, userId, aviso)),
    );
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(await cuantas()).toBe(1);
  });

  it("la unicidad está en la BD: UNIQUE (userId, tipo, refType, refId), en ese orden", async () => {
    const filas = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
      SELECT COLUMN_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Notification' AND NON_UNIQUE = 0
        AND INDEX_NAME = 'Notification_userId_tipo_refType_refId_key'
      ORDER BY SEQ_IN_INDEX`;
    expect(filas.map((f) => f.COLUMN_NAME)).toEqual(["userId", "tipo", "refType", "refId"]);
  });

  it("el mismo hecho a OTRO destinatario es otro aviso", async () => {
    const otro = await crearUsuario(prisma);
    await emitirAviso(prisma, userId, avisoVideoListo("v1"));
    await emitirAviso(prisma, otro, avisoVideoListo("v1"));
    expect(await cuantas()).toBe(1);
    expect(await cuantas(otro)).toBe(1);
  });

  it("un aviso mal formado no llega a la BD", async () => {
    const roto = {
      tipo: "VOTO_RECIBIDO",
      refType: "NIVEL",
      refId: "x",
      datos: {},
    } as unknown as Aviso;
    await expect(emitirAviso(prisma, userId, roto)).rejects.toThrow();
    expect(await cuantas()).toBe(0);
  });
});

describe("la unión de tipos", () => {
  it("no contiene ningún tipo de comentario", () => {
    for (const t of TipoNotificacionSchema.options) expect(t).not.toMatch(/COMENT|COMMENT/i);
  });

  it("el esquema del aviso cubre EXACTAMENTE los tipos de la unión (ni uno más ni uno menos)", () => {
    const deAviso = AvisoSchema.options.map((o) => o.shape.tipo.value).sort();
    expect(deAviso).toEqual([...TipoNotificacionSchema.options].sort());
    expect(UNO_DE_CADA.map((a) => a.tipo).sort()).toEqual(deAviso);
  });

  it("la unión añade EXACTAMENTE un tipo para los anuncios, y rechaza lo no listado", () => {
    expect([...TipoNotificacionSchema.options].sort()).toEqual(
      [
        "ANUNCIO",
        "GANASTE_RETO",
        "SUBISTE_NIVEL",
        "TOP20",
        "VIDEO_FALLIDO",
        "VIDEO_LISTO",
        "VOTO_RECIBIDO",
      ].sort(),
    );
    const inventado = { tipo: "COMENTARIO_RECIBIDO", refType: "ANUNCIO", refId: "x", datos: {} };
    expect(AvisoSchema.safeParse(inventado).success).toBe(false);
  });

  it("un ANUNCIO lleva datos VACÍOS (el texto no se copia) y sin su texto unido no se pinta", () => {
    expect(avisoAnuncio("a1").datos).toEqual({});
    expect(textoAviso(avisoAnuncio("a1"))).toBeNull();
    expect(textoAviso(avisoAnuncio("a1"), { anuncios: TEXTOS_ANUNCIO })?.es).toBe(
      TEXTOS_ANUNCIO.get("a1"),
    );
  });

  it("cada tipo tiene texto ES y EN humano, sin códigos técnicos, y un enlace local", () => {
    for (const a of UNO_DE_CADA) {
      const t = textoAviso(a, { anuncios: TEXTOS_ANUNCIO });
      expect(t, a.tipo).not.toBeNull();
      expect(t!.es.length).toBeGreaterThan(10);
      expect(t!.en.length).toBeGreaterThan(10);
      expect(t!.es).not.toMatch(/PENDING|FAILED|TOO_LONG|TRANSCODE|UPLOAD_|null|undefined|\bu9\b/);
      expect(t!.href.startsWith("/")).toBe(true);
    }
  });

  it("cada motivo de fallo de un vídeo tiene su texto (la reconciliación también falla vídeos)", () => {
    for (const m of [
      "TRANSCODE_ERROR",
      "TOO_LONG",
      "UPLOAD_INCOMPLETE",
      "OBJETO_INEXISTENTE",
    ] as const) {
      // Dice la VERDAD (brief: sin promesas): que no se publica. "Demasiado largo" reutiliza el copy de
      // la pantalla de subida, que lo dice en pasado ("no se ha publicado").
      expect(textoAviso(avisoVideoFallido("v", m))?.es, m).toMatch(
        /no se publicará|no llegará|no se ha publicado/,
      );
    }
  });
});

describe("la bandeja pagina por KEYSET", () => {
  async function recorrer(limite: number): Promise<string[]> {
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i += 1) {
      const p = await listarNotificaciones(prisma, userId, { cursor, limite });
      vistos.push(...p.items.map((it) => it.id));
      cursor = p.nextCursor;
      if (!cursor) break;
    }
    return vistos;
  }

  it("40 avisos del MISMO instante: las páginas los cubren todos, sin repetir ni saltar", async () => {
    // El caso difícil: el cierre de un reto emite varios avisos en el mismo milisegundo.
    const t = new Date("2026-09-01T10:00:00.000Z");
    await prisma.notification.createMany({
      data: Array.from({ length: 40 }, (_, i) => ({
        userId,
        tipo: "VIDEO_LISTO",
        refType: "VIDEO",
        refId: `v${i}`,
        datos: {},
        createdAt: t,
      })),
    });
    const vistos = await recorrer(18);
    expect(vistos).toHaveLength(40);
    expect(new Set(vistos).size).toBe(40);
    // Mismo instante -> desempata el id, descendente.
    expect(vistos).toEqual([...vistos].sort().reverse());
  });

  it("un aviso que llega ENTRE dos páginas no desplaza la siguiente (con OFFSET repetiría uno)", async () => {
    const base = Date.parse("2026-09-01T10:00:00.000Z");
    await prisma.notification.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        userId,
        tipo: "VIDEO_LISTO",
        refType: "VIDEO",
        refId: `v${i}`,
        datos: {},
        createdAt: new Date(base + i * 1000),
      })),
    });
    const p1 = await listarNotificaciones(prisma, userId, { limite: 10 });
    await emitirAviso(prisma, userId, avisoVideoListo("nuevo"));
    const p2 = await listarNotificaciones(prisma, userId, { cursor: p1.nextCursor, limite: 10 });
    const ids = [...p1.items, ...p2.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(20);
    expect(p2.nextCursor).toBeNull();
  });

  it("más recientes primero, y solo los del propio usuario", async () => {
    const otro = await crearUsuario(prisma);
    await emitirAviso(prisma, otro, avisoVideoListo("ajeno"));
    await prisma.notification.create({
      data: {
        userId,
        tipo: "VIDEO_LISTO",
        refType: "VIDEO",
        refId: "viejo",
        datos: {},
        createdAt: new Date("2026-01-01"),
      },
    });
    await emitirAviso(prisma, userId, avisoVideoListo("reciente"));
    const p = await listarNotificaciones(prisma, userId);
    expect(p.items).toHaveLength(2);
    expect(p.items[0]!.creadaMs).toBeGreaterThan(p.items[1]!.creadaMs);
  });

  it("un cursor manipulado se trata como la primera página, sin excepción", async () => {
    await emitirAviso(prisma, userId, avisoVideoListo("v1"));
    for (const basura of ["", "abc", "1.2.3", "9999999999999999.x", "'; DROP TABLE x"]) {
      const p = await listarNotificaciones(prisma, userId, { cursor: basura });
      expect(p.items).toHaveLength(1);
    }
  });

  it("una fila que no valida se omite sin romper la página, y el cursor no la vuelve a servir", async () => {
    const t = new Date("2026-09-01T10:00:00.000Z");
    await prisma.notification.createMany({
      data: [
        {
          userId,
          tipo: "VIDEO_LISTO",
          refType: "VIDEO",
          refId: "a",
          datos: {},
          createdAt: new Date(t.getTime() + 2),
        },
        // Fila de "otra versión": un tipo que ya no existe.
        {
          userId,
          tipo: "TIPO_VIEJO",
          refType: "VIDEO",
          refId: "b",
          datos: {},
          createdAt: new Date(t.getTime() + 1),
        },
        { userId, tipo: "VIDEO_LISTO", refType: "VIDEO", refId: "c", datos: {}, createdAt: t },
      ],
    });
    const p1 = await listarNotificaciones(prisma, userId, { limite: 2 });
    expect(p1.items).toHaveLength(1); // "a" (la rota se omite)
    const p2 = await listarNotificaciones(prisma, userId, { cursor: p1.nextCursor, limite: 2 });
    expect(p2.items).toHaveLength(1); // "c", sin repetir "a"
    expect(p2.items[0]!.id).not.toBe(p1.items[0]!.id);
  });

  it("la vista NO expone la clave del hecho (en un voto llevaría dentro al votante)", async () => {
    await emitirAviso(
      prisma,
      userId,
      avisoVotoRecibido({ submissionId: "s1", votanteId: "votante-secreto", reto: RETO }),
    );
    const p = await listarNotificaciones(prisma, userId);
    expect(JSON.stringify(p)).not.toContain("votante-secreto");
  });
});

describe("no-leídas y marcar como leídas", () => {
  async function emitirN(n: number, u = userId): Promise<string[]> {
    for (let i = 0; i < n; i += 1) await emitirAviso(prisma, u, avisoVideoListo(`v${i}`));
    return (await prisma.notification.findMany({ where: { userId: u }, select: { id: true } })).map(
      (f) => f.id,
    );
  }

  it("el contador cuadra con lo que se marca, y marcar dos veces no cambia nada", async () => {
    const ids = await emitirN(5);
    expect(await contarNoLeidas(prisma, userId)).toBe(5);
    expect(await marcarLeidas(prisma, userId, ids.slice(0, 2))).toBe(2);
    expect(await contarNoLeidas(prisma, userId)).toBe(3);
    expect(await marcarLeidas(prisma, userId, ids.slice(0, 2))).toBe(0);
    expect(await contarNoLeidas(prisma, userId)).toBe(3);
  });

  it("marcar ids AJENOS no toca nada (autorización por construcción)", async () => {
    const otro = await crearUsuario(prisma);
    const ajenos = await emitirN(3, otro);
    expect(await marcarLeidas(prisma, userId, ajenos)).toBe(0);
    expect(await contarNoLeidas(prisma, otro)).toBe(3);
  });

  it("con TOPE: por encima de 99 se cuentan 100 y no más", async () => {
    await prisma.notification.createMany({
      data: Array.from({ length: 150 }, (_, i) => ({
        userId,
        tipo: "VIDEO_LISTO",
        refType: "VIDEO",
        refId: `v${i}`,
        datos: {},
      })),
    });
    expect(await contarNoLeidas(prisma, userId)).toBe(NOTIF_NO_LEIDAS_TOPE + 1);
  });
});
