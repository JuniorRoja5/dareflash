/**
 * REFERIDOS — contra la BD, con dientes.
 *
 * Lo que se fija:
 *  - EL PREMIO SE PAGA A LA VERIFICACIÓN, no al registro: sin correo verificado no hay un solo punto.
 *    Es lo que impide fabricar puntos con direcciones desechables;
 *  - COBRAN LOS DOS, una sola vez, y reverificar no duplica (lo garantiza la clave de idempotencia
 *    derivada del INVITADO, no un `if`);
 *  - EL REFERENTE ES INMUTABLE: se fija en el INSERT del alta y NO existe ninguna otra escritura de
 *    `referredById` en todo el código — no es una regla que alguien deba respetar, es que no hay
 *    puerta. Y auto-referirse es imposible: al crear, el invitado todavía no existe;
 *  - un enlace roto, inexistente o de una cuenta suspendida NO impide registrarse;
 *  - el historial dice quién invitó a quién en humano, nunca un id.
 *
 * Para romperlo: pagar en `registerUser` en vez de en la verificación (rojo en "sin verificar");
 * quitar la clave de idempotencia (rojo en "reverificar"); dejar que `referentePorCodigo` acepte
 * suspendidos (rojo); escribir `referredById` en un update (rojo en el estructural).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POINTS, RAZON_INVITO_AMIGO, RAZON_REGISTRO_CON_REFERIDO } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { esCodigoReferidoValido, generarCodigoReferido } from "../src/server/auth/codigo-referido";
import { registerUser } from "../src/server/auth/registration";
import { historialPuntos } from "../src/server/services/dareup-admin";
import {
  createEmailVerification,
  confirmEmailVerification,
} from "../src/server/services/email-verification";
import {
  enlaceReferido,
  premiarReferido,
  referentePorCodigo,
} from "../src/server/services/referidos";

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

const APP = "https://dareflash.test";
const CLAVE = "Contrasena-larga-y-buena-9";

/** Registra por la vía real y devuelve la fila creada. */
async function registrar(email: string, refCode?: string | null) {
  await registerUser(prisma, {
    email,
    password: CLAVE,
    birthDate: new Date("1995-05-05"),
    appUrl: APP,
    refCode,
  });
  return prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, referredById: true, referralCode: true, emailVerified: true },
  });
}

/** Verifica el correo por la vía real (el token de verdad, consumido una sola vez). */
async function verificar(email: string) {
  const { rawToken } = await createEmailVerification(prisma, { email });
  return confirmEmailVerification(prisma, { rawToken });
}

const puntos = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { pointsBalance: true } }))
    .pointsBalance;
const movimientos = (id: string) => prisma.pointsLedger.findMany({ where: { userId: id } });

describe("el código y el enlace", () => {
  it("cada alta recibe un código con el formato canónico, y son distintos", async () => {
    const a = await registrar("a@test.com");
    const b = await registrar("b@test.com");

    expect(esCodigoReferidoValido(a.referralCode)).toBe(true);
    expect(esCodigoReferidoValido(b.referralCode)).toBe(true);
    expect(a.referralCode).not.toBe(b.referralCode);
  });

  it("el enlace se arma desde appUrl y lleva al registro", () => {
    expect(enlaceReferido(APP, "abcdefghijkm")).toBe(`${APP}/entrar?ref=abcdefghijkm`);
  });

  it("un código de basura ni siquiera se consulta, y no resuelve a nadie", async () => {
    const basura = ["", "corto", "CONMAYUSCULAS", "a".repeat(200), "'; DROP TABLE", null, 7];
    for (const malo of basura) {
      // Que no resuelva a nadie no basta como diente: un código inexistente TAMPOCO resuelve, así
      // que la consulta sobraría y el test seguiría verde. Lo que se fija es que se DESCARTE POR LA
      // FORMA, antes de tocar la base. Lo destapó romper `esCodigoReferidoValido`.
      expect(esCodigoReferidoValido(malo), String(malo)).toBe(false);
      expect(await referentePorCodigo(prisma, malo), String(malo)).toBeNull();
    }
    // Y lo que sí tiene forma, se acepta como candidato (aunque luego no exista).
    expect(esCodigoReferidoValido(generarCodigoReferido())).toBe(true);
  });
});

