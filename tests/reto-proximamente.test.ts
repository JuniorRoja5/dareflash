/**
 * UN RETO QUE AÚN NO HA ABIERTO NO ESTÁ CERRADO.
 *
 * ┌─ EL FALLO ─────────────────────────────────────────────────────────────────────────────────┐
 * │ El lado público solo sabía "abierto" o "no abierto" (`retoEstaAbierto`), así que un reto con │
 * │ la apertura por delante caía en el mismo saco que uno vencido. Consecuencias, las dos        │
 * │ FALSAS: salía mezclado entre los "Activos" —ordenado por su cierre, como si se pudiera       │
 * │ entrar— y su detalle decía "Reto cerrado" contando atrás hacia el cierre. Datos incorrectos  │
 * │ en la pantalla que existe para que la gente participe.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Aquí va la parte PURA (la fase y a qué instante se cuenta) y la de CONSULTA (qué lista trae cada
 * reto). El copy y las chapas, en `tests/render/reto-proximamente`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { faseDelReto, instanteDeCuenta, retoEstaAbierto } from "../src/lib/reto-ventana";
import { listarRetosProximos, listarRetosPublicos } from "../src/server/services/retos-publico";
import { generarPublicCode } from "../src/server/services/reto-codigo";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const AHORA = new Date("2026-08-20T12:00:00Z");
const HORA = 3_600_000;
const DIA = 86_400_000;

/** Los tres casos, siempre PUBLISHED: lo que cambia es la ventana. */
const PROXIMO = {
  status: "PUBLISHED",
  startsAt: AHORA.getTime() + DIA,
  deadline: AHORA.getTime() + 7 * DIA,
};
const ABIERTO = {
  status: "PUBLISHED",
  startsAt: AHORA.getTime() - DIA,
  deadline: AHORA.getTime() + DIA,
};
const CERRADO = {
  status: "PUBLISHED",
  startsAt: AHORA.getTime() - 7 * DIA,
  deadline: AHORA.getTime() - DIA,
};

describe("la fase pública son TRES, no dos", () => {
  it("próximo, abierto y cerrado se distinguen", () => {
    expect(faseDelReto(PROXIMO, AHORA)).toBe("proximamente");
    expect(faseDelReto(ABIERTO, AHORA)).toBe("abierto");
    expect(faseDelReto(CERRADO, AHORA)).toBe("cerrado");
  });

  it("«abierto» es EXACTAMENTE lo que dice `retoEstaAbierto`, no una regla paralela", () => {
    // Si se calculara aparte, la UI volvería a poder prometer lo que la API rechaza — que es el
    // motivo por el que `retoEstaAbierto` existe. Se comprueba en los bordes, que es donde dos
    // reglas "iguales" se separan.
    const bordes = [
      { ...PROXIMO, startsAt: AHORA.getTime() }, // justo al abrir: ya cuenta como abierto
      { ...ABIERTO, deadline: AHORA.getTime() }, // justo al cerrar: ya NO
      PROXIMO,
      ABIERTO,
      CERRADO,
    ];
    for (const r of bordes) {
      expect(faseDelReto(r, AHORA) === "abierto", JSON.stringify(r)).toBe(
        retoEstaAbierto(r, AHORA),
      );
    }
  });

  it("un reto que NO está publicado nunca es «próximamente», aunque su apertura sea futura", () => {
    // Un borrador no se enseña en público: decir "próximamente" de algo que el admin no ha
    // publicado sería prometer un reto que puede no existir nunca.
    expect(faseDelReto({ ...PROXIMO, status: "DRAFT" }, AHORA)).toBe("cerrado");
    expect(faseDelReto({ ...PROXIMO, status: "CLOSED" }, AHORA)).toBe("cerrado");
  });

  it("y una fila incoherente (abre en el futuro, cerró en el pasado) se lee como cerrada", () => {
    // El schema no deja crearla; si apareciera por un arreglo a mano, en la duda no se promete.
    const imposible = {
      status: "PUBLISHED",
      startsAt: AHORA.getTime() + DIA,
      deadline: AHORA.getTime() - DIA,
    };
    expect(faseDelReto(imposible, AHORA)).toBe("cerrado");
  });
});

describe("a qué instante cuenta el marcador", () => {
  it("a la APERTURA mientras no ha empezado, y al CIERRE una vez abierto", () => {
    expect(instanteDeCuenta(PROXIMO, AHORA)).toEqual({
      fase: "proximamente",
      objetivoMs: PROXIMO.startsAt,
    });
    expect(instanteDeCuenta(ABIERTO, AHORA)).toEqual({
      fase: "abierto",
      objetivoMs: ABIERTO.deadline,
    });
  });

  it("y cerrado no cuenta nada: no queda plazo que enseñar", () => {
    expect(instanteDeCuenta(CERRADO, AHORA)).toEqual({ fase: "cerrado", objetivoMs: null });
  });

  it("el objetivo de un próximo NO es su cierre (que era justo el bug)", () => {
    const { objetivoMs } = instanteDeCuenta(PROXIMO, AHORA);
    expect(objetivoMs).not.toBe(PROXIMO.deadline);
  });
});

