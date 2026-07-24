import { NextResponse } from "next/server";

/**
 * `force-dynamic` es OBLIGATORIO aqui, por dos motivos:
 *  1. Un health check prerenderizado no comprueba nada: devolveria una foto
 *     congelada del momento del build.
 *  2. Esta ruta lee `env` y consulta la base de datos. Si Next la prerenderizara,
 *     se evaluaria durante `next build` —donde Hostinger no tiene variables— y
 *     tumbaria el despliegue. Ver la regla de acceso en `src/config/env.ts`.
 */
export const dynamic = "force-dynamic";

/** Timeout corto: el endpoint no debe colgarse si la base no responde. */
const DB_PING_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("DB_PING_TIMEOUT")), ms),
    ),
  ]);
}

export async function GET() {
  // Importaciones DENTRO del ambito de la peticion (server-only + lectura de env).
  const { env } = await import("@/config/env");

  let dbOk = false;
  try {
    const { prisma } = await import("@/server/db/client");
    // Consulta trivial: solo comprueba que la conexion responde.
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_PING_TIMEOUT_MS);
    dbOk = true;
  } catch (error) {
    // El DETALLE completo va al log; NUNCA al cuerpo de la respuesta (no exponer
    // cadena de conexion, host, usuario ni el error interno).
    console.error("[health] fallo de conexion a la base de datos:", error);
  }

  // El cuerpo solo lleva booleanos y, como mucho, un codigo generico.
  const body = {
    status: dbOk ? "ok" : "degraded",
    db: dbOk,
    entorno: env.NODE_ENV,
    ...(dbOk ? {} : { error: "DB_UNAVAILABLE" }),
    momento: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