describe("el referente se fija UNA vez, al registrarse", () => {
  it("con un enlace válido queda apuntado", async () => {
    const padrino = await registrar("padrino@test.com");
    const ahijado = await registrar("ahijado@test.com", padrino.referralCode);

    expect(ahijado.referredById).toBe(padrino.id);
  });

  it("nadie puede ser su propio referente", async () => {
    const solo = await registrar("solo@test.com");
    // Ni siquiera usando su PROPIO código: al crear la cuenta, su id todavía no existe, así que el
    // referente solo puede ser otra persona. La segunda alta con ese código es OTRA cuenta.
    const otra = await registrar("otra@test.com", solo.referralCode);

    expect(solo.referredById).toBeNull();
    expect(otra.referredById).toBe(solo.id);
    expect(otra.referredById).not.toBe(otra.id);
  });

  it("un enlace roto, inexistente o suspendido NO impide registrarse: solo se pierde la invitación", async () => {
    const baneado = await registrar("baneado@test.com");
    await prisma.user.update({ where: { id: baneado.id }, data: { bannedAt: new Date() } });
    const borrado = await registrar("borrado@test.com");
    await prisma.user.update({ where: { id: borrado.id }, data: { deletedAt: new Date() } });

    for (const [email, code] of [
      ["x1@test.com", "basura"],
      ["x2@test.com", generarCodigoReferido()], // con forma válida pero inexistente
      ["x3@test.com", baneado.referralCode],
      ["x4@test.com", borrado.referralCode],
    ] as const) {
      const u = await registrar(email, code);
      expect(u.referredById, email).toBeNull();
    }
  });

  it("ningún código del proyecto ESCRIBE `referredById` fuera del alta", () => {
    // La inmutabilidad no se defiende rechazando un segundo cambio: se defiende no teniendo por
    // dónde hacerlo. Si alguien añadiera un `update` con este campo, aquí se entera.
    const raiz = join(process.cwd(), "src");
    const fuentes: string[] = [];
    const recorrer = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) {
          if (e !== "generated") recorrer(p);
        } else if (e.endsWith(".ts") || e.endsWith(".tsx")) fuentes.push(p);
      }
    };
    recorrer(raiz);

    const escriben = fuentes.filter((p) => {
      const codigo = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        // Un `select: { referredById: true }` es una LECTURA, y `x.referredById` también. Lo que se
        // busca son ESCRITURAS, así que las dos formas de leer se quitan antes de mirar. Sin esto el
        // test señalaba a `referidos.ts`, que solo lo consulta.
        .replace(/referredById\s*:\s*true/g, "")
        .replace(/\.referredById\b/g, "");
      return /\breferredById\b/.test(codigo);
    });
    // Solo el alta. Cualquier otro fichero que lo escriba es una puerta nueva.
    expect(escriben.map((p) => p.split(/[\\/]/).slice(-1)[0])).toEqual(["registration.ts"]);
  });
});

describe("el premio se paga a la VERIFICACIÓN", () => {
  it("registrarse no paga nada: sin verificar, cero puntos para los dos", async () => {
    const padrino = await registrar("p@test.com");
    const ahijado = await registrar("a@test.com", padrino.referralCode);

    expect(await puntos(padrino.id)).toBe(0);
    expect(await puntos(ahijado.id)).toBe(0);
    // Y llamar al premio a mano tampoco: la barrera está en el servicio, no en quién lo llama.
    expect(await premiarReferido(prisma, ahijado.id)).toEqual({ pagado: false });
    expect(await movimientos(ahijado.id)).toHaveLength(0);
  });

  it("al verificar cobran LOS DOS, el mismo importe y una sola vez", async () => {
    const padrino = await registrar("p@test.com");
    const ahijado = await registrar("a@test.com", padrino.referralCode);

    expect(await verificar("a@test.com")).toMatchObject({ verified: true });

    expect(await puntos(padrino.id)).toBe(POINTS.INVITE_FRIEND);
    expect(await puntos(ahijado.id)).toBe(POINTS.INVITE_FRIEND);

    const delPadrino = await movimientos(padrino.id);
    expect(delPadrino).toHaveLength(1);
    expect(delPadrino[0]).toMatchObject({ reason: RAZON_INVITO_AMIGO, refId: ahijado.id });
    const delAhijado = await movimientos(ahijado.id);
    expect(delAhijado).toHaveLength(1);
    expect(delAhijado[0]).toMatchObject({
      reason: RAZON_REGISTRO_CON_REFERIDO,
      refId: padrino.id,
    });
  });

  it("REVERIFICAR no duplica: el premio es uno por referido, para siempre", async () => {
    const padrino = await registrar("p@test.com");
    const ahijado = await registrar("a@test.com", padrino.referralCode);

    await verificar("a@test.com");
    await verificar("a@test.com"); // otro token, misma cuenta
    await premiarReferido(prisma, ahijado.id); // y el servicio a pelo, por si acaso

    expect(await movimientos(padrino.id)).toHaveLength(1);
    expect(await movimientos(ahijado.id)).toHaveLength(1);
    expect(await puntos(padrino.id)).toBe(POINTS.INVITE_FRIEND);
  });

  it("sin referente no se paga nada a nadie", async () => {
    const solo = await registrar("solo@test.com");
    await verificar("solo@test.com");

    expect(await movimientos(solo.id)).toHaveLength(0);
    expect(await puntos(solo.id)).toBe(0);
  });

  it("si el referente fue suspendido entre medias, el invitado cobra igual (él no hizo nada)", async () => {
    const padrino = await registrar("p@test.com");
    const ahijado = await registrar("a@test.com", padrino.referralCode);
    await prisma.user.update({ where: { id: padrino.id }, data: { bannedAt: new Date() } });

    await verificar("a@test.com");

    expect(await puntos(padrino.id)).toBe(0);
    expect(await puntos(ahijado.id)).toBe(POINTS.INVITE_FRIEND);
  });

  it("verificar sigue funcionando aunque el premio no aplique: la cuenta queda verificada", async () => {
    await registrar("solo@test.com");
    const r = await verificar("solo@test.com");

    expect(r).toMatchObject({ verified: true });
    const u = await prisma.user.findUniqueOrThrow({
      where: { email: "solo@test.com" },
      select: { emailVerified: true },
    });
    expect(u.emailVerified).not.toBeNull();
  });
});

