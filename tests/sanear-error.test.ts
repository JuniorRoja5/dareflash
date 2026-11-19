/**
 * EL LOG DICE LA CLASE DEL FALLO, NUNCA EL MENSAJE (Fase 11 · worker vigilado).
 *
 * El 19 nov el worker escribió «aforo: materializacion fallo (Error)» y «publicidad: cifras fallaron
 * (Error)»: `sanearError` solo sabía de errores con `code` (SMTP, Prisma conocidos) y lo demás lo
 * reducía al nombre, «Error». Imposible saber la causa. Ahora conoce más CLASES —el `errorCode` de
 * Prisma al conectar, el rechazo de ioredis sin conexión—, y sigue sin devolver jamás el mensaje
 * crudo, que puede llevar una URL con usuario y contraseña.
 *
 * Para romperlo a propósito: devolver `e.message` en el último caso (rojo: la URL con la clave sale al
 * log); quitar la clase de Redis (rojo: vuelve a ser «Error»).
 */
import { describe, expect, it } from "vitest";

import { Prisma } from "../src/generated/prisma/client";
import { sanearError } from "../src/server/observability/sanitize-error";

import { falso } from "./helpers/valores-falsos";

describe("las clases conocidas", () => {
  it("un error de Prisma con código: su código", () => {
    const e = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
    expect(sanearError(e)).toBe("P2002");
  });

  it("un fallo de Prisma al conectar (sin `code`, con `errorCode`): su errorCode", () => {
    const e = new Prisma.PrismaClientInitializationError(
      "Can't reach database server at `mariadb:3306`",
      "test",
      "P1001",
    );
    expect(sanearError(e)).toBe("P1001");
  });

  it("ioredis sin conexión (un Error pelado, sin code): «Redis no conectado»", () => {
    // El mensaje EXACTO que da ioredis con `enableOfflineQueue: false` y la conexión aún abriéndose:
    // reproducido el 19 nov. Y el de una conexión cerrada.
    expect(
      sanearError(new Error("Stream isn't writeable and enableOfflineQueue options is false")),
    ).toBe("Redis no conectado");
    expect(sanearError(new Error("Connection is closed."))).toBe("Redis no conectado");
  });

  it("un error de red con `code` (ECONNREFUSED): su código", () => {
    const e = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:6379"), {
      code: "ECONNREFUSED",
    });
    expect(sanearError(e)).toBe("ECONNREFUSED");
  });

  it("SMTP sigue igual: el código y el responseCode", () => {
    const e = Object.assign(new Error("Invalid login: 535 Authentication failed"), {
      code: "EAUTH",
      responseCode: 535,
    });
    expect(sanearError(e)).toBe("EAUTH (535)");
  });
});

describe("el mensaje crudo NUNCA sale", () => {
  it("un Error con una URL de base de datos con usuario y clave: ni el usuario ni la clave", () => {
    // Generados en ejecución (ningún literal con forma de credencial en el repositorio).
    const usuario = `u${falso("sanear-usuario", 10)}`;
    const clave = falso("sanear-clave", 24);
    const e = new Error(`fallo conectando a mysql://${usuario}:${clave}@db.interna:3306/app`);
    const salida = sanearError(e);
    expect(salida).not.toContain(usuario);
    expect(salida).not.toContain(clave);
    expect(salida).not.toContain("mysql://");
  });

  it("y tampoco por la vía de una clase conocida: la salida es la clase fija", () => {
    const clave = falso("sanear-clave-redis", 24);
    const e = new Error(`Connection is closed. (redis://:${clave}@cache:6379)`);
    expect(sanearError(e)).toBe("Redis no conectado");
  });
});
