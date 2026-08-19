/**
 * Ayudantes para leer errores de la BD (Prisma + driver adapter de MariaDB), compartidos por varias
 * capas. SIN `server-only`: lo consumen módulos que también corren en scripts Node (p.ej. el generador
 * de código de reto, que usa el seed) además del runtime; el `server-only` de `registration` se queda
 * en `registration`, no aquí.
 */
import { Prisma } from "@/generated/prisma/client";

/**
 * Identificador de la constraint UNICA violada en un P2002, como texto donde buscar el nombre. Contempla
 * DOS formas de `meta` porque dependen del driver:
 *  - Driver adapter de MariaDB (el que usamos): el nombre del índice está en
 *    `meta.driverAdapterError.cause.constraint.index` (p.ej. "User_email_key"). AQUI NO hay `meta.target`.
 *  - Forma clásica de Prisma (por si cambia el adapter u otro driver): `meta.target`, string o string[].
 */
export function objetivoDeViolacionUnica(e: Prisma.PrismaClientKnownRequestError): string {
  const meta = e.meta as Record<string, unknown> | undefined;
  if (!meta) return "";
  const target = meta["target"];
  if (typeof target === "string") return target;
  if (Array.isArray(target)) return target.join(",");
  const dae = meta["driverAdapterError"] as
    { cause?: { constraint?: { index?: unknown } } } | undefined;
  const index = dae?.cause?.constraint?.index;
  return typeof index === "string" ? index : "";
}
