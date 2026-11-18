/**
 * EL COBRO ES SOLO AL BANCO (Fase 11 · PC). Test ESTRUCTURAL: fija una decisión de producto que se
 * deshace en silencio con una línea.
 *
 * La cripto se retiró entera —catálogo, redes, formulario, aviso, panel, CSV y las columnas `red`—
 * con cero filas en producción. Lo que fija:
 *
 *  - NINGÚN TEXTO VISIBLE de `src/` nombra la cripto (cripto, USDT, USDC, TRC, ERC, "CRYPTO"). Se
 *    mira el CÓDIGO, sin comentarios: los comentarios que cuentan por qué se fue pueden quedarse.
 *  - EL CATÁLOGO es `["BANK"]` y `RED_INCORRECTA` no es un motivo de rechazo.
 *  - LA API rechaza `metodo: "CRYPTO"` con una frase que dice qué SÍ se puede, por las dos rutas
 *    que aceptan un destino (alta y sustituir), y no guarda nada.
 *  - LA MIGRACIÓN comprueba antes de borrar: el bloque que se niega va antes de cualquier `DROP`.
 *    Que de verdad falla sin borrar nada se probó contra una BD con una fila `CRYPTO` (ver la
 *    entrega de la PC); aquí se fija que la comprobación sigue ahí y en su sitio.
 *
 * Para romperlo a propósito: escribir "Cripto" en un `<option>` (rojo, nombra el fichero), volver a
 * meter `"RED_INCORRECTA"` en `VALORES_MOTIVO_RECHAZO` (rojo), cambiar las rutas a
 * `CuerpoMetodoPagoSchema.safeParse` a secas (rojo: el mensaje vuelve a ser el genérico), o mover
 * el `SIGNAL` de la migración debajo de un `DROP` (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { falso } from "./helpers/valores-falsos";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FRASE_RECHAZO, VALORES_METODO_RETIRADA, VALORES_MOTIVO_RECHAZO } from "@/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";

import { ficherosDeSrc, RAIZ, rel, sinComentarios } from "./helpers/grafo-imports";

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  user: {
    userId: "",
    sessionId: "s1",
    role: "USER" as const,
    emailVerified: new Date() as Date | null,
  },
}));

vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { PAGOS_SECRET: "c".repeat(40), AUTH_SECRET: falso("auth-secret-sin-cripto") },
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

import { POST as alta } from "../src/app/api/metodos-pago/route";
import { PUT as sustituir } from "../src/app/api/metodos-pago/[id]/route";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

/**
 * Lo que delata un texto de cripto en el CÓDIGO. `crypto` en minúscula NO está: es la API de
 * aleatoriedad (`node:crypto`, `crypto.randomUUID()`), no el producto; lo que sí está es el VALOR
 * `"CRYPTO"` entre comillas, que es el método del catálogo viejo.
 */
