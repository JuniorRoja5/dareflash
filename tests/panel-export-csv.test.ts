/**
 * LA EXPORTACIÓN A CSV — la única puerta por la que un IBAN sale del servidor en un fichero.
 *
 * ┌─ POR QUÉ ESTE FICHERO ES EL MÁS ESTRICTO DE LA PIEZA ────────────────────────────────────────┐
 * │ El CSV de retiradas lleva el destino EN CLARO, decidido a propósito: sin él no se concilia    │
 * │ con el extracto del banco. Eso convierte esta ruta en la que más daño hace si se abre de más, │
 * │ así que lo que se fija no es que funcione: es quién NO pasa y qué queda escrito cuando pasa.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 *  - SOLO ADMIN. Un moderador y un usuario, 403 — y sin fichero.
 *  - CADA EXPORTACIÓN DEJA SU LÍNEA en el `AuditLog`, con qué y cuántas filas. Un fichero con cien
 *    IBANes tiene que poder rastrearse hasta la persona que lo pidió.
 *  - EL DESTINO VA COMPLETO Y DESCIFRADO, y solo en el CSV: ni en la traza, ni en la respuesta de
 *    ninguna otra ruta.
 *  - EL ESCAPADO AGUANTA una coma y una comilla en un nombre o en un motivo.
 *
 * Para romperlo a propósito: quitar el `requireRole` (rojo), escribir la traza después de la
 * respuesta (rojo: el caso del 403 que no debe dejar línea), o meter el destino en el `metadata`
 * del AuditLog (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: {
    userId: "",
    sessionId: "s1",
    role: "ADMIN" as "ADMIN" | "MODERATOR" | "USER",
    emailVerified: new Date() as Date | null,
  },
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "e".repeat(40), AUTH_SECRET: "TEST-FIXTURE-auth-secret-export" },
}));
vi.mock("@/server/auth/mutating-route", () => ({
  mutatingRoute:
    (handler: (req: Request, ctx: unknown, rc: unknown) => Promise<Response>) =>
    (req: Request, rc: unknown) =>
      handler(req, { user: H.user, env: {}, prisma: H.prisma }, rc),
}));
vi.mock("@/server/auth/current-user", () => ({
  getCurrentUser: async () => (H.user.userId ? H.user : null),
}));

import { POST as exportar } from "../src/app/api/panel/monedero/export/route";
import { cifrarDatoDePago } from "../src/server/security/cifrado-pagos";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let duenyo: string;

const IBAN = "ES9121000418450200051332";
/** Un nombre con COMA y COMILLA: los dos caracteres que parten un CSV mal escapado. */
const TITULAR = 'Ruiz, Marta "la jefa"';

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  H.user.userId = await crearUsuario(prisma, { username: "la_admin" });
  H.user.role = "ADMIN";
  duenyo = await crearUsuario(prisma, { username: "la_cobradora" });
});

/**
 * El rango es OBLIGATORIO desde la pieza de mantenimiento. Los casos que no van de rangos usan el
 * preset de "último mes" (las filas de la fixture se crean ahora, así que entran); los que SÍ van
 * de rangos pasan el suyo. Se mezcla aquí y no en cada llamada para que el fichero siga leyéndose
 * sobre lo que cada caso prueba.
 */
const pedir = (cuerpo: unknown): Promise<Response> => {
  const body =
    cuerpo && typeof cuerpo === "object" ? { preset: "mes", ...(cuerpo as object) } : cuerpo;
  return exportar(
    new Request("http://test/api/panel/monedero/export", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify(body),
    }),
    undefined,
  );
};

async function unaRetirada(): Promise<void> {
  await prisma.withdrawal.create({
    data: {
      id: "w-1",
      userId: duenyo,
      amountCents: 7500,
      currency: "USD",
      status: "PENDING",
      metodo: "BANK",
      datosPago: cifrarDatoDePago(JSON.stringify({ iban: IBAN, titular: TITULAR })),
      pista: "1332",
      idempotencyKey: "k-1",
    },
  });
}

async function unAjuste(nota: string): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: H.user.userId,
      action: "WALLET_ADJUST",
      targetType: "USER",
      targetId: duenyo,
      metadata: { deltaCents: 2500, antes: 0, despues: 2500, nota },
    },
  });
}

