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

import { dockerfileSinComentarios, etapaDockerfile } from "./helpers/dockerfile";
import { falso } from "./helpers/valores-falsos";

const SHA = "a60b53e74ed3a859d77a48b7201b4d01ddc9f5c8";

const mocks = vi.hoisted(() => ({
  env: { NODE_ENV: "production", GIT_SHA: undefined as string | undefined },
  queryRaw: vi.fn(),
  jobCount: vi.fn(),
  /** La fila del latido del worker (`SystemState`), o `null` si no hay. */
  latido: null as string | null,
}));

vi.mock("@/config/env", () => ({ env: mocks.env }));
vi.mock("@/server/db/client", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    job: { count: mocks.jobCount },
    systemState: {
      findUnique: async () => (mocks.latido === null ? null : { value: mocks.latido }),
    },
  },
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
  mocks.latido = null;
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

describe("el worker en el health (Fase 11 · worker vigilado)", () => {
  const latido = (commit: string | null, haceMs: number, vivoMs: number) => {
    const en = new Date(Date.now() - haceMs);
    mocks.latido = JSON.stringify({
      commit,
      en: en.toISOString(),
      desde: new Date(en.getTime() - vivoMs).toISOString(),
    });
  };

  it("con latido, devuelve `worker` con su commit, hace cuántos segundos latió y cuántos lleva vivo", async () => {
    latido(SHA, 3_000, 40_000);
    const { status, body } = await salud();
    expect(status).toBe(200);
    expect(body.worker).toEqual({ commit: SHA, haceS: 3, vivoS: 40 });
  });

  it("la FORMA del cuerpo: `worker` son solo esos tres campos, números y un SHA", async () => {
    // El health es público: nada de errores, hosts, tokens ni nombres internos.
    latido(SHA, 1_000, 20_000);
    const { body } = await salud();
    const w = body.worker as Record<string, unknown>;
    expect(Object.keys(w).sort()).toEqual(["commit", "haceS", "vivoS"]);
    expect(w.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof w.haceS).toBe("number");
    expect(typeof w.vivoS).toBe("number");
    // Y el resto del cuerpo, las claves de siempre más `worker`: ni una más.
    expect(Object.keys(body).sort()).toEqual(
      ["commit", "db", "entorno", "jobsFailed", "momento", "status", "worker"].sort(),
    );
  });

  it("sin latido, `worker` no sale: la ausencia ya dice que no hay worker que se vea", async () => {
    const { status, body } = await salud();
    expect(status).toBe(200);
    expect(body).not.toHaveProperty("worker");
  });

  it("una fila rara no tumba el health ni cuela nada: como si no hubiera latido", async () => {
    // Usuario y clave generados en ejecución: ningún literal con forma de credencial en el repo.
    const usuario = `u${falso("health-latido-usuario", 10)}`;
    const clave = falso("health-latido-clave", 24);
    mocks.latido = JSON.stringify({
      commit: `no-es-un-sha; mysql://${usuario}:${clave}@host`,
      en: "ayer",
    });
    const { status, body } = await salud();
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body).not.toHaveProperty("worker");
    const cuerpo = JSON.stringify(body);
    expect(cuerpo).not.toContain(usuario);
    expect(cuerpo).not.toContain(clave);
    expect(cuerpo).not.toContain("mysql");
  });
});

describe("el artefacto construido lleva el SHA (estructural)", () => {
  const raiz = path.resolve(__dirname, "..");
  const leer = (rel: string): string => readFileSync(path.join(raiz, rel), "utf8");

  it("la etapa `runner` del Dockerfile exige un SHA de 40 hex y lo deja en el entorno", () => {
    const runner = etapaDockerfile("runner");

    expect(runner).toMatch(/^ARG GIT_SHA\s*$/m);
    // La guarda: si el SHA falta o no tiene forma de SHA, el build se detiene.
    expect(runner).toMatch(/grep -Eq '\^\[0-9a-f\]\{40\}\$'/);
    expect(runner).toMatch(/exit 1/);
    expect(runner).toMatch(/^ENV GIT_SHA=\$GIT_SHA\s*$/m);
    // Orden: primero se comprueba y después se fija. Al revés, una imagen sin SHA pasaría la
    // guarda porque ya tendría la variable (vacía) en el entorno.
    expect(runner.indexOf("grep -Eq")).toBeLessThan(runner.indexOf("ENV GIT_SHA"));
  });

  it("el `worker` también lo exige (anota su commit en el latido), con la misma guarda", () => {
    // Fase 11 · worker vigilado: sin el SHA en la imagen del worker, `deploy.sh` no podría distinguir
    // un worker del commit nuevo de uno viejo.
    const worker = etapaDockerfile("worker");
    expect(worker).toMatch(/^ARG GIT_SHA\s*$/m);
    expect(worker).toMatch(/grep -Eq '\^\[0-9a-f\]\{40\}\$'/);
    expect(worker).toMatch(/^ENV GIT_SHA=\$GIT_SHA\s*$/m);
    expect(worker.indexOf("grep -Eq")).toBeLessThan(worker.indexOf("ENV GIT_SHA"));
  });

  it("solo `runner` y `worker` lo exigen: `builder` (el de `migrate`) construye sin él", () => {
    // Si la guarda subiera a `base` o a `builder`, `migrate-prod.sh` (que construye `builder`)
    // dejaría de construirse sin la variable.
    expect(dockerfileSinComentarios().match(/ARG GIT_SHA/g)).toHaveLength(2);
    expect(etapaDockerfile("builder")).not.toMatch(/GIT_SHA/);
  });

  it("el compose de EMERGENCIA se lo pasa a `web`, con default vacío (no `:?`)", () => {
    // Desde que CI construye las imágenes, el compose de producción no construye nada: quien construye
    // en el servidor (el plan de emergencia) es docker-compose.construir.yml.
    const compose = leer("docker-compose.construir.yml");
    // A `web` y a `worker`: las dos etapas lo exigen.
    expect(compose.match(/^\s+GIT_SHA: \$\{GIT_SHA:-\}\s*$/gm)).toHaveLength(2);
    // Con `:?` fallaría CUALQUIER comando del compose sin la variable, `logs` incluido.
    expect(compose).not.toMatch(/\$\{GIT_SHA:\?/);
  });

  it("el CI construye `web` y `worker` con el SHA del push (si no, su build fallaría en la guarda)", () => {
    expect(
      leer(".github/workflows/imagenes.yml").match(/build-args: GIT_SHA=\$\{\{ github\.sha \}\}/g),
    ).toHaveLength(2);
  });
});