const DELATORES: [string, RegExp][] = [
  // Con límite de palabra al PRINCIPIO: «suscriptores» y «getOwnPropertyDescriptor» llevan «cripto»
  // dentro y no hablan de dinero. Así sigue cazando «Cripto», «cripto» y «criptomoneda».
  ["cripto", /\bcripto/i],
  ["USDT/USDC", /\bUSD[TC]\b/i],
  ["TRC/ERC", /\b(?:TRC|ERC)(?:-?20)?\b/i],
  ['"CRYPTO"', /["'`]CRYPTO["'`]/],
];

describe("ningún texto de src/ nombra la cripto", () => {
  const ficheros = ficherosDeSrc();

  it("en el código (sin comentarios), ni una mención", () => {
    const hallazgos: string[] = [];
    for (const f of ficheros) {
      const codigo = sinComentarios(readFileSync(f, "utf8"));
      for (const [nombre, re] of DELATORES) {
        const linea = codigo.split("\n").find((l) => re.test(l));
        if (linea) hallazgos.push(`${rel(f)} (${nombre}): ${linea.trim().slice(0, 120)}`);
      }
    }
    expect(hallazgos, `textos de cripto en src/:\n${hallazgos.join("\n")}`).toEqual([]);
  });

  it("control: el detector ve lo que tiene que ver, y no confunde la API de aleatoriedad", () => {
    // Sin esto, un detector roto (una regex que no casa nada) daría el verde de arriba gratis.
    expect(ficheros.length, "no ha leído src/").toBeGreaterThan(300);
    const caza = (t: string) => DELATORES.some(([, re]) => re.test(sinComentarios(t)));
    expect(caza(`<option>Cripto · TRON</option>`)).toBe(true);
    expect(caza(`"Solo enviamos USDT"`)).toBe(true);
    expect(caza(`label: "Red ERC-20"`)).toBe(true);
    expect(caza(`{ metodo: "CRYPTO" }`)).toBe(true);
    expect(caza(`const x = crypto.randomUUID();\nimport { a } from "node:crypto";`)).toBe(false);
    expect(caza(`/** la cripto se retiró */\n// sin cripto\nconst a = 1;`)).toBe(false);
    expect(caza(`"participar los suscriptores"; getOwnPropertyDescriptor()`)).toBe(false);
  });
});

describe("el aviso del CSV nombra lo que lleva el fichero, y nada más", () => {
  it("«IBAN y titular», no «direcciones»", () => {
    // Las capturas de la PC lo cazaron: el aviso seguía diciendo «(IBAN, direcciones)» —las de la
    // cripto— y ningún detector lo veía, porque «direcciones» es una palabra corriente. Un aviso de
    // datos sensibles que nombra algo que el fichero ya no lleva enseña a no leerlo.
    const codigo = sinComentarios(
      readFileSync(path.join(RAIZ, "src/app/panel/monedero/exportar-csv.tsx"), "utf8"),
    );
    expect(codigo).toContain("datos de pago en claro (IBAN y titular)");
    expect(codigo).not.toMatch(/direcci/i);
  });
});

describe("el catálogo", () => {
  it("el único método de cobro es BANK", () => {
    expect([...VALORES_METODO_RETIRADA]).toEqual(["BANK"]);
  });

  it("RED_INCORRECTA no es un motivo de rechazo, ni tiene frase", () => {
    expect(VALORES_MOTIVO_RECHAZO as readonly string[]).not.toContain("RED_INCORRECTA");
    expect(Object.keys(FRASE_RECHAZO)).not.toContain("RED_INCORRECTA");
  });
});

describe("la API rechaza CRYPTO con una frase que se puede enseñar", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
    H.prisma = prisma;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    H.user.userId = await crearUsuario(prisma, { username: "quiere_cripto" });
  });

  const peticion = (metodoHttp: string, url: string, cuerpo: unknown) =>
    new Request(url, {
      method: metodoHttp,
      headers: { "content-type": "application/json", origin: "http://test" },
      body: JSON.stringify(cuerpo),
    });
  const CRIPTO = {
    metodo: "CRYPTO",
    direccion: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
    red: "TRC20",
  };

  async function esperarRechazoHumano(res: Response) {
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("METODO_DESCONOCIDO");
    // Una frase que dice qué SÍ se puede, no el genérico de validación que no dice qué cambiar.
    expect(json.error.message).toMatch(/cuenta bancaria/i);
    expect(json.error.message).not.toMatch(/no hemos podido procesar/i);
    expect(await prisma.paymentMethod.count(), "se guardó algo").toBe(0);
  }

  it("POST /api/metodos-pago", async () => {
    await esperarRechazoHumano(
      await alta(peticion("POST", "http://test/api/metodos-pago", CRIPTO), undefined),
    );
  });

  it("PUT /api/metodos-pago/[id], que también acepta un destino", async () => {
    const res = await sustituir(peticion("PUT", "http://test/api/metodos-pago/x", CRIPTO), {
      params: Promise.resolve({ id: "x" }),
    });
    await esperarRechazoHumano(res);
  });

  it("control: un cuerpo de banco roto sigue siendo el genérico, y uno bueno entra", async () => {
    // Si TODO saliera como METODO_DESCONOCIDO, el caso de arriba pasaría sin distinguir nada.
    const roto = await alta(
      peticion("POST", "http://test/api/metodos-pago", { metodo: "BANK", iban: "x" }),
      undefined,
    );
    expect(roto.status).toBe(400);
    expect(((await roto.json()) as { error: { code: string } }).error.code).toBe("VALIDATION");

    const bueno = await alta(
      peticion("POST", "http://test/api/metodos-pago", {
        metodo: "BANK",
        iban: "ES9121000418450200051332",
        titular: "Marta Ruiz",
      }),
      undefined,
    );
    expect(bueno.status).toBe(200);
    expect(await prisma.paymentMethod.count()).toBe(1);
  });
});

describe("la migración comprueba antes de borrar", () => {
  const sql = readFileSync(
    path.join(RAIZ, "prisma/migrations/20261118120000_quitar_red_cripto/migration.sql"),
    "utf8",
  );
  const codigo = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  it("se niega con SIGNAL si queda una fila que no es BANK o con red, en las dos tablas", () => {
    expect(codigo).toMatch(/BEGIN NOT ATOMIC/);
    expect(codigo).toMatch(/FROM `PaymentMethod` WHERE `metodo` <> 'BANK' OR `red` IS NOT NULL/);
    expect(codigo).toMatch(/FROM `Withdrawal` WHERE `metodo` <> 'BANK' OR `red` IS NOT NULL/);
    expect(codigo).toMatch(/SIGNAL SQLSTATE '45000'/);
  });

  it("y la comprobación va ANTES de cualquier DROP: un ALTER en MariaDB confirma solo", () => {
    const signal = codigo.indexOf("SIGNAL");
    const drops = [...codigo.matchAll(/DROP COLUMN/g)].map((m) => m.index!);
    expect(drops, "no hay DROP que vigilar").toHaveLength(2);
    expect(signal).toBeGreaterThan(-1);
    for (const d of drops) expect(signal, "hay un DROP antes de la comprobación").toBeLessThan(d);
  });
});
