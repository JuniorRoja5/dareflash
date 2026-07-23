/**
 * Seed de datos MINIMOS de desarrollo.
 *
 * Instancia su PROPIO PrismaClient con el driver adapter: no puede usar el
 * singleton de `src/server/db/client.ts` porque ese es `server-only` (revienta
 * fuera del runtime de Next). Lee DATABASE_URL de `.env` via dotenv.
 *
 * Es IDEMPOTENTE (usa upsert por campos unicos): se puede correr varias veces.
 * Inserta emoji a proposito para verificar utf8mb4 A TRAVES DEL ORM.
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { DEFAULT_CURRENCY } from "../src/config/constants";
import { PrismaClient } from "../src/generated/prisma/client";

const url = new URL(process.env["DATABASE_URL"] ?? "");
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: url.port ? Number(url.port) : 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // Fechas explicitas en UTC (todo el sistema es UTC).
  const ahora = new Date();
  const enUnaSemana = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

  // --- Admin de bootstrap (via seed, como permite la arquitectura). ---
  const admin = await prisma.user.upsert({
    where: { email: "admin@dareflash.local" },
    update: {},
    create: {
      email: "admin@dareflash.local",
      username: "admin",
      displayName: "Admin 🛠️",
      role: "ADMIN",
      emailVerified: ahora,
      birthDate: new Date("1990-01-01T00:00:00.000Z"),
    },
  });

  // --- Usuario normal de prueba, con emoji en el nombre (test utf8mb4 via ORM). ---
  await prisma.user.upsert({
    where: { email: "demo@dareflash.local" },
    update: {},
    create: {
      email: "demo@dareflash.local",
      username: "demo",
      displayName: "Demo 🎭 Ñandú",
      role: "USER",
      emailVerified: ahora,
      birthDate: new Date("2001-06-15T00:00:00.000Z"),
    },
  });

  // --- Reto de ejemplo con emoji en titulo y categoria. ---
  const existente = await prisma.challenge.findFirst({
    where: { title: "🏋️ Reto de ejemplo" },
  });
  if (!existente) {
    await prisma.challenge.create({
      data: {
        title: "🏋️ Reto de ejemplo",
        description: "Reto de desarrollo con emoji para verificar utf8mb4.",
        category: "🎭 Humor",
        status: "PUBLISHED",
        prizeAmountCents: 2000, // $20.00 en centimos
        prizeCurrency: DEFAULT_CURRENCY,
        startsAt: ahora,
        deadline: enUnaSemana,
        createdById: admin.id,
      },
    });
  }

  const usuarios = await prisma.user.count();
  const retos = await prisma.challenge.count();
  console.log(`[seed] OK. Usuarios: ${usuarios}, Retos: ${retos}.`);
}

main()
  .catch((e) => {
    console.error("[seed] Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
