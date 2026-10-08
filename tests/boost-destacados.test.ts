/**
 * LOS PERFILES DESTACADOS DE LA PORTADA — reales, en su orden, y sin rellenos.
 *
 * Esta fila llevaba cinco usuarios INVENTADOS en producción (`PERFILES_BOOST`). Lo que se fija aquí
 * es lo que la hace verdad:
 *
 *  - EL ESTADO SE CALCULA: vigente es `expiresAt > ahora`, no una columna ni un job. Una expirada
 *    desaparece sola; una que empieza, entra sola.
 *  - EL ORDEN ES `startsAt` DESCENDENTE: quien acaba de activar entra ARRIBA. Es lo que hace que
 *    pagar ahora se note ahora.
 *  - CABEN 5: con 7 vigentes salen las 5 más recientes. El resto no se pierde, pero no cabe aquí.
 *  - VACÍO HONESTO: sin nadie destacado, la lista está vacía. Rellenarla era el fallo anterior.
 *  - UNA CUENTA SUSPENDIDA O BORRADA NO SE PROMOCIONA, y su hueco NO se desperdicia: el filtro va
 *    en la consulta, así que el `LIMIT` cuenta solo perfiles que de verdad se pueden pintar.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BOOST_DESTACADOS_PORTADA, BOOST_DURACION_MIN } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { destacadosVigentes } from "../src/server/services/boost-destacados";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

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

const AHORA = new Date("2026-06-15T12:00:00.000Z");
const MIN = 60_000;

/** Una aparición que empezó hace `haceMin` minutos y dura lo que dura un Boost. */
async function destacar(
  userId: string,
  haceMin: number,
  duracionMin = BOOST_DURACION_MIN,
): Promise<string> {
  const startsAt = new Date(AHORA.getTime() - haceMin * MIN);
  const a = await prisma.boostActivation.create({
    data: { userId, startsAt, expiresAt: new Date(startsAt.getTime() + duracionMin * MIN) },
  });
  return a.id;
}

describe("quién sale y quién no", () => {
  it("sin apariciones, la lista está VACÍA (no se rellena con nadie)", async () => {
    await crearUsuario(prisma, { username: "nadie_destaca" });
    expect(await destacadosVigentes(prisma, { ahora: AHORA })).toEqual([]);
  });

  it("una aparición VIGENTE sale, con los datos reales de su dueño", async () => {
    const id = await crearUsuario(prisma, {
      username: "la_destacada",
      displayName: "La Destacada",
      pointsBalance: 540,
    });
    await destacar(id, 10);

    const [p] = await destacadosVigentes(prisma, { ahora: AHORA });
    expect(p).toMatchObject({
      userId: id,
      username: "la_destacada",
      displayName: "La Destacada",
      puntos: 540,
    });
    expect(p!.expiraEnMs).toBeGreaterThan(AHORA.getTime());
  });

  it("una EXPIRADA no sale, ni un minuto después de expirar", async () => {
    const id = await crearUsuario(prisma, { username: "la_expirada" });
    await destacar(id, BOOST_DURACION_MIN + 1);
    expect(await destacadosVigentes(prisma, { ahora: AHORA })).toEqual([]);
  });

  it("y en el borde EXACTO tampoco: vigente es `expiresAt > ahora`, no `>=`", async () => {
    // Una aparición que expira justo en este instante ya se ha terminado. El borde se fija para que
    // nadie lo cambie a `>=` "por si acaso" y deje a alguien un milisegundo de más.
    const id = await crearUsuario(prisma, { username: "la_del_borde" });
    await destacar(id, BOOST_DURACION_MIN);
    expect(await destacadosVigentes(prisma, { ahora: AHORA })).toEqual([]);
  });
});

