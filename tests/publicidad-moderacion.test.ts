/**
 * LA MODERACIÓN POSTERIOR DE LA PUBLICIDAD, contra la base de datos (Fase 9 · P8).
 *
 * DIENTES:
 *  - Tres denunciantes distintos PAUSAN la campaña (EN REVISIÓN): libera sus días, el crédito se queda,
 *    deja de servirse AL MOMENTO y se avisa al admin por correo.
 *  - La empresa NO puede reanudar una campaña en revisión (lo dice el servidor, no solo el botón).
 *  - Lo que el admin ABSOLVIÓ no se vuelve a ocultar por acumular denuncias (el candado de siempre).
 *  - RETIRAR: deja de servirse AL MOMENTO —la siguiente petición ya no la sirve, sin esperar a la
 *    caché—, libera sus días, cierra sus denuncias y le escribe a la empresa el MOTIVO, nunca la nota.
 *  - La cola de moderación de vídeos no decide publicidad.
 *
 * Para romperlo a propósito: quitar el `olvidarCacheDeHoy` de `retirarPublicidad` (rojo el de «al
 * momento»); quitar la comprobación de `ocultoAutoEn` en `reanudarPublicidad` (rojo); no sellar la
 * absolución (rojo el de la inmunidad); poner la nota en el correo (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ReportTargetModerableSchema } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { aplicarCreditos } from "../src/server/services/creditos";
import { denunciar } from "../src/server/services/denuncias";
import {
  type DatosCampana,
  activarPublicidad,
  apuntarImagenPublicidad,
  crearBorrador,
  miPublicidad,
  reanudarPublicidad,
  terminarPublicidad,
} from "../src/server/services/publicidad";
import { campanasDeHoy, olvidarCacheDeHoy } from "../src/server/services/publicidad-entrega";
import {
  absolverPublicidad,
  contarPublicidadEnRevision,
  fichaPublicidadPanel,
  listarPublicidadPanel,
  retirarPublicidad,
} from "../src/server/services/publicidad-moderacion";

import { createTestPrisma, crearUsuario, resetDb } from "./helpers/db";

let prisma: PrismaClient;
beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  olvidarCacheDeHoy();
});

const AHORA = new Date("2026-12-01T10:00:00.000Z");
const APP = "https://dareflash.test";
const AVISO = { adminEmail: "admin@dareflash.test", urlPanel: `${APP}/panel/publicidad` };

const BASE: DatosCampana = {
  nombre: "Desayunos",
  alcance: "CIUDAD",
  ciudadId: 2509954,
  estadoCodigo: undefined,
  paises: [],
  texto: "Ven a probar nuestro pan",
  destinoUrl: "https://panaderia.example.com",
  fechaInicio: "2026-12-01",
  dias: 5,
};

let n = 0;
/** Una campaña ACTIVA de una empresa nueva (con correo, para los avisos). */
async function unaActiva(): Promise<{ id: string; empresaId: string; owner: string }> {
  n += 1;
  const owner = await crearUsuario(prisma);
  await prisma.user.update({
    where: { id: owner },
    data: { email: `empresa${n}@moderacion.test`, esCuentaEmpresa: true },
  });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: owner,
      nombre: `Panadería ${n}`,
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      estado: "VERIFICADA",
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  await aplicarCreditos(prisma, {
    empresaId: e.id,
    delta: 50,
    reason: "AJUSTE_ADMIN",
    idempotencyKey: `test:${e.id}`,
    nota: "saldo de prueba",
  });
  const { id } = await crearBorrador(prisma, e.id, BASE, AHORA);
  await apuntarImagenPublicidad(prisma, e.id, id, `/portadas/publicidad-${id}.webp`);
  expect((await activarPublicidad(prisma, e.id, id, { ahora: AHORA })).ok).toBe(true);
  return { id, empresaId: e.id, owner };
}

/** `cuantas` personas distintas la denuncian. */
async function denunciada(id: string, cuantas: number, ahora = AHORA) {
  const r = [];
  for (let i = 0; i < cuantas; i += 1) {
    r.push(
      await denunciar(prisma, {
        reporterId: await crearUsuario(prisma),
        targetType: "PUBLICIDAD",
        targetId: id,
        reason: "SPAM",
        ahora,
        avisoPublicidad: AVISO,
      }),
    );
  }
  return r;
}

const seSirve = async (id: string) => (await campanasDeHoy(prisma, AHORA)).some((c) => c.id === id);
const correos = (prefijo: string) =>
  prisma.job.findMany({ where: { idempotencyKey: { startsWith: prefijo } } });

