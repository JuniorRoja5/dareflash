/**
 * Worker permanente de la cola de trabajos. Procesa `Job` de forma continua (sondeo): hoy
 * su consecuencia visible es que los correos de verificacion (SEND_EMAIL) SALEN.
 *
 * Se ejecuta con `--conditions=react-server` para que los modulos `server-only` (prisma, env,
 * adaptador de correo) se puedan importar en un proceso Node normal (fuera de RSC):
 *   npx tsx --conditions=react-server scripts/worker.ts        (o `npm run worker`)
 *
 * Apagado LIMPIO: ante SIGTERM/SIGINT deja de reclamar nuevos trabajos, termina el lote en
 * curso y sale con 0. tini reenvia la senal en el contenedor.
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { env } from "@/config/env";
import { prisma } from "@/server/db/client";
import { getEmailAdapter } from "@/server/email/adapter";
import { construirRegistro } from "@/server/jobs/registry";
import { bucleWorker, contarFallidos } from "@/server/jobs/worker";

const LIMIT = Number(process.env["WORKER_LIMIT"] ?? "5"); // lote pequeño y secuencial
const INTERVALO_MS = Number(process.env["WORKER_INTERVALO_MS"] ?? "5000"); // sondeo 5 s

async function main(): Promise<void> {
  // Validacion al ARRANCAR (fail-fast): en produccion el remitente debe ser la cuenta
  // autenticada, o el servidor de correo rechaza. Mejor caer aqui con un mensaje claro que
  // fallar en cada envio.
  if (env.NODE_ENV !== "development" && env.SMTP_USER && env.EMAIL_FROM !== env.SMTP_USER) {
    throw new Error(
      `EMAIL_FROM (${env.EMAIL_FROM}) debe coincidir con SMTP_USER (${env.SMTP_USER}).`,
    );
  }

  const emailAdapter = await getEmailAdapter();
  const registro = construirRegistro({ emailAdapter });
  const workerToken = randomUUID();

  let parando = false;
  const parar = (): boolean => parando;
  // Sleep INTERRUMPIBLE: la senal lo despierta al instante para no esperar al proximo sondeo.
  let despertar: (() => void) | null = null;
  const dormir = (ms: number): Promise<void> =>
    new Promise((r) => {
      const t = setTimeout(() => {
        despertar = null;
        r();
      }, ms);
      despertar = () => {
        clearTimeout(t);
        despertar = null;
        r();
      };
    });
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      console.log(`[worker] ${sig}: dejo de reclamar y termino el lote en curso...`);
      parando = true;
      if (despertar) despertar(); // cortar la espera y salir ya
    });
  }

  const fallidosAlArrancar = await contarFallidos(prisma);
  console.log(
    `[worker] arrancando token=${workerToken} adaptador=${emailAdapter.name} ` +
      `lote=${LIMIT} intervalo=${INTERVALO_MS}ms FAILED-en-cola=${fallidosAlArrancar}`,
  );

  await bucleWorker(prisma, registro, {
    workerToken,
    limit: LIMIT,
    intervaloMs: INTERVALO_MS,
    parar,
    dormir,
    // Mantenimiento cableado: purgas (Job DONE/FAILED, RateLimit, Session) y aviso de FAILED.
    emailAdapter, // aviso DIRECTO, fuera de la cola
    adminEmail: env.ADMIN_EMAIL,
    log: (m) => console.log(m),
  });

  await prisma.$disconnect();
  console.log("[worker] apagado limpio.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[worker] error fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