describe("el orden: el último en activar, arriba", () => {
  it("de más reciente a más antigua", async () => {
    const a = await crearUsuario(prisma, { username: "primera" });
    const b = await crearUsuario(prisma, { username: "segunda" });
    const c = await crearUsuario(prisma, { username: "tercera" });
    await destacar(a, 30);
    await destacar(b, 20);
    await destacar(c, 5);

    const nombres = (await destacadosVigentes(prisma, { ahora: AHORA })).map((p) => p.username);
    expect(nombres).toEqual(["tercera", "segunda", "primera"]);
  });

  it("quien acaba de activar EMPUJA al resto hacia abajo", async () => {
    const viejos = [];
    for (const n of ["uno", "dos", "tres"]) {
      const id = await crearUsuario(prisma, { username: n });
      await destacar(id, 30);
      viejos.push(n);
    }
    const nuevo = await crearUsuario(prisma, { username: "recien" });
    await destacar(nuevo, 0);

    const nombres = (await destacadosVigentes(prisma, { ahora: AHORA })).map((p) => p.username);
    expect(nombres[0]).toBe("recien");
    expect(nombres).toHaveLength(4);
  });
});

describe("caben cinco", () => {
  it("con 7 vigentes salen las 5 MÁS RECIENTES", async () => {
    // Las dos que no caben no se pierden: se verán en la sección completa (Pieza 4).
    for (let i = 7; i >= 1; i -= 1) {
      const id = await crearUsuario(prisma, { username: `u${i}` });
      await destacar(id, i); // u1 es la más reciente
    }

    const nombres = (await destacadosVigentes(prisma, { ahora: AHORA })).map((p) => p.username);
    expect(nombres).toHaveLength(BOOST_DESTACADOS_PORTADA);
    expect(nombres).toEqual(["u1", "u2", "u3", "u4", "u5"]);
  });

  it("el límite se puede pedir mayor (lo hará la sección completa)", async () => {
    for (let i = 7; i >= 1; i -= 1) {
      const id = await crearUsuario(prisma, { username: `u${i}` });
      await destacar(id, i);
    }
    expect(await destacadosVigentes(prisma, { ahora: AHORA, limite: 10 })).toHaveLength(7);
  });

  it("y un límite absurdo se acota, no revienta", async () => {
    const id = await crearUsuario(prisma, { username: "sola" });
    await destacar(id, 1);
    expect(await destacadosVigentes(prisma, { ahora: AHORA, limite: 0 })).toHaveLength(1);
    expect(await destacadosVigentes(prisma, { ahora: AHORA, limite: 9999 })).toHaveLength(1);
  });
});

describe("una cuenta que no se puede promocionar no ocupa sitio", () => {
  it("un usuario SUSPENDIDO no sale en la portada", async () => {
    const malo = await crearUsuario(prisma, { username: "el_suspendido" });
    await prisma.user.update({ where: { id: malo }, data: { bannedAt: new Date() } });
    await destacar(malo, 1);

    expect(await destacadosVigentes(prisma, { ahora: AHORA })).toEqual([]);
  });

  it("ni uno BORRADO", async () => {
    const ido = await crearUsuario(prisma, { username: "el_borrado" });
    await prisma.user.update({ where: { id: ido }, data: { deletedAt: new Date() } });
    await destacar(ido, 1);

    expect(await destacadosVigentes(prisma, { ahora: AHORA })).toEqual([]);
  });

  it("y SU HUECO NO SE DESPERDICIA: con un suspendido arriba siguen saliendo 5 válidos", async () => {
    // Es la razón de que el filtro vaya en la CONSULTA. Filtrando después, el suspendido habría
    // gastado una de las cinco plazas del `LIMIT` y la fila saldría con cuatro teniendo seis
    // destacados válidos esperando.
    const malo = await crearUsuario(prisma, { username: "el_suspendido" });
    await prisma.user.update({ where: { id: malo }, data: { bannedAt: new Date() } });
    await destacar(malo, 1); // el más reciente de todos

    for (let i = 2; i <= 7; i += 1) {
      const id = await crearUsuario(prisma, { username: `v${i}` });
      await destacar(id, i);
    }

    const nombres = (await destacadosVigentes(prisma, { ahora: AHORA })).map((p) => p.username);
    expect(nombres).toHaveLength(BOOST_DESTACADOS_PORTADA);
    expect(nombres).not.toContain("el_suspendido");
    expect(nombres).toEqual(["v2", "v3", "v4", "v5", "v6"]);
  });
});