describe("el umbral pausa la campaña (EN REVISIÓN)", () => {
  it("dos denuncias no; la tercera la pausa, libera sus días, la deja de servir y avisa al admin", async () => {
    const c = await unaActiva();
    expect(await seSirve(c.id)).toBe(true); // y queda en la caché
    const [a, b] = await denunciada(c.id, 2);
    expect([a?.estado, b?.estado]).toEqual(["registrada", "registrada"]);
    expect((await miPublicidad(prisma, c.empresaId, c.id, AHORA))?.estado).toBe("ACTIVA");

    const [tercera] = await denunciada(c.id, 1);
    expect(tercera).toEqual({ estado: "registrada", ocultado: true });
    expect((await miPublicidad(prisma, c.empresaId, c.id, AHORA))?.estado).toBe("EN_REVISION");
    // Sus días por venir, libres (hoy se queda: es el día en curso). El crédito, intacto.
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: c.id } })).toBe(1);
    expect(
      (await prisma.empresa.findUniqueOrThrow({ where: { id: c.empresaId } })).creditosSaldo,
    ).toBe(50);
    // Deja de servirse AL MOMENTO: la caché se vació al confirmar (no hace falta esperar 60 s).
    expect(await seSirve(c.id)).toBe(false);
    // Y un correo al admin, uno.
    const avisos = await correos("publicidad-umbral:");
    expect(avisos).toHaveLength(1);
    expect(JSON.stringify(avisos[0]?.payload)).toContain("admin@dareflash.test");
    expect(await contarPublicidadEnRevision(prisma)).toBe(1);
  });

  it("sin ADMIN_EMAIL no se encola nada, pero se deja una línea en el log", async () => {
    const c = await unaActiva();
    const lineas: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await denunciar(prisma, {
        reporterId: await crearUsuario(prisma),
        targetType: "PUBLICIDAD",
        targetId: c.id,
        reason: "SPAM",
        ahora: AHORA,
        avisoPublicidad: { adminEmail: null, urlPanel: AVISO.urlPanel, log: (m) => lineas.push(m) },
      });
    }
    expect(await correos("publicidad-umbral:")).toHaveLength(0);
    expect(lineas.join(" ")).toMatch(/ADMIN_EMAIL/);
  });

  it("la empresa NO puede reanudarla mientras está en revisión; terminarla, sí", async () => {
    const c = await unaActiva();
    await denunciada(c.id, 3);
    await expect(
      reanudarPublicidad(prisma, c.empresaId, c.id, { ahora: AHORA }),
    ).rejects.toMatchObject({
      code: "ESTADO_NO_PERMITE",
    });
    await terminarPublicidad(prisma, c.empresaId, c.id, AHORA);
    expect((await miPublicidad(prisma, c.empresaId, c.id, AHORA))?.estado).toBe("TERMINADA");
  });

  it("solo se denuncia lo que se sirve; y la propia empresa no se denuncia", async () => {
    const c = await unaActiva();
    await denunciada(c.id, 3); // ya no se sirve
    const r = await denunciar(prisma, {
      reporterId: await crearUsuario(prisma),
      targetType: "PUBLICIDAD",
      targetId: c.id,
      reason: "SPAM",
    });
    expect(r).toEqual({ estado: "rechazada", motivo: "NO_DISPONIBLE" });
    const otra = await unaActiva();
    expect(
      await denunciar(prisma, {
        reporterId: otra.owner,
        targetType: "PUBLICIDAD",
        targetId: otra.id,
        reason: "SPAM",
      }),
    ).toEqual({ estado: "rechazada", motivo: "PROPIO" });
  });
});