describe("quién puede exportar", () => {
  it("el administrador, sí", async () => {
    await unaRetirada();
    const res = await pedir({ tipo: "retiradas" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="retiradas-/);
    // Un CSV con IBANes no se guarda en ninguna caché.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  for (const rol of ["MODERATOR", "USER"] as const) {
    it(`un ${rol} no: son datos de pago en claro`, async () => {
      await unaRetirada();
      H.user.role = rol;

      const res = await pedir({ tipo: "retiradas" });

      expect(res.status).toBe(403);
      expect(await res.text(), "el 403 devolvió datos").not.toContain(IBAN);
      // Y NO deja línea de auditoría: no hubo exportación que auditar, y una traza de algo que no
      // ocurrió ensucia justo el registro que tiene que ser fiable.
      expect(await prisma.auditLog.count({ where: { action: "WALLET_EXPORT" } })).toBe(0);
    });
  }

  it("y una exportación que no existe se rechaza con 400", async () => {
    for (const cuerpo of [{ tipo: "usuarios" }, { tipo: "" }, {}, null]) {
      expect((await pedir(cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect(await prisma.auditLog.count({ where: { action: "WALLET_EXPORT" } })).toBe(0);
  });
});

describe("el CSV de retiradas", () => {
  it("lleva el destino COMPLETO y descifrado: es para cuadrar con el banco", async () => {
    await unaRetirada();
    const csv = await (await pedir({ tipo: "retiradas" })).text();

    expect(csv, "el IBAN no está: así no se concilia nada").toContain(IBAN);
    expect(csv).toContain("la_cobradora");
    expect(csv, "sigue cifrado").not.toContain("v1:");
  });

  it("y el escapado aguanta una coma y una comilla en el nombre", async () => {
    await unaRetirada();
    const csv = await (await pedir({ tipo: "retiradas" })).text();

    // La comilla DUPLICADA es la marca de que se escapó como manda RFC 4180.
    expect(csv).toContain('""la jefa""');
    expect(csv, "se escapó como JSON, no como CSV").not.toContain('\\"');
    // Y la fila sigue teniendo las columnas que dice la cabecera: si la coma hubiera partido el
    // campo, esta fila tendría una de más.
    const lineas = csv.trim().split("\r\n");
    expect(lineas).toHaveLength(2);
    expect(contarCampos(lineas[1]!)).toBe(contarCampos(lineas[0]!));
  });

  it("empieza por el BOM, o Excel destroza los acentos", async () => {
    // SE MIRAN LOS BYTES, no el texto: `Response.text()` se COME el BOM por especificación (el
    // decodificador lo quita), así que un `charCodeAt(0)` sobre el texto dice que no está —y diría
    // lo mismo si de verdad faltara—. Un caso que no puede distinguir los dos estados no vale.
    await unaRetirada();
    const bytes = new Uint8Array(await (await pedir({ tipo: "retiradas" })).arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]], "falta el BOM de UTF-8").toEqual([0xef, 0xbb, 0xbf]);
  });

  it("sin retiradas devuelve la cabecera, no un fichero roto", async () => {
    const csv = await (await pedir({ tipo: "retiradas" })).text();
    expect(csv).toContain("destino");
    expect(csv.trim().split("\r\n")).toHaveLength(1);
  });
});

describe("el CSV de ajustes", () => {
  it("lleva quién, a quién, cuánto y el motivo", async () => {
    await unAjuste("Premio que no entró, del reto de octubre");
    const csv = await (await pedir({ tipo: "ajustes" })).text();

    expect(csv).toContain("la_admin");
    expect(csv).toContain("la_cobradora");
    expect(csv).toContain("25.00");
    expect(csv).toContain("Premio que no entró");
  });

  it("y un motivo con coma no parte la fila", async () => {
    await unAjuste('Devolución, acordada con soporte: dijo "vale"');
    const csv = await (await pedir({ tipo: "ajustes" })).text();
    const lineas = csv.trim().split("\r\n");
    expect(lineas).toHaveLength(2);
    expect(contarCampos(lineas[1]!)).toBe(contarCampos(lineas[0]!));
  });

  it("NO lleva datos de pago: un ajuste no tiene destino", async () => {
    await unaRetirada();
    await unAjuste("sin iban aquí");
    const csv = await (await pedir({ tipo: "ajustes" })).text();
    expect(csv).not.toContain(IBAN);
  });
});

describe("la traza de la exportación", () => {
  it("cada descarga deja su línea, con el tipo y cuántas filas", async () => {
    await unaRetirada();
    await pedir({ tipo: "retiradas" });

    const linea = await prisma.auditLog.findFirstOrThrow({ where: { action: "WALLET_EXPORT" } });
    expect(linea.actorId, "no consta quién exportó").toBe(H.user.userId);
    expect(linea.metadata).toMatchObject({ tipo: "retiradas", filas: 1, truncada: false });
  });

  it("dos descargas, dos líneas: cada salida de datos es un evento", async () => {
    await unaRetirada();
    await pedir({ tipo: "retiradas" });
    await pedir({ tipo: "ajustes" });
    expect(await prisma.auditLog.count({ where: { action: "WALLET_EXPORT" } })).toBe(2);
  });

  it("y los DATOS NO entran en la traza, ni el IBAN ni cifrado", async () => {
    // Un `AuditLog` se lee, se exporta y se copia: un IBAN dentro sería la fuga por la puerta de
    // atrás, justo en la tabla que existe para poder enseñarla.
    await unaRetirada();
    await pedir({ tipo: "retiradas" });
    const linea = await prisma.auditLog.findFirstOrThrow({ where: { action: "WALLET_EXPORT" } });
    const crudo = JSON.stringify(linea);
    expect(crudo).not.toContain(IBAN);
    expect(crudo).not.toContain("la jefa");
    expect(crudo).not.toMatch(/v1:|datosPago/);
  });
});

/**
 * EL RANGO DE FECHAS, que lo elige quien exporta.
 *
 * ┌─ POR QUÉ ESTO NO ES COMODIDAD ──────────────────────────────────────────────────────────────┐
 * │ Antes el CSV bajaba SIEMPRE todo (hasta el tope) y el admin recortaba en la hoja. Eso es     │
 * │ sacar un año de IBANes del servidor para cuadrar un mes: cada fila que sale es una fila que  │
 * │ alguien tiene que custodiar. Y el filtro va EN EL `where`, no recortando después —recortar   │
 * │ después ya ha leído las filas, y aquí leer significa DESCIFRAR—.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("el rango de la exportación", () => {
  /** Una retirada con una fecha concreta: el `createdAt` lo pone la base, así que se reescribe. */
  async function retiradaDeHace(dias: number, id: string): Promise<void> {
    await prisma.withdrawal.create({
      data: {
        id,
        userId: duenyo,
        amountCents: 1000,
        currency: "USD",
        status: "PENDING",
        metodo: "BANK",
        datosPago: cifrarDatoDePago(JSON.stringify({ iban: IBAN, titular: `T-${id}` })),
        pista: "1332",
        idempotencyKey: `k-${id}`,
        createdAt: new Date(Date.now() - dias * 86_400_000),
      },
    });
  }

  it("el preset «último mes» NO incluye una fila de hace dos meses", async () => {
    await retiradaDeHace(3, "w-reciente");
    await retiradaDeHace(62, "w-vieja");

    const csv = await (await pedir({ tipo: "retiradas", preset: "mes" })).text();

    expect(csv).toContain("T-w-reciente");
    expect(csv, "el preset no filtró: se exportó una fila de hace dos meses").not.toContain(
      "T-w-vieja",
    );
  });

  it("y «último año» sí la incluye: el rango es lo que cambia, no el fichero", async () => {
    await retiradaDeHace(3, "w-reciente");
    await retiradaDeHace(62, "w-vieja");

    const csv = await (await pedir({ tipo: "retiradas", preset: "ano" })).text();

    expect(csv).toContain("T-w-reciente");
    expect(csv).toContain("T-w-vieja");
  });

  it("un rango a mano exporta EXACTAMENTE lo que cae dentro, con los dos extremos", async () => {
    // Una fila justo en cada borde: el día `desde` y el día `hasta` entran los dos. Si el `hasta`
    // fuera exclusivo, la del último día se quedaría fuera y nadie lo notaría hasta la factura.
    await retiradaDeHace(10, "w-dentro-1");
    await retiradaDeHace(5, "w-dentro-2");
    await retiradaDeHace(20, "w-fuera-antes");
    await retiradaDeHace(1, "w-fuera-despues");

    const dia = (atras: number): string =>
      new Date(Date.now() - atras * 86_400_000).toISOString().slice(0, 10);

    const csv = await (
      await pedir({ tipo: "retiradas", preset: "custom", desde: dia(10), hasta: dia(5) })
    ).text();

    expect(csv).toContain("T-w-dentro-1");
    expect(csv).toContain("T-w-dentro-2");
    expect(csv).not.toContain("T-w-fuera-antes");
    expect(csv).not.toContain("T-w-fuera-despues");
  });

  it("desde > hasta se RECHAZA, con copy humano y sin tocar nada", async () => {
    await unaRetirada();

    const res = await pedir({
      tipo: "retiradas",
      preset: "custom",
      desde: "2026-03-31",
      hasta: "2026-03-01",
    });

    expect(res.status).toBe(400);
    const cuerpo = (await res.json()) as { error?: { message?: string } };
    expect(cuerpo.error?.message, "el error no dice QUÉ está mal").toMatch(
      /posterior|dale la vuelta/i,
    );
    // NI UNA LÍNEA DE AUDITORÍA: no hubo exportación. Y sobre todo, no se descifró ningún IBAN
    // para descubrir después que el rango estaba al revés.
    expect(await prisma.auditLog.count({ where: { action: "WALLET_EXPORT" } })).toBe(0);
  });

  it("una fecha que no existe también se rechaza (y no se «corrige» sola)", async () => {
    // `new Date("2026-02-31")` no lanza: devuelve el 3 de marzo. Un rango silenciosamente
    // distinto del que se pidió es peor que un error.
    for (const custom of [
      { desde: "2026-02-31", hasta: "2026-03-05" },
      { desde: "ayer", hasta: "2026-03-05" },
      { desde: "2026-03-01" }, // falta `hasta`
    ]) {
      const res = await pedir({ tipo: "retiradas", preset: "custom", ...custom });
      expect(res.status, JSON.stringify(custom)).toBe(400);
    }
    expect(await prisma.auditLog.count({ where: { action: "WALLET_EXPORT" } })).toBe(0);
  });

  it("y la traza guarda el RANGO, no solo cuántas filas salieron", async () => {
    // Sin el rango, dos líneas de 40 filas pueden ser dos meses distintos y la auditoría no sabe
    // cuál se llevó cada uno — que es justo para lo que existe.
    await unaRetirada();
    await pedir({ tipo: "retiradas", preset: "3meses" });

    const linea = await prisma.auditLog.findFirstOrThrow({ where: { action: "WALLET_EXPORT" } });
    const meta = linea.metadata as Record<string, unknown>;
    expect(meta["preset"]).toBe("3meses");
    expect(typeof meta["desde"]).toBe("string");
    expect(typeof meta["hasta"]).toBe("string");
    expect(new Date(meta["desde"] as string).getTime()).toBeLessThan(
      new Date(meta["hasta"] as string).getTime(),
    );
  });

  it("sin preset NO se exporta: el rango no tiene un defecto silencioso de «todo»", async () => {
    // Si faltara y cayera a "todo", la pieza no serviría de nada: el camino que baja el año entero
    // seguiría existiendo, solo que sin decirlo.
    await unaRetirada();
    const res = await exportar(
      new Request("http://test/api/panel/monedero/export", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://test" },
        body: JSON.stringify({ tipo: "retiradas" }),
      }),
      undefined,
    );
    expect(res.status).toBe(400);
    expect(await prisma.auditLog.count({ where: { action: "WALLET_EXPORT" } })).toBe(0);
  });
});

/** Cuenta campos de una línea CSV respetando las comillas. Si no, la coma de dentro cuenta. */
function contarCampos(linea: string): number {
  let campos = 1;
  let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') dentro = !dentro;
    else if (c === "," && !dentro) campos += 1;
  }
  return campos;
}