/**
 * UNA PERSONA, UNA PLAZA.
 *
 * Reactivar estando ya destacado está permitido y sirve para volver a encabezar. Sin deduplicar, esa
 * segunda aparición vigente salía como una SEGUNDA tarjeta: la misma persona ocupando dos de las
 * cinco plazas, y hasta tres con el límite diario. No es desperdicio del que paga, es desplazar a
 * los demás de la vitrina.
 */
describe("la misma persona con dos apariciones vigentes", () => {
  it("sale UNA vez, con su aparición más reciente", async () => {
    const id = await crearUsuario(prisma, { username: "la_insistente" });
    const vieja = await destacar(id, 40);
    const nueva = await destacar(id, 2);

    const ps = await destacadosVigentes(prisma, { ahora: AHORA });
    expect(ps, "sale dos veces: la vitrina está duplicando a la misma persona").toHaveLength(1);
    expect(ps[0]!.activacionId, "sale con la aparición vieja, no con la que le da el sitio").toBe(
      nueva,
    );
    expect(ps[0]!.activacionId).not.toBe(vieja);
  });

  it("y reactivar la vuelve a poner ARRIBA, que es para lo que sirve", async () => {
    const otra = await crearUsuario(prisma, { username: "la_otra" });
    const insiste = await crearUsuario(prisma, { username: "la_insistente" });
    await destacar(insiste, 40); // destacó hace rato
    await destacar(otra, 10); // y la adelantaron

    expect((await destacadosVigentes(prisma, { ahora: AHORA })).map((p) => p.username)).toEqual([
      "la_otra",
      "la_insistente",
    ]);

    await destacar(insiste, 1); // reactiva: vuelve a encabezar, sin ocupar dos plazas
    const ps = await destacadosVigentes(prisma, { ahora: AHORA });
    expect(ps.map((p) => p.username)).toEqual(["la_insistente", "la_otra"]);
  });

  it("el LIMIT cuenta PERSONAS, no filas: con 5 usuarios y uno repetido se ven 5 distintos", async () => {
    // Es la razón de que el dedup vaya DENTRO de la consulta. Filtrando después, el repetido se
    // habría llevado dos de las cinco plazas del `LIMIT` y la vitrina saldría con cuatro.
    const dobla = await crearUsuario(prisma, { username: "u1" });
    await destacar(dobla, 1);
    await destacar(dobla, 2);
    for (let i = 2; i <= 5; i += 1) {
      const id = await crearUsuario(prisma, { username: `u${i}` });
      await destacar(id, i + 2);
    }

    const ps = await destacadosVigentes(prisma, { ahora: AHORA, limite: 5 });
    expect(ps).toHaveLength(5);
    expect(new Set(ps.map((p) => p.userId)).size, "hay un usuario repetido").toBe(5);
    expect([...ps.map((p) => p.username)].sort()).toEqual(["u1", "u2", "u3", "u4", "u5"]);
  });

  it("una aparición EXPIRADA no lo saca de la vitrina ni lo duplica", async () => {
    const id = await crearUsuario(prisma, { username: "la_veterana" });
    await destacar(id, BOOST_DURACION_MIN + 30); // ya terminada
    const viva = await destacar(id, 5);

    const ps = await destacadosVigentes(prisma, { ahora: AHORA });
    expect(ps).toHaveLength(1);
    expect(ps[0]!.activacionId).toBe(viva);
  });

  it("y `expiraEnMs` dice cuándo deja de estar destacado DE VERDAD", async () => {
    // Encadenar dos boosts alarga la presencia. El campo es "hasta cuándo se le ve", así que es el
    // final más lejano de sus apariciones vigentes, no el de la fila que se eligió para ordenar.
    const id = await crearUsuario(prisma, { username: "la_encadenada" });
    await destacar(id, 50, BOOST_DURACION_MIN * 3); // empezó antes y dura mucho más
    await destacar(id, 1);

    const [p] = await destacadosVigentes(prisma, { ahora: AHORA });
    const finLargo = AHORA.getTime() - 50 * MIN + BOOST_DURACION_MIN * 3 * MIN;
    expect(p!.expiraEnMs).toBe(finLargo);
  });
});
