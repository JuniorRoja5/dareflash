/**
 * /api/health DICE QUÉ COMMIT ESTÁ SIRVIENDO, sin romper lo que ya decía.
 *
 * Antes, "main = desplegado" se comprobaba de memoria: el endpoint confirmaba que la app y la base
 * respondían, pero no QUÉ versión respondía. Ahora trae `commit`, el SHA del artefacto, inyectado en
 * el build. Dos mitades, y las dos se prueban:
 *
 *  - la RUTA: con SHA lo devuelve, sin SHA dice `null` (no se inventa), con la base caída lo sigue
 *    diciendo, y el contrato de siempre (status/db/jobsFailed) está intacto;
 *  - el ARTEFACTO: la ruta no puede demostrar por sí sola que la imagen construida lleva el SHA. Eso
 *    lo garantiza la cadena Dockerfile -> compose -> CI, y se fija aquí de forma estructural, porque
 *    romper un eslabón no pondría rojo ningún test de comportamiento: la imagen saldría con
 *    `commit: null` y nadie lo vería hasta el siguiente despliegue.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SHA = "a60b53e74ed3a859d77a48b7201b4d01ddc9f5c8";

const mocks = vi.hoisted(() => ({
  env: { NODE_ENV: "production", GIT_SHA: undefined as string | undefined },
  queryRaw: vi.fn(),
  jobCount: vi.fn(),
}));

vi.mock("@/config/env", () => ({ env: mocks.env }));
vi.mock("@/server/db/client", () => ({
  prisma: { $queryRaw: mocks.queryRaw, job: { count: mocks.jobCount } },
}));

import { GET } from "../src/app/api/health/route";

async function salud(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  mocks.env.GIT_SHA = undefined;
  mocks.queryRaw.mockReset().mockResolvedValue([{ 1: 1 }]);
  mocks.jobCount.mockReset().mockResolvedValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("la respuesta de /api/health", () => {
  it("con el SHA inyectado, lo devuelve tal cual en `commit`", async () => {
    mocks.env.GIT_SHA = SHA;
    const { status, body } = await salud();
    expect(status).toBe(200);
    expect(body.commit).toBe(SHA);
  });

  it("el contrato de siempre sigue ahí: el commit se AÑADE, no sustituye nada", async () => {
    mocks.env.GIT_SHA = SHA;
    const { body } = await salud();
    // Junior consulta esto con curl desde hace semanas: si alguno de estos campos desapareciera, sus
    // comprobaciones se romperían sin avisar.
    expect(body.status).toBe("ok");
    expect(body.db).toBe(true);
    expect(body.jobsFailed).toBe(0);
    expect(body.entorno).toBe("production");
    expect(typeof body.momento).toBe("string");
  });

  it("sin SHA (local, tests) dice `null`: el campo está, pero no se inventa un valor", async () => {
    const { status, body } = await salud();
    expect(status).toBe(200);
    expect(body).toHaveProperty("commit");
    expect(body.commit).toBeNull();
  });

  it("con la base CAÍDA sigue diciendo qué versión es — justo cuando más interesa saberlo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.env.GIT_SHA = SHA;
    mocks.queryRaw.mockRejectedValue(new Error("ECONNREFUSED"));
    const { status, body } = await salud();
    expect(status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe(false);
    expect(body.commit).toBe(SHA);
  });
});

describe("el artefacto construido lleva el SHA (estructural)", () => {
  const raiz = path.resolve(__dirname, "..");
  const leer = (rel: string): string => readFileSync(path.join(raiz, rel), "utf8");
  /** Sin comentarios: una línea comentada no construye nada. */
  const sinComentarios = (s: string): string =>
    s
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");

  it("la etapa `runner` del Dockerfile exige un SHA de 40 hex y lo deja en el entorno", () => {
    const docker = sinComentarios(leer("Dockerfile"));
    const inicio = docker.indexOf("FROM base AS runner");
    expect(inicio).toBeGreaterThan(-1);
    const fin = docker.indexOf("\nFROM ", inicio + 1);
    const runner = docker.slice(inicio, fin === -1 ? undefined : fin);

    expect(runner).toMatch(/^ARG GIT_SHA\s*$/m);
    // La guarda: si el SHA falta o no tiene forma de SHA, el build se detiene.
    expect(runner).toMatch(/grep -Eq '\^\[0-9a-f\]\{40\}\$'/);
    expect(runner).toMatch(/exit 1/);
    expect(runner).toMatch(/^ENV GIT_SHA=\$GIT_SHA\s*$/m);
    // Orden: primero se comprueba y después se fija. Al revés, una imagen sin SHA pasaría la
    // guarda porque ya tendría la variable (vacía) en el entorno.
    expect(runner.indexOf("grep -Eq")).toBeLessThan(runner.indexOf("ENV GIT_SHA"));
  });

  it("solo `runner` lo exige: `builder` y `worker` construyen sin él", () => {
    // Si la guarda subiera a `base` o a `builder`, `migrate-prod.sh` (que construye `builder`) y el
    // worker dejarían de construirse sin la variable.
    const docker = sinComentarios(leer("Dockerfile"));
    expect(docker.match(/ARG GIT_SHA/g)).toHaveLength(1);
  });

  it("el compose se lo pasa a `web`, con default vacío (no `:?`)", () => {
    const compose = leer("docker-compose.prod.yml");
    expect(compose).toMatch(/^\s+GIT_SHA: \$\{GIT_SHA:-\}\s*$/m);
    // Con `:?` fallaría CUALQUIER comando del compose sin la variable, `logs` incluido.
    expect(compose).not.toMatch(/\$\{GIT_SHA:\?/);
  });

  it("el CI construye con el SHA del push (si no, su build fallaría en la guarda)", () => {
    expect(leer(".github/workflows/docker-build.yml")).toMatch(/GIT_SHA: \$\{\{ github\.sha \}\}/);
  });
});
