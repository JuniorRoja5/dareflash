/**
 * EL PLAN DEL FEED — se le pregunta a MariaDB, no se supone.
 *
 * ┌─ EL FALLO QUE VIGILA ──────────────────────────────────────────────────────────────────────────┐
 * │ La consulta del feed tardaba 34 ms porque el optimizador arrancaba por `User` y, al no venir   │
 * │ las filas en orden de `createdAt`, materializaba TODO y lo ordenaba antes de quedarse con      │
 * │ once. El coste crecía con la base de usuarios, no con lo que se pedía.                         │
 * │                                                                                                 │
 * │ El arreglo son DOS piezas y ninguna sirve sola (medido sobre 6.000 vídeos y 2.000 usuarios):   │
 * │   sin nada                 34,2 ms   arranca por `User`, filesort                               │
 * │   SOLO el índice           34,2 ms   arranca por `User`, filesort   <- el optimizador lo ignora │
 * │   solo estadísticas        10,9 ms   arranca por `Video`, filesort                              │
 * │   índice + estadísticas     1,1 ms   arranca por `Video`, sin filesort                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUÉ NO BASTA CON MIRAR EL ESQUEMA ────────────────────────────────────────────────────────┐
 * │ Un `@@index` puede existir y no usarse —es EXACTAMENTE lo que pasa aquí sin estadísticas—, y   │
 * │ las estadísticas no se ven en ningún fichero del repositorio. Lo único que distingue el caso   │
 * │ bueno del malo es el PLAN, así que se le pregunta a la base de datos.                          │
 * │                                                                                                 │
 * │ Y el caso se AUTOCOMPRUEBA por las dos vías: quita las estadísticas y confirma que el plan se  │
 * │ degrada; quita el índice y confirma lo mismo. Sin eso, unos datos pequeños —donde cualquier    │
 * │ plan va rápido— lo dejarían verde para siempre.                                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

/** Suficientes para que el optimizador tenga algo que decidir. Con veinte filas da igual el plan. */
const USUARIOS = 400;
const VIDEOS_POR_USUARIO = 3;

const INDICE = "Video_status_ocultoAutoEn_reemplazaSubmissionId_createdAt_id_idx";
const COLUMNAS = "`status`, `ocultoAutoEn`, `reemplazaSubmissionId`, `createdAt`, `id`";
const TABLAS = ["Video", "User", "Submission", "Challenge"] as const;

/**
 * El SQL que genera Prisma para el feed, capturado del log de consultas (no reconstruido a mano).
 * Si `VIDEO_VISIBLE` o el `orderBy` cambian, este texto deja de representar al feed — y entonces
 * hay que volver a capturarlo, no parchearlo.
 */
const SQL_FEED = `
SELECT \`Video\`.\`id\`, \`Video\`.\`createdAt\` FROM \`Video\`
LEFT JOIN \`User\` AS \`j0\` ON (\`j0\`.\`id\`) = (\`Video\`.\`userId\`)
LEFT JOIN \`Submission\` AS \`j1\` ON (\`j1\`.\`videoId\`) = (\`Video\`.\`id\`)
LEFT JOIN \`Challenge\` AS \`j2\` ON (\`j2\`.\`id\`) = (\`j1\`.\`challengeId\`)
LEFT JOIN \`Submission\` AS \`j3\` ON (\`j3\`.\`videoId\`) = (\`Video\`.\`id\`)
WHERE (\`Video\`.\`status\` = 'PUBLISHED' AND \`Video\`.\`ocultoAutoEn\` IS NULL
  AND \`Video\`.\`reemplazaSubmissionId\` IS NULL
  AND (\`j0\`.\`deletedAt\` IS NULL AND \`j0\`.\`bannedAt\` IS NULL AND (\`j0\`.\`id\` IS NOT NULL))
  AND ((\`j2\`.\`deletedAt\` IS NULL AND \`j2\`.\`eliminacionProgramadaEn\` IS NULL
        AND (\`j2\`.\`id\` IS NOT NULL) AND (\`j1\`.\`id\` IS NOT NULL))
    OR ((\`j3\`.\`videoId\` IS NULL) AND \`Video\`.\`category\` IS NOT NULL)))
ORDER BY \`Video\`.\`createdAt\` DESC, \`Video\`.\`id\` DESC LIMIT 11`;

interface FilaPlan {
  table: string;
  type: string;
  key: string | null;
  Extra: string | null;
}

