/**
 * EL RESUMEN DIARIO DEL ADMIN Y EL AVISO DE LA CASA (Fase 9 · P12), contra la base de datos.
 *
 * DIENTES (los del encargo):
 *  - Un día SIN novedades no se envía nada.
 *  - Dos ejecuciones el mismo día → UN correo (también si se pierde la marca del día: la clave lo para).
 *  - El aviso de la casa: cruzar el 80 % → un aviso; seguir arriba → ninguno más; bajar y volver a
 *    cruzar → otro. Con pocos huecos o sin datos, ni avisa ni rearma.
 * Y además: a partir de las 5 de Madrid y comparando el DÍA; sin ADMIN_EMAIL no se encola; el correo
 * lleva enlaces al panel y ni un id.
 *
 * Para romperlo a propósito: quitar `hayAlgoQueContar` (rojo el del día vacío); comparar con un
 * intervalo en vez de con el día, o quitar la clave del correo (rojo el de dos veces); llamar al aviso
 * sin histéresis (rojo el de seguir arriba).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CLAVE_RESUMEN_ADMIN } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { EmailAdapter, EmailMessage } from "../src/server/email/adapter";
import { altaEmpresaDesdeCero } from "../src/server/services/empresas";
import { claveHuecos } from "../src/server/services/publicidad-metricas";
import {
  componerResumen,
  hacerResumenDiario,
  tocaResumen,
} from "../src/server/services/resumen-admin";

import { createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
});

const APP = "https://dareflash.test";
const ADMIN = "admin@dareflash.test";
/** 10 de diciembre, 6:00 en Madrid (5:00 UTC, invierno). */
const DIA1 = new Date("2026-12-10T05:00:00.000Z");
const DIA1_TARDE = new Date("2026-12-10T15:00:00.000Z");
const DIA2 = new Date("2026-12-11T05:00:00.000Z");
const DIA3 = new Date("2026-12-12T05:00:00.000Z");
const DIA4 = new Date("2026-12-13T05:00:00.000Z");

function adaptador(): EmailAdapter & { enviados: EmailMessage[] } {
  const enviados: EmailMessage[] = [];
  return {
    name: "prueba",
    enviados,
    async send(m) {
      enviados.push(m);
    },
  };
}

/** Redis en memoria con los huecos de un día (lo único que lee el resumen de Redis). */
function redisCon(huecos: Record<string, Record<string, number>>) {
  return {
    async hgetall(k: string) {
      return Object.fromEntries(Object.entries(huecos[k] ?? {}).map(([c, v]) => [c, String(v)]));
    },
  };
}
/** Los huecos de AYER respecto a `ahora`: `total` decididos, `conCampana` con campaña. */
const huecosDeAyer = (ahora: Date, total: number, conCampana: number) => ({
  [claveHuecos(
    new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - 1)),
  )]: { "GLOBAL:t": total, "GLOBAL:c": conCampana },
});

const resumenes = () =>
  prisma.job.findMany({ where: { idempotencyKey: { startsWith: "resumen-admin:" } } });

async function unaEmpresaPendiente(email = "panaderia@test.test") {
  await altaEmpresaDesdeCero(
    prisma,
    {
      email,
      password: "Un4-Contrasena-Larga-Y-Buena!",
      terminosAceptadosEn: new Date(),
      nombre: "Panadería La Espiga",
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      paisIso: "ES",
      personaContacto: "Lucía",
      webUrl: "https://laespiga.test",
    },
    { adminEmail: null, urlPanel: `${APP}/panel/empresas`, appUrl: APP },
  );
}

const pasada = (
  ahora: Date,
  o: { adapter?: EmailAdapter; redis?: ReturnType<typeof redisCon> | null; admin?: string } = {},
) =>
  hacerResumenDiario(prisma, {
    redis: o.redis ?? null,
    adapter: o.adapter ?? adaptador(),
    adminEmail: o.admin === undefined ? ADMIN : o.admin,
    appUrl: APP,
    ahora,
  });

describe("cuándo toca", () => {
  it("desde las 5 de Madrid, una vez por DÍA de Madrid (también con el cambio de hora)", () => {
    expect(tocaResumen(new Date("2026-12-10T03:59:00.000Z"), null)).toBe(false); // 4:59 Madrid
    expect(tocaResumen(new Date("2026-12-10T04:00:00.000Z"), null)).toBe(true); // 5:00 Madrid
    expect(tocaResumen(new Date("2026-12-10T22:00:00.000Z"), "2026-12-10")).toBe(false);
    expect(tocaResumen(new Date("2026-12-10T23:30:00.000Z"), "2026-12-10")).toBe(false); // 0:30 → antes de las 5
    // En verano, las 5 de Madrid son las 3 UTC.
    expect(tocaResumen(new Date("2027-07-10T03:00:00.000Z"), "2027-07-09")).toBe(true);
    expect(tocaResumen(new Date("2027-07-10T02:59:00.000Z"), "2027-07-09")).toBe(false);
  });
});

