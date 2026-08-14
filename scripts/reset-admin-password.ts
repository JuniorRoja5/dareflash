/**
 * OPS: resetea la contraseña de un ADMIN EXISTENTE (p. ej. si el dueño la olvidó). Invocación MANUAL
 * y explícita (por SSH); SÍ corre en producción. NO crea usuarios ni toca no-admins: eso es
 * `create-admin.ts` (el primer admin) o la UI de reset (Fase 1, pendiente). Mismo patrón Prisma
 * standalone que `create-admin.ts` (dotenv + PrismaMariaDb + cliente generado + DATABASE_URL).
 *
 * Uso (ambas variables OBLIGATORIAS; la contraseña NUNCA se registra):
 *   ADMIN_EMAIL=admin@dareflash.com ADMIN_PASSWORD=<NUEVA> npx tsx scripts/reset-admin-password.ts
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { z } from "zod";

import { hashPassword } from "../src/server/auth/password";
import { PrismaClient } from "../src/generated/prisma/client";

function fail(message: string): never {
  console.error(`\n[reset-admin-password] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const email = z
    .email("ADMIN_EMAIL debe ser un email válido")
    .safeParse(process.env["ADMIN_EMAIL"]);
  if (!email.success) fail("Falta o es inválida ADMIN_EMAIL.");

  const password = process.env["ADMIN_PASSWORD"];
  if (!password) fail("Falta ADMIN_PASSWORD (la NUEVA contraseña).");
  if (password.length < 12) fail("La nueva contraseña debe tener al menos 12 caracteres.");

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
    // SOLO resetea un ADMIN EXISTENTE: si no hay usuario con ese email, o no es rol ADMIN, se niega
    // (nunca crea ni toca a un no-admin).
    const user = await prisma.user.findUnique({
      where: { email: email.data },
      select: { id: true, role: true },
    });
    if (!user || user.role !== "ADMIN") {
      fail("No existe un ADMIN con ese email. Este script SOLO resetea admins existentes.");
    }

    // Argon2id: MISMO helper/config que create-admin (no se duplican parámetros).
    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.auditLog.create({
        data: {
          actorId: null, // reseteo por ops, sin actor en sesión
          action: "ADMIN_PASSWORD_RESET",
          targetType: "USER",
          targetId: user.id,
          metadata: { email: email.data },
        },
      });
    });

    console.log(
      `\n[reset-admin-password] Contraseña reseteada para ${email.data} (id ${user.id}). ` +
        `Registrado en AuditLog.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[reset-admin-password] Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
