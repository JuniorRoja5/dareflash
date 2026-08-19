/**
 * PUBLIC CODE de un reto: código corto ÚNICO que actúa de clave autoritativa en la URL
 * (`/retos/{publicCode}-{slug}`). Se genera con la MISMA primitiva `codigoBase32` que el handle (DRY),
 * longitud 8 (colisión práctica nula). La UNICIDAD la garantiza la constraint `@unique`; ante colisión
 * quien crea REGENERA y reintenta (acotado), sin `findUnique`-luego-`create` (carrera). Aquí vive solo
 * la GENERACIÓN + el reintento; el endpoint/flujo de creación es trabajo posterior.
 */
// SIN `server-only` (como server/auth/handle): usa `node:crypto` pero lo consume también el seed (script
// Node, sin la condición `react-server`); nada del cliente lo importa. La UNICIDAD la garantiza la BD.
import { randomBytes } from "node:crypto";

import { codigoBase32 } from "@/lib/codigo-base32";
import { Prisma } from "@/generated/prisma/client";
// Reutiliza el SONDEO de la forma real del error del adapter MariaDB (mismo que username): el nombre
// del índice está en meta.driverAdapterError.cause.constraint.index, NO en meta.target.
import { objetivoDeViolacionUnica } from "@/server/db/errores";

/** Longitud del code (8 -> 32^8 ≈ 1.1e12 combinaciones). */
export const PUBLIC_CODE_LEN = 8;

/** Reintentos acotados ante colisión del UNIQUE (fallo real, no bucle infinito). */
export const PUBLIC_CODE_MAX_INTENTOS = 5;

/** Genera un publicCode aleatorio (impura: `randomBytes`). Cada llamada es un candidato nuevo. */
export function generarPublicCode(): string {
  return codigoBase32(randomBytes(PUBLIC_CODE_LEN), PUBLIC_CODE_LEN);
}

/**
 * ¿Es un P2002 causado por la constraint UNICA de `publicCode`? Es el caso RECUPERABLE (regenerar y
 * reintentar). Suena la forma real del adapter (índice `Challenge_publicCode_key`).
 */
export function esViolacionUnicaDePublicCode(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  return /publicCode/i.test(objetivoDeViolacionUnica(e));
}

/**
 * Crea un reto con un `publicCode` ÚNICO: llama a `crear(code)`; si choca con el UNIQUE, REGENERA y
 * reintenta (acotado a `PUBLIC_CODE_MAX_INTENTOS`). Cualquier otro error (o agotar los intentos) se
 * propaga. `generar` es inyectable SOLO para test (forzar una colisión y ver el reintento).
 */
export async function crearRetoConPublicCode<T>(
  crear: (publicCode: string) => Promise<T>,
  deps: { generar?: () => string } = {},
): Promise<T> {
  const generar = deps.generar ?? generarPublicCode;
  for (let intento = 0; ; intento++) {
    try {
      return await crear(generar());
    } catch (e) {
      if (esViolacionUnicaDePublicCode(e) && intento < PUBLIC_CODE_MAX_INTENTOS - 1) continue;
      throw e;
    }
  }
}