let prisma: PrismaClient;

const plan = () => prisma.$queryRawUnsafe<FilaPlan[]>(`EXPLAIN ${SQL_FEED}`);
const arrancaPor = (p: FilaPlan[]) => p[0]?.table ?? "?";
const hayFilesort = (p: FilaPlan[]) => p.some((r) => /filesort/i.test(r.Extra ?? ""));
const describir = (p: FilaPlan[]) =>
  p.map((r) => `${r.table}:${r.type}/${r.key ?? "NULL"}`).join(" ");

const analizar = async () => {
  for (const t of TABLAS)
    await prisma.$executeRawUnsafe(`ANALYZE TABLE \`${t}\` PERSISTENT FOR ALL`);
};

beforeAll(async () => {
  prisma = createTestPrisma();
  await resetDb(prisma);

  const autor = await crearUsuario(prisma, { username: "la_del_feed" });
  // Muchos usuarios SIN vídeos: son los que hacen atractivo (y equivocado) entrar por `User`.
  const otros: Array<{ id: string }> = [];
  for (let i = 0; i < USUARIOS; i += 1) {
    otros.push({ id: await crearUsuario(prisma, { username: `feed_${i}` }) });
  }

  const videos: Array<{
    id: string;
    userId: string;
    bunnyVideoId: string;
    status: "PUBLISHED";
    category: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const base = Date.UTC(2026, 0, 1);
  for (let i = 0; i < USUARIOS * VIDEOS_POR_USUARIO; i += 1) {
    videos.push({
      id: `vfeed${String(i).padStart(15, "0")}`,
      userId: i % 7 === 0 ? autor : otros[i % USUARIOS]!.id,
      bunnyVideoId: `bfeed-${i}`,
      status: "PUBLISHED",
      category: "fitness",
      createdAt: new Date(base + i * 60_000),
      updatedAt: new Date(base),
    });
  }
  await prisma.video.createMany({ data: videos });
  await analizar();
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("el feed entra por Video y no ordena nada", () => {
  it("arranca por `Video`, usa el índice del feed y NO hay filesort", async () => {
    const p = await plan();
    expect(arrancaPor(p), describir(p)).toBe("Video");
    expect(p[0]?.key, describir(p)).toBe(INDICE);
    expect(hayFilesort(p), describir(p)).toBe(false);
  });
});

describe("AUTOCOMPROBACIÓN: las dos piezas hacen falta", () => {
  it("sin ESTADÍSTICAS el plan se degrada, aunque el índice siga ahí", async () => {
    // Es el caso que más cuesta creer: el índice existe, está perfecto, y no se usa.
    try {
      for (const t of ["column_stats", "index_stats", "table_stats"]) {
        await prisma.$executeRawUnsafe(`DELETE FROM mysql.${t} WHERE db_name = DATABASE()`);
      }
      await prisma.$executeRawUnsafe("FLUSH TABLES");

      const p = await plan();
      expect(arrancaPor(p), `sin estadisticas: ${describir(p)}`).not.toBe("Video");
      expect(hayFilesort(p), `sin estadisticas: ${describir(p)}`).toBe(true);
    } finally {
      await analizar();
    }
    expect(arrancaPor(await plan())).toBe("Video");
  });

  it("sin el ÍNDICE el plan se degrada, aunque las estadísticas estén al día", async () => {
    try {
      await prisma.$executeRawUnsafe(`DROP INDEX \`${INDICE}\` ON \`Video\``);
      await analizar();

      const p = await plan();
      expect(hayFilesort(p), `sin indice: ${describir(p)}`).toBe(true);
    } finally {
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS \`${INDICE}\` ON \`Video\`(${COLUMNAS})`,
      );
      await analizar();
    }
    const p = await plan();
    expect(arrancaPor(p)).toBe("Video");
    expect(hayFilesort(p)).toBe(false);
  });
});

describe("y el índice está declarado en el esquema, no solo en la base", () => {
  it("existe el `@@index` con las cinco columnas en ese orden", async () => {
    // El plan de arriba pasaría con un índice creado a mano en la base de datos y ausente del
    // esquema: el despliegue siguiente se quedaría sin él y nadie lo notaría hasta que el feed
    // fuera lento otra vez.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const esquema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(esquema).toContain(
      "@@index([status, ocultoAutoEn, reemplazaSubmissionId, createdAt, id])",
    );
  });
});
