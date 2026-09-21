/**
 * LAS CUENTAS EN EL PANEL — contra la BD.
 *
 * Lo que se fija:
 *  - UN SOLO BUSCADOR. El del panel es el motor de la app en modo panel: entiende que «@yuyu» es el
 *    handle `yuyu` (el fallo que provocó esta pieza) y encuentra por PALABRA dentro del nombre, no
 *    solo por prefijo. Ve a los suspendidos; el público no. Lo borrado no lo ve ninguno.
 *  - LISTADO POR KEYSET en los cuatro órdenes: recorrerlo no repite ni se salta a nadie, ni siquiera
 *    cuando entran altas nuevas entre página y página. Un cursor de otro orden no se usa.
 *  - FILTROS de rol y estado, y valen TAMBIÉN al buscar: si no, el filtro sería mentira en cuanto
 *    alguien escribe algo.
 *  - PII: ninguna fila del listado ni de la ficha lleva email. El email se pide de uno en uno y deja
 *    rastro en `AuditLog` — y si no hay a quién mirar, no se anota nada.
 *
 * Para romperlo: quitar el `normalizarTermino` (rojo en «@yuyu»), devolver `bannedAt IS NULL` en modo
 * panel (rojo), paginar con OFFSET (rojo con altas nuevas), dejar de comprobar el orden del cursor
 * (rojo), o sacar el email en el DTO (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { generarHandle } from "../src/server/auth/handle";
import { buscarUsuarios } from "../src/server/services/buscar";
import {
  emailDeCuenta,
  fichaCuenta,
  listarCuentas,
  type CuentaPanel,
} from "../src/server/services/cuentas-panel";

import { createTestPrisma, resetDb } from "./helpers/db";

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

async function crear(o: {
  username?: string;
  displayName?: string | null;
  email?: string | null;
  role?: "USER" | "MODERATOR" | "ADMIN";
  bannedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt?: Date;
  puntos?: number;
  victorias?: number;
}): Promise<string> {
  const u = await prisma.user.create({
    data: {
      username: o.username ?? generarHandle(),
      displayName: o.displayName ?? null,
      email: o.email ?? null,
      role: o.role ?? "USER",
      bannedAt: o.bannedAt ?? null,
      deletedAt: o.deletedAt ?? null,
      pointsBalance: o.puntos ?? 0,
      victoriasTotales: o.victorias ?? 0,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    },
    select: { id: true },
  });
  return u.id;
}

/** Atajo: el listado con lo mínimo. El orden por defecto es el de la pantalla. */
const listar = (extra: Partial<Parameters<typeof listarCuentas>[1]> = {}) =>
  listarCuentas(prisma, { orden: "alta", ...extra });

const handles = (items: CuentaPanel[]) => items.map((c) => c.username);

/** Recorre TODAS las páginas del listado y devuelve los handles en el orden en que salieron. */
async function recorrer(
  opciones: Partial<Parameters<typeof listarCuentas>[1]> & { limite: number },
  entrePaginas?: () => Promise<void>,
): Promise<string[]> {
  const vistos: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i += 1) {
    const p = await listar({ ...opciones, cursor });
    vistos.push(...handles(p.items));
    cursor = p.proximoCursor;
    if (!cursor) break;
    if (entrePaginas) await entrePaginas();
  }
  return vistos;
}

describe("el buscador del panel es el de verdad", () => {
  it("«@yuyu» y «yuyu» encuentran al handle `yuyu` (los handles se guardan SIN arroba)", async () => {
    await crear({ username: "yuyu", displayName: "Yu Yu" });
    await crear({ username: "otra" });

    for (const q of ["yuyu", "@yuyu", "  @yuyu  "]) {
      const p = await listar({ q });
      expect(handles(p.items), q).toEqual(["yuyu"]);
      expect(p.modo, q).toBe("busqueda");
    }
  });

  it("encuentra por PALABRA dentro del nombre, no solo por prefijo del handle", async () => {
    await crear({ username: "mr2026", displayName: "Marta Ruiz" });
    await crear({ username: "nadie", displayName: "Sin relación" });

    // Un buscador de solo prefijo no encontraría «rui»: no es el principio de nada.
    expect(handles((await listar({ q: "rui" })).items)).toEqual(["mr2026"]);
  });

  it("ve a las SUSPENDIDAS —el público no—, y ninguno ve a las borradas", async () => {
    await crear({ username: "castigada", bannedAt: new Date() });
    await crear({ username: "castigado", deletedAt: new Date() });

    expect(handles((await listar({ q: "castigad" })).items)).toEqual(["castigada"]);
    // El buscador público sigue escondiéndola: es su trabajo, y esta pieza no lo toca.
    const publica = await buscarUsuarios(prisma, "castigad", null);
    expect(publica.items).toEqual([]);
  });

  it("los filtros valen TAMBIÉN buscando", async () => {
    await crear({ username: "marta", role: "MODERATOR" });
    await crear({ username: "martin", role: "USER" });
    await crear({ username: "martita", role: "USER", bannedAt: new Date() });

    expect(handles((await listar({ q: "mart" })).items).sort()).toEqual([
      "marta",
      "martin",
      "martita",
    ]);
    expect(handles((await listar({ q: "mart", rol: "MODERATOR" })).items)).toEqual(["marta"]);
    expect(handles((await listar({ q: "mart", estado: "suspendida" })).items)).toEqual(["martita"]);
    expect(handles((await listar({ q: "mart", estado: "activa" })).items).sort()).toEqual([
      "marta",
      "martin",
    ]);
  });

  it("un comodín de LIKE es un carácter literal, no un volcado del censo", async () => {
    await crear({ username: "alguien" });
    for (const q of ["%", "_", "%%"]) {
      expect(handles((await listar({ q })).items), q).toEqual([]);
    }
  });
});