describe("las listas de /retos no se mezclan", () => {
  let prisma: PrismaClient;
  let admin: string;
  let n = 0;

  beforeAll(() => {
    prisma = createTestPrisma();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    n = 0;
    admin = await crearUsuario(prisma, { username: "admin_prox" });
  });

  async function crear(titulo: string, startsAt: Date, deadline: Date, status = "PUBLISHED") {
    n += 1;
    await prisma.challenge.create({
      data: {
        title: titulo,
        slug: `reto-${n}`,
        publicCode: generarPublicCode(),
        category: "fitness",
        status,
        prizeCurrency: "USD",
        prizeAmountCents: 1000,
        startsAt,
        deadline,
        createdById: admin,
      },
    });
  }

  it("un reto que aún no ha abierto NO sale en Activos", async () => {
    await crear("Abierto", new Date(AHORA.getTime() - DIA), new Date(AHORA.getTime() + DIA));
    await crear("Futuro", new Date(AHORA.getTime() + DIA), new Date(AHORA.getTime() + 7 * DIA));

    const activos = await listarRetosPublicos(prisma, AHORA);

    expect(activos.map((r) => r.titulo)).toEqual(["Abierto"]);
  });

  it("sale en Próximamente, y los abiertos NO", async () => {
    await crear("Abierto", new Date(AHORA.getTime() - DIA), new Date(AHORA.getTime() + DIA));
    await crear("Futuro", new Date(AHORA.getTime() + DIA), new Date(AHORA.getTime() + 7 * DIA));

    const proximos = await listarRetosProximos(prisma, AHORA);

    expect(proximos.map((r) => r.titulo)).toEqual(["Futuro"]);
  });

  it("Próximamente ordena por APERTURA: el que abre antes, primero", async () => {
    // Ordenar por cierre aquí no diría nada: la única pregunta de esta lista es cuándo empieza.
    await crear(
      "Tercero",
      new Date(AHORA.getTime() + 3 * DIA),
      new Date(AHORA.getTime() + 4 * DIA),
    );
    await crear("Primero", new Date(AHORA.getTime() + HORA), new Date(AHORA.getTime() + 30 * DIA));
    await crear("Segundo", new Date(AHORA.getTime() + DIA), new Date(AHORA.getTime() + 2 * DIA));

    const proximos = await listarRetosProximos(prisma, AHORA);

    expect(proximos.map((r) => r.titulo)).toEqual(["Primero", "Segundo", "Tercero"]);
  });

  it("un BORRADOR no sale en ninguna de las dos", async () => {
    await crear(
      "Borrador",
      new Date(AHORA.getTime() + DIA),
      new Date(AHORA.getTime() + 7 * DIA),
      "DRAFT",
    );

    expect(await listarRetosProximos(prisma, AHORA)).toEqual([]);
    expect(await listarRetosPublicos(prisma, AHORA)).toEqual([]);
  });

  it("y ningún reto sale en las DOS a la vez", async () => {
    // La propiedad de verdad: las dos ventanas son complementarias. Un reto en las dos significaría
    // que la pantalla dice a la vez que se puede entrar y que todavía no.
    for (let i = 0; i < 6; i += 1) {
      await crear(
        `R${i}`,
        new Date(AHORA.getTime() + (i - 3) * DIA),
        new Date(AHORA.getTime() + (i + 2) * DIA),
      );
    }

    const activos = (await listarRetosPublicos(prisma, AHORA)).map((r) => r.publicCode);
    const proximos = (await listarRetosProximos(prisma, AHORA)).map((r) => r.publicCode);

    expect(activos.length + proximos.length).toBe(6);
    expect(activos.filter((c) => proximos.includes(c))).toEqual([]);
  });

  it("la tarjeta recibe la APERTURA, o no podría saber en qué fase está", async () => {
    await crear("Futuro", new Date(AHORA.getTime() + DIA), new Date(AHORA.getTime() + 7 * DIA));

    const [reto] = await listarRetosProximos(prisma, AHORA);

    expect(reto?.startsAtMs).toBe(AHORA.getTime() + DIA);
    expect(
      faseDelReto(
        { status: "PUBLISHED", startsAt: reto!.startsAtMs, deadline: reto!.deadlineMs },
        AHORA,
      ),
    ).toBe("proximamente");
  });
});
