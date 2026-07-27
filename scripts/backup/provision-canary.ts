/**
 * Aprovisiona la cuenta CANARIO en la base (una sola vez; idempotente). Se ejecuta como
 * los demas one-off, desde la imagen `migrate`:
 *
 *   docker compose -f docker-compose.prod.yml run --rm migrate npx tsx scripts/backup/provision-canary.ts
 *
 * La cuenta nace INUTILIZABLE (baneada + sin verificar); su unico uso es validar
 * restauraciones llamando directo a verifyPassword. Ver scripts/backup/canary.ts.
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../src/generated/prisma/client";

import { CANARY_EMAIL, provisionarCanario } from "./canary";

async function main() {
  const dbUrl = process.env["DATABASE_URL"];
  if (!dbUrl) {
    console.error("[provision-canary] Falta DATABASE_URL.");
    process.exit(1);
  }
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
    await provisionarCanario(prisma);
    console.log(
      `[provision-canary] Canario aprovisionado (baneado, sin verificar): ${CANARY_EMAIL}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[provision-canary] Error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