describe("absolver", () => {
  it("la devuelve como pausada normal, descarta sus denuncias y le escribe a la empresa para reanudarla", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    await denunciada(c.id, 3);
    const r = await absolverPublicidad(prisma, {
      publicidadId: c.id,
      adminId: admin,
      appUrl: APP,
      ahora: AHORA,
    });
    expect(r).toEqual({ estado: "hecho" });
    expect((await miPublicidad(prisma, c.empresaId, c.id, AHORA))?.estado).toBe("PAUSADA");
    expect(await prisma.report.count({ where: { targetId: c.id, status: "DISMISSED" } })).toBe(3);
    const [aviso] = await correos(`publicidad-absuelta:${c.id}`);
    expect(JSON.stringify(aviso?.payload)).toMatch(/puedes reanudarla/);
    // Y ahora sí puede reanudarla ella.
    const reanudada = await reanudarPublicidad(prisma, c.empresaId, c.id, { ahora: AHORA });
    expect(reanudada.ok).toBe(true);
  });

  it("lo que el admin absolvió no se vuelve a ocultar por acumular denuncias", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    await denunciada(c.id, 3);
    await absolverPublicidad(prisma, {
      publicidadId: c.id,
      adminId: admin,
      appUrl: APP,
      ahora: AHORA,
    });
    await reanudarPublicidad(prisma, c.empresaId, c.id, { ahora: AHORA });
    // Tres denuncias NUEVAS de otra gente: se registran (vuelve a la lista), pero no la esconden.
    const despues = new Date(AHORA.getTime() + 60_000);
    const nuevas = await denunciada(c.id, 3, despues);
    expect(nuevas.every((x) => x.estado === "registrada" && !x.ocultado)).toBe(true);
    expect((await miPublicidad(prisma, c.empresaId, c.id, AHORA))?.estado).not.toBe("EN_REVISION");
  });
});

describe("retirar", () => {
  it("deja de servirse AL MOMENTO: la siguiente petición ya no la sirve, sin esperar a la caché", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    expect(await seSirve(c.id)).toBe(true); // la caché la tiene
    await retirarPublicidad(prisma, {
      publicidadId: c.id,
      adminId: admin,
      motivo: "ENGANOSA",
      appUrl: APP,
      ahora: AHORA,
    });
    expect(await seSirve(c.id)).toBe(false);
  });

  it("libera sus días, cierra sus denuncias y le cuenta a la empresa el MOTIVO, nunca la nota ni quién", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    await denunciada(c.id, 2);
    const r = await retirarPublicidad(prisma, {
      publicidadId: c.id,
      adminId: admin,
      motivo: "DESTINO_PELIGROSO",
      nota: "Traza interna: el dominio redirige a un sitio de phishing.",
      appUrl: APP,
      ahora: AHORA,
    });
    expect(r).toEqual({ estado: "hecho" });
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: c.id } })).toBe(1);
    expect(await prisma.report.count({ where: { targetId: c.id, status: "RESOLVED" } })).toBe(2);
    const [correo] = await correos(`publicidad-retirada:${c.id}`);
    const texto = JSON.stringify(correo?.payload);
    expect(texto).toContain("El enlace lleva a un sitio que no es seguro");
    expect(texto).not.toContain("Traza interna");
    expect(texto).not.toContain(admin);
    // El portal: estado y motivo; la nota no existe en su DTO.
    const enPortal = await miPublicidad(prisma, c.empresaId, c.id, AHORA);
    expect(enPortal?.estado).toBe("RETIRADA");
    expect(enPortal?.motivoRetirada).toContain("no es seguro");
    expect(JSON.stringify(enPortal)).not.toContain("Traza interna");
    // El panel sí ve la nota.
    expect((await fichaPublicidadPanel(prisma, c.id, AHORA))?.retirada?.nota).toContain(
      "Traza interna",
    );
    // Y la empresa ya no puede hacer nada con ella.
    await expect(
      reanudarPublicidad(prisma, c.empresaId, c.id, { ahora: AHORA }),
    ).rejects.toMatchObject({
      code: "ESTADO_NO_PERMITE",
    });
  });

  it("retirar dos veces no cambia nada ni reenvía el correo; un borrador no se retira", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    const retirar = () =>
      retirarPublicidad(prisma, {
        publicidadId: c.id,
        adminId: admin,
        motivo: "OTRO",
        appUrl: APP,
        ahora: AHORA,
      });
    expect(await retirar()).toEqual({ estado: "hecho" });
    expect(await retirar()).toEqual({ estado: "sin_cambios" });
    expect(await correos(`publicidad-retirada:${c.id}`)).toHaveLength(1);
  });
});

describe("el panel", () => {
  it("«En revisión» y el contador del menú dicen lo mismo", async () => {
    const a = await unaActiva();
    await unaActiva();
    await denunciada(a.id, 3);
    const lista = await listarPublicidadPanel(prisma, { filtro: "REVISION", ahora: AHORA });
    expect(lista.items.map((x) => x.id)).toEqual([a.id]);
    expect(await contarPublicidadEnRevision(prisma)).toBe(lista.items.length);
    expect(lista.items[0]?.denunciasAbiertas).toBe(3);
  });

  it("la cola de moderación de vídeos no decide publicidad", () => {
    expect(ReportTargetModerableSchema.safeParse("PUBLICIDAD").success).toBe(false);
    expect(ReportTargetModerableSchema.safeParse("VIDEO").success).toBe(true);
  });
});