describe("el resumen", () => {
  it("un día SIN novedades no se envía, y queda hecho (no se recalcula en cada vuelta)", async () => {
    expect(await pasada(DIA1)).toMatchObject({
      estado: "hecho",
      enviado: false,
      motivo: "NADA_QUE_CONTAR",
    });
    expect(await resumenes()).toHaveLength(0);
    expect(await pasada(DIA1_TARDE)).toEqual({ estado: "no_toca" });
  });

  it("con novedades, UN correo; dos ejecuciones el mismo día → uno; al día siguiente, otro", async () => {
    await unaEmpresaPendiente();
    expect(await pasada(DIA1)).toMatchObject({ enviado: true, motivo: "ENCOLADO" });
    expect(await pasada(DIA1_TARDE)).toEqual({ estado: "no_toca" });
    expect(await resumenes()).toHaveLength(1);
    await pasada(DIA2);
    expect(await resumenes()).toHaveLength(2);
  });

  it("aunque se pierda la marca del día (un reinicio a media pasada), la clave del correo lo para", async () => {
    await unaEmpresaPendiente();
    await pasada(DIA1);
    await prisma.systemState.delete({ where: { key: CLAVE_RESUMEN_ADMIN } });
    await pasada(DIA1_TARDE);
    expect(await resumenes()).toHaveLength(1);
  });

  it("lleva sus enlaces al panel y ni un id; va a ADMIN_EMAIL", async () => {
    await unaEmpresaPendiente();
    await pasada(DIA1);
    const [job] = await resumenes();
    const p = job?.payload as unknown as EmailMessage;
    expect(p.to).toBe(ADMIN);
    expect(p.subject).toBe("DareFlash: resumen del 9 de diciembre");
    expect(p.text).toContain("1 empresa espera verificación");
    expect(p.text).toContain(`${APP}/panel/empresas?estado=PENDIENTE`);
    const empresa = await prisma.empresa.findFirstOrThrow({ select: { id: true } });
    expect(JSON.stringify(p)).not.toContain(empresa.id);
    expect(JSON.stringify(p)).not.toContain("panaderia@test.test");
  });

  it("sin ADMIN_EMAIL no se encola nada (y el día queda hecho)", async () => {
    await unaEmpresaPendiente();
    expect(await pasada(DIA1, { admin: "" })).toMatchObject({ motivo: "SIN_DESTINATARIO" });
    expect(await resumenes()).toHaveLength(0);
  });

  it("puro: los huecos solos no son novedad; la línea de huecos sale por espacio", () => {
    const c = componerResumen(
      {
        pendientes: { empresas: 0, propuestas: 0, enRevision: 0 },
        denunciadas: { campanas: 2, denuncias: 3 },
        ayer: { activadas: 1, compras: 1, creditosComprados: 30, vecesMostrada: 1200, clics: 9 },
        huecos: { LOCAL: { total: 400, conCampana: 100 }, GLOBAL: { total: 0, conCampana: 0 } },
      },
      APP,
      new Date("2026-12-09T00:00:00.000Z"),
    );
    expect(c.lineas.join("\n")).toContain(
      "2 campañas tienen denuncias sin llegar al umbral (3 denuncias)",
    );
    expect(c.lineas.join("\n")).toContain("1 compra de créditos (30 créditos)");
    expect(c.lineas.join("\n")).toContain("local 75 % de 400");
    expect(c.lineas.join("\n")).not.toContain("global");
  });
});

describe("el aviso de la casa, con histéresis", () => {
  it("cruzar → uno; seguir arriba → ninguno; bajar → se rearma sin correo; volver a cruzar → otro", async () => {
    const a = adaptador();
    // Día 1: 300 huecos, 20 con campaña → 93 % sin campaña: cruza.
    expect(
      await pasada(DIA1, { adapter: a, redis: redisCon(huecosDeAyer(DIA1, 300, 20)) }),
    ).toMatchObject({
      avisoCasa: true,
    });
    // Día 2: sigue arriba → nada.
    await pasada(DIA2, { adapter: a, redis: redisCon(huecosDeAyer(DIA2, 300, 10)) });
    // Día 3: baja (50 % sin campaña) → se rearma, sin correo.
    await pasada(DIA3, { adapter: a, redis: redisCon(huecosDeAyer(DIA3, 300, 150)) });
    expect(a.enviados).toHaveLength(1);
    // Día 4: vuelve a cruzar → otro.
    await pasada(DIA4, { adapter: a, redis: redisCon(huecosDeAyer(DIA4, 300, 0)) });
    expect(a.enviados).toHaveLength(2);
    expect(a.enviados[0]?.to).toBe(ADMIN);
    expect(a.enviados[0]?.text).toContain("no es una avería");
    expect(a.enviados[0]?.text).toContain(`${APP}/panel/publicidad?filtro=ACTIVAS`);
  });

  it("con pocos huecos, o sin datos, ni avisa ni rearma", async () => {
    const a = adaptador();
    await pasada(DIA1, { adapter: a, redis: redisCon(huecosDeAyer(DIA1, 300, 0)) });
    // Pocos huecos (y todos sin campaña) → no se evalúa: ni otro aviso ni se rearma.
    await pasada(DIA2, { adapter: a, redis: redisCon(huecosDeAyer(DIA2, 20, 20)) });
    await pasada(DIA3, { adapter: a, redis: null });
    await pasada(DIA4, { adapter: a, redis: redisCon(huecosDeAyer(DIA4, 300, 0)) });
    // Seguía disparado: el día 4 no vuelve a avisar.
    expect(a.enviados).toHaveLength(1);
  });

  it("sin ADMIN_EMAIL el aviso no sale y NO se marca: en cuanto haya destinatario, sale", async () => {
    const a = adaptador();
    await pasada(DIA1, { adapter: a, admin: "", redis: redisCon(huecosDeAyer(DIA1, 300, 0)) });
    expect(a.enviados).toHaveLength(0);
    await pasada(DIA2, { adapter: a, redis: redisCon(huecosDeAyer(DIA2, 300, 0)) });
    expect(a.enviados).toHaveLength(1);
  });
});