describe("el listado del censo", () => {
  it("sin término salen TODAS las no borradas, por alta descendente", async () => {
    const dia = (d: number) => new Date(Date.UTC(2026, 0, d));
    await crear({ username: "vieja", createdAt: dia(1) });
    await crear({ username: "media", createdAt: dia(2) });
    await crear({ username: "nueva", createdAt: dia(3) });
    await crear({ username: "borrada", createdAt: dia(4), deletedAt: new Date() });
    // Una suspendida NO se esconde en el listado: aquí es donde se le levanta la suspensión.
    await crear({ username: "suspendida", createdAt: dia(5), bannedAt: new Date() });

    const p = await listar();
    expect(p.modo).toBe("listado");
    expect(handles(p.items)).toEqual(["suspendida", "nueva", "media", "vieja"]);
  });

  it("KEYSET: recorrer el censo no repite ni se salta a nadie", async () => {
    const esperado: string[] = [];
    for (let i = 9; i >= 0; i -= 1) {
      const username = `u${i}`;
      await crear({ username, createdAt: new Date(Date.UTC(2026, 0, i + 1)) });
      esperado.push(username);
    }

    expect(await recorrer({ limite: 3 })).toEqual(esperado);
  });

  it("KEYSET: altas NUEVAS entre página y página no desplazan lo ya servido", async () => {
    const esperado: string[] = [];
    for (let i = 9; i >= 0; i -= 1) {
      const username = `u${i}`;
      await crear({ username, createdAt: new Date(Date.UTC(2026, 0, i + 1)) });
      esperado.push(username);
    }

    // Cada vez que se pide una página, alguien se da de alta AHORA (o sea, delante de todos). Con
    // OFFSET, cada inserción empujaría la ventana y el recorrido repetiría filas.
    let n = 0;
    const vistos = await recorrer({ limite: 3 }, async () => {
      n += 1;
      await crear({ username: `intrusa${n}`, createdAt: new Date(Date.UTC(2026, 5, n)) });
    });

    expect(n).toBeGreaterThan(0);
    expect(vistos).toEqual(esperado);
    expect(new Set(vistos).size).toBe(vistos.length); // ni un repetido
  });

  it("los otros tres órdenes ordenan de verdad, y también por keyset", async () => {
    await crear({ username: "cero", puntos: 0, victorias: 0 });
    await crear({ username: "bravo", puntos: 300, victorias: 1 });
    await crear({ username: "alfa", puntos: 100, victorias: 7 });

    expect(handles((await listar({ orden: "alfabetico" })).items)).toEqual([
      "alfa",
      "bravo",
      "cero",
    ]);
    expect(handles((await listar({ orden: "puntos" })).items)).toEqual(["bravo", "alfa", "cero"]);
    expect(handles((await listar({ orden: "victorias" })).items)).toEqual([
      "alfa",
      "bravo",
      "cero",
    ]);

    for (const orden of ["alfabetico", "puntos", "victorias"] as const) {
      const entero = handles((await listar({ orden })).items);
      expect(await recorrer({ orden, limite: 1 }), orden).toEqual(entero);
    }
  });

  it("empatados en la cifra, el id desempata: nadie se pisa al paginar", async () => {
    for (let i = 0; i < 4; i += 1) await crear({ username: `igual${i}`, puntos: 50 });

    const todos = await recorrer({ orden: "puntos", limite: 1 });
    expect(todos).toHaveLength(4);
    expect(new Set(todos).size).toBe(4);
  });

  it("un cursor de OTRO orden no pagina: se vuelve a la primera página", async () => {
    for (let i = 0; i < 4; i += 1) {
      await crear({ username: `u${i}`, puntos: i, createdAt: new Date(Date.UTC(2026, 0, i + 1)) });
    }

    const porPuntos = await listar({ orden: "puntos", limite: 2 });
    expect(porPuntos.proximoCursor).not.toBeNull();

    // El mismo cursor, con el orden cambiado. No se compara un saldo contra una fecha: se ignora.
    const mezclado = await listar({ orden: "alta", limite: 2, cursor: porPuntos.proximoCursor });
    const primeraDeAlta = await listar({ orden: "alta", limite: 2 });
    expect(handles(mezclado.items)).toEqual(handles(primeraDeAlta.items));
  });

  it("filtra por rol y por estado", async () => {
    await crear({ username: "jefa", role: "ADMIN" });
    await crear({ username: "mod", role: "MODERATOR" });
    await crear({ username: "pepe", role: "USER" });
    await crear({ username: "castigado", role: "USER", bannedAt: new Date() });

    expect(handles((await listar({ rol: "ADMIN" })).items)).toEqual(["jefa"]);
    expect(handles((await listar({ rol: "MODERATOR" })).items)).toEqual(["mod"]);
    expect(handles((await listar({ estado: "suspendida" })).items)).toEqual(["castigado"]);
    expect(handles((await listar({ estado: "activa" })).items).sort()).toEqual([
      "jefa",
      "mod",
      "pepe",
    ]);
    // Combinados.
    expect(handles((await listar({ rol: "USER", estado: "suspendida" })).items)).toEqual([
      "castigado",
    ]);
  });
});

