import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente de base de datos que acepta TANTO el PrismaClient normal COMO el cliente
 * de transaccion (`Prisma.TransactionClient`). Se usa en funciones que deben poder
 * participar en un `$transaction` externo (p.ej. crear/revocar sesiones dentro de la
 * misma transaccion que banea o cambia la contrasena).
 *
 * Nota: `TransactionClient` no expone `$transaction`, asi que las funciones que
 * ABREN su propia transaccion siguen exigiendo `PrismaClient`.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