describe("el historial lo cuenta en humano", () => {
  it("cada lado ve su frase, con el @handle del otro y sin un solo id", async () => {
    const padrino = await registrar("p@test.com");
    await prisma.user.update({ where: { id: padrino.id }, data: { username: "padrina" } });
    const ahijado = await registrar("a@test.com", padrino.referralCode);
    await prisma.user.update({ where: { id: ahijado.id }, data: { username: "ahijada" } });

    await verificar("a@test.com");

    const suyo = await historialPuntos(prisma, padrino.id);
    expect(suyo.items[0]?.referencia).toBe("Invitó a @ahijada");

    const delOtro = await historialPuntos(prisma, ahijado.id);
    expect(delOtro.items[0]?.referencia).toBe("Se registró con el enlace de @padrina");

    for (const p of [suyo, delOtro]) {
      expect(JSON.stringify(p.items)).not.toContain(padrino.id);
      expect(JSON.stringify(p.items)).not.toContain(ahijado.id);
    }
  });

  it("si el otro ya no existe, se dice, no se enseña su id", async () => {
    const padrino = await crearUsuario(prisma, { username: "fantasma" });
    const ahijado = await crearUsuario(prisma, { username: "sola" });
    await prisma.user.update({
      where: { id: ahijado },
      data: { referredById: padrino, emailVerified: new Date() },
    });
    await premiarReferido(prisma, ahijado);
    // El referente desaparece DESPUÉS de cobrar: su fila de ledger sigue, su nombre ya no.
    await prisma.user.delete({ where: { id: padrino } });

    const h = await historialPuntos(prisma, ahijado);
    expect(h.items[0]?.referencia).toBe("—");
    expect(JSON.stringify(h.items)).not.toContain(padrino);
  });
});

describe("la migración", () => {
  it("rellena el código de las cuentas que ya existían, y solo entonces pone el UNIQUE", () => {
    // Sin relleno, las cuentas de antes no podrían invitar a nadie: su enlace no existiría. Y el
    // orden importa — un UNIQUE antes del relleno fallaría con todas las filas a NULL... o peor, en
    // MariaDB los NULL no chocan entre sí y la columna quedaría medio vacía sin que nada avisara.
    const dir = join(process.cwd(), "prisma", "migrations");
    const conLaColumna = readdirSync(dir)
      .filter((m) => statSync(join(dir, m)).isDirectory())
      .map((m) => join(dir, m, "migration.sql"))
      .filter((p) => readFileSync(p, "utf8").includes("`referralCode`"));

    expect(conLaColumna).toHaveLength(1);
    const sql = readFileSync(conLaColumna[0]!, "utf8").replace(/^\s*--.*$/gm, "");
    expect(sql).toMatch(/UPDATE `User`[\s\S]*referralCode/);

    // Las DOS posiciones se comprueban existentes ANTES de compararlas. `indexOf` devuelve -1 cuando
    // no encuentra, y -1 es menor que cualquier índice: sin esto, BORRAR el relleno hacía pasar la
    // comprobación del orden. Lo destapó romperlo a propósito.
    const relleno = sql.indexOf("UPDATE `User`");
    const unique = sql.indexOf("CREATE UNIQUE INDEX");
    expect(relleno).toBeGreaterThanOrEqual(0);
    expect(unique).toBeGreaterThanOrEqual(0);
    expect(relleno).toBeLessThan(unique);
    // Y la columna acaba siendo obligatoria: un NULL ahí sería una cuenta sin enlace.
    expect(sql).toMatch(/MODIFY `referralCode` VARCHAR\(191\) NOT NULL/);
  });
});