describe("la ficha", () => {
  it("trae identidad, gobierno y cifras", async () => {
    const id = await crear({
      username: "yuyu",
      displayName: "Yu Yu",
      role: "MODERATOR",
      bannedAt: null,
      createdAt: new Date(Date.UTC(2026, 2, 9)),
      puntos: 4200,
      victorias: 3,
    });

    const f = await fichaCuenta(prisma, id);
    expect(f?.cuenta).toMatchObject({
      id,
      username: "yuyu",
      displayName: "Yu Yu",
      rol: "MODERATOR",
      suspendida: false,
      puntos: 4200,
      victorias: 3,
    });
    expect(f?.cuenta.alta.toISOString()).toBe("2026-03-09T00:00:00.000Z");
    // Los puntos salen del lector de DareUp, no de una segunda definición de "cuántos tiene".
    expect(f?.puntos).toBe(4200);
  });

  it("una cuenta borrada o inexistente no tiene ficha", async () => {
    const borrada = await crear({ username: "fantasma", deletedAt: new Date() });
    expect(await fichaCuenta(prisma, borrada)).toBeNull();
    expect(await fichaCuenta(prisma, "no-existe")).toBeNull();
  });
});

describe("el email: PII con rastro", () => {
  const vistas = () => prisma.auditLog.findMany({ where: { action: "EMAIL_VIEW" } });

  it("NO viaja en el listado ni en la ficha", async () => {
    const id = await crear({ username: "yuyu", email: "yuyu@example.com" });

    const fila = (await listar()).items[0]!;
    // A nivel de TIPO no existe; se comprueba también en runtime, que es lo que viaja al cliente.
    expect(Object.keys(fila)).not.toContain("email");
    expect(JSON.stringify(fila)).not.toContain("example.com");

    const f = await fichaCuenta(prisma, id);
    expect(JSON.stringify(f)).not.toContain("example.com");
    // Y nadie ha mirado nada todavía.
    expect(await vistas()).toEqual([]);
  });

  it("pedirlo lo devuelve Y deja una fila de auditoría con quién y a quién", async () => {
    const mira = await crear({ username: "moderadora", role: "MODERATOR" });
    const id = await crear({ username: "yuyu", email: "yuyu@example.com" });

    expect(await emailDeCuenta(prisma, { actorId: mira, userId: id })).toEqual({
      estado: "hecho",
      email: "yuyu@example.com",
    });

    const filas = await vistas();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ actorId: mira, targetType: "USER", targetId: id });
    // La dirección NO se copia al rastro: duplicar la PII multiplicaría lo que se quiere vigilar.
    expect(JSON.stringify(filas[0]?.metadata)).not.toContain("example.com");
  });

  it("cada consulta deja su propia fila: el rastro cuenta veces, no gente", async () => {
    const mira = await crear({ username: "moderadora", role: "MODERATOR" });
    const id = await crear({ username: "yuyu", email: "yuyu@example.com" });

    await emailDeCuenta(prisma, { actorId: mira, userId: id });
    await emailDeCuenta(prisma, { actorId: mira, userId: id });

    expect(await vistas()).toHaveLength(2);
  });

  it("una cuenta sin dirección responde `null`, y se anota igual: lo que se registra es que se miró", async () => {
    const mira = await crear({ username: "moderadora", role: "MODERATOR" });
    const id = await crear({ username: "conoauth", email: null });

    expect(await emailDeCuenta(prisma, { actorId: mira, userId: id })).toEqual({
      estado: "hecho",
      email: null,
    });
    expect(await vistas()).toHaveLength(1);
  });

  it("de una cuenta que no existe (o borrada) no se anota nada: no se ha mirado a nadie", async () => {
    const mira = await crear({ username: "moderadora", role: "MODERATOR" });
    const borrada = await crear({ username: "fantasma", email: "x@y.com", deletedAt: new Date() });

    for (const objetivo of ["no-existe", borrada]) {
      expect(await emailDeCuenta(prisma, { actorId: mira, userId: objetivo }), objetivo).toEqual({
        estado: "rechazado",
        motivo: "NO_ENCONTRADA",
      });
    }
    expect(await vistas()).toEqual([]);
  });
});
