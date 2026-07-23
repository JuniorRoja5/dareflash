import { NextResponse } from "next/server";

/**
 * `force-dynamic` es OBLIGATORIO aqui, por dos motivos:
 *  1. Un health check prerenderizado no comprueba nada: devolveria una foto
 *     congelada del momento del build.
 *  2. Esta ruta lee `env`. Si Next la prerenderizara, `env` se evaluaria durante
 *     `next build` —donde Hostinger no tiene variables— y tumbaria el
 *     despliegue. Ver la regla de acceso en `src/config/env.ts`.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // Lectura de `env` dentro del ambito de la PETICION: correcto.
  const { env } = await import("@/config/env");

  return NextResponse.json({
    status: "ok",
    entorno: env.NODE_ENV,
    // PENDIENTE (Paso 4): comprobar el estado real de la base de datos con
    // Prisma (`SELECT 1`). Prisma aun no existe en el proyecto.
    baseDeDatos: "no comprobada todavia (pendiente del Paso 4)",
    momento: new Date().toISOString(),
  });
}
