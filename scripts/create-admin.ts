/**
 * Arranque del PRIMER ADMIN. Invocacion MANUAL y explicita, nunca un endpoint ni
 * nada automatico. A diferencia de la semilla, este script SI corre en produccion
 * (por SSH). Reglas:
 *   - Se NIEGA a ejecutarse si ya existe algun ADMIN.
 *   - La contrasena se da por ENTRADA (env ADMIN_PASSWORD o prompt interactivo oculto),
 *     nunca fija en el codigo.
 *   - Hashea con Argon2id y registra la creacion en AuditLog, en una transaccion.
 *
 * Uso:
 *   ADMIN_EMAIL=admin@dareflash.com ADMIN_PASSWORD=... npx tsx scripts/create-admin.ts
 *   # o interactivo (pide la contrasena sin mostrarla):
 *   ADMIN_EMAIL=admin@dareflash.com npx tsx scripts/create-admin.ts
 */
import "dotenv/config";

import { emitKeypressEvents } from "node:readline";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { z } from "zod";

import { hashPassword } from "../src/server/auth/password";
import { PrismaClient } from "../src/generated/prisma/client";

function fail(message: string): never {
  console.error(`\n[create-admin] ${message}\n`);
  process.exit(1);
}

/** Prompt de contrasena SIN eco en pantalla (entrada interactiva). */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    let value = "";
    const onKey = (char: string) => {
      const c = char.charCodeAt(0);
      if (c === 13 || c === 10) {
        // Enter
        if (stdin.isTTY) stdin.setRawMode(false);
        stdin.removeListener("data", onKey);
        stdout.write("\n");
        resolve(value);
      } else if (c === 3) {
        // Ctrl+C
        process.exit(1);
      } else if (c === 127 || c === 8) {
        // Backspace
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on("data", onKey);
    stdin.resume();
  });
}

async function getPassword(): Promise<string> {
  if (process.env["ADMIN_PASSWORD"]) return process.env["ADMIN_PASSWORD"];
  if (!process.stdin.isTTY) {
    fail("Proporciona ADMIN_PASSWORD (variable de entorno) o ejecuta en una terminal interactiva.");
  }
  return promptHidden("Contrasena del nuevo admin: ");
}

async function main() {
  const email = z
    .email("ADMIN_EMAIL debe ser un email valido")
    .safeParse(process.env["ADMIN_EMAIL"]);
  if (!email.success) fail("Falta o es invalida ADMIN_EMAIL.");

  const password = await getPassword();
  if (password.length < 12) fail("La contrasena del admin debe tener al menos 12 caracteres.");

  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) fail("Falta DATABASE_URL.");
  const url = new URL(dbUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    timezone: "Z",
  });
  const prisma = new PrismaClient({ adapter });

  try {
    // Se niega si YA existe un admin.
    const existente = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (existente) fail("Ya existe un ADMIN. Este script solo crea el PRIMERO.");

    const now = new Date();
    const passwordHash = await hashPassword(password);

    const admin = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.data,
          role: "ADMIN",
          passwordHash,
          emailVerified: now, // el primer admin se crea ya verificado
        },
        select: { id: true, email: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: null, // creado por arranque, sin actor
          action: "ADMIN_BOOTSTRAP",
          targetType: "USER",
          targetId: user.id,
          metadata: { email: user.email },
        },
      });
      return user;
    });

    console.log(
      `\n[create-admin] Admin creado: ${admin.email} (id ${admin.id}). Registrado en AuditLog.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[create-admin] Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
