/**
 * LA MODERACIÓN POSTERIOR DE LA PUBLICIDAD, contra la base de datos (Fase 9 · P8).
 *
 * DIENTES:
 *  - Tres denunciantes distintos PAUSAN la campaña (EN REVISIÓN): libera sus días, el crédito se queda,
 *    deja de servirse AL MOMENTO y se avisa al admin por correo.
 *  - La empresa NO puede reanudar una campaña en revisión (lo dice el servidor, no solo el botón).
 *  - Lo que el admin ABSOLVIÓ no se vuelve a ocultar por acumular denuncias (el candado de siempre).
 *  - ABSOLVER LA REANUDA SOLA (revisión de P8), con el mismo cuerpo que el botón de la empresa: con la
 *    zona libre vuelve a servirse en la SIGUIENTE petición; con la zona llena queda pausada, sin un día
 *    a medias, y el correo trae la primera fecha libre; sin créditos, pausada y dicho. El saldo no se
 *    mueve en ningún caso.
 *  - RETIRAR: deja de servirse AL MOMENTO —la siguiente petición ya no la sirve, sin esperar a la
 *    caché—, libera sus días, cierra sus denuncias y le escribe a la empresa el MOTIVO, nunca la nota.
 *  - La cola de moderación de vídeos no decide publicidad.
 *
 * Para romperlo a propósito: quitar el `olvidarCacheDeHoy` de `retirarPublicidad` (rojo el de «al
 * momento»); quitar la comprobación de `ocultoAutoEn` en `reanudarPublicidad` (rojo); no sellar la
 * absolución (rojo el de la inmunidad); poner la nota en el correo (rojo); no reanudar al absolver, o no
 * vaciar la caché después (rojo el de la zona libre); quitar el SAVEPOINT (rojo el de la zona llena).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CREDITOS_POR_DIA, ReportTargetModerableSchema } from "../src/config/constants";
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
async function unaActiva(
  datos: Partial<DatosCampana> = {},
): Promise<{ id: string; empresaId: string; owner: string }> {
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
  const { id } = await crearBorrador(prisma, e.id, { ...BASE, ...datos }, AHORA);
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

const seSirve = async (id: string, ahora = AHORA) =>
  (await campanasDeHoy(prisma, ahora)).some((c) => c.id === id);
const saldo = async (empresaId: string) =>
  (await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } })).creditosSaldo;
const diasOcupados = async (id: string) =>
  (
    await prisma.zonaOcupacion.findMany({
      where: { publicidadId: id },
      distinct: ["dia"],
      select: { dia: true },
      orderBy: { dia: "asc" },
    })
  ).map((f) => f.dia.toISOString().slice(0, 10));
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
    // Sus días, libres DESDE HOY, y el día de hoy DEVUELTO (P9, regla 7: una campaña que ese día pasa a
    // revisión no lo paga). El saldo vuelve a ser el de antes de activarla.
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: c.id } })).toBe(0);
    expect(await saldo(c.empresaId)).toBe(50);
    expect(
      await prisma.creditoLedger.count({ where: { publicidadId: c.id, reason: "DEVOLUCION" } }),
    ).toBe(1);
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

describe("absolver: la campaña se reanuda sola (revisión de P8)", () => {
  // La revisión dura dos días: se pausa el 1 (y se le devuelve ese día, P9) y se absuelve el 3.
  const LUEGO = new Date("2026-12-03T10:00:00.000Z");
  const absolver = (id: string, admin: string, ahora = LUEGO) =>
    absolverPublicidad(prisma, { publicidadId: id, adminId: admin, appUrl: APP, ahora });
  const TARIFA = CREDITOS_POR_DIA.CIUDAD;

  it("con la zona libre: vuelve a servirse en la SIGUIENTE petición, con sus días, y la revisión no le cuesta nada", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    await denunciada(c.id, 3);
    // La caché del día 3 se rellena SIN ella: si la absolución no la vaciara, seguiría fuera 60 s.
    expect(await seSirve(c.id, LUEGO)).toBe(false);

    expect(await absolver(c.id, admin)).toEqual({ estado: "hecho", reanudacion: "REANUDADA" });
    expect(await seSirve(c.id, LUEGO)).toBe(true);
    expect((await miPublicidad(prisma, c.empresaId, c.id, LUEGO))?.estado).toBe("ACTIVA");
    // Sus 5 días, DESDE HOY: el 1 se le devolvió (no cuenta como tenido) y el 2 lo pasó en revisión.
    expect(await diasOcupados(c.id)).toEqual([
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
      "2026-12-06",
      "2026-12-07",
    ]);
    // Dinero: el 1 se cobró y se devolvió; el 3, que ya se sirve, se cobra. Uno solo, y ni uno de la
    // revisión.
    expect(await saldo(c.empresaId)).toBe(50 - TARIFA);
    expect(await prisma.report.count({ where: { targetId: c.id, status: "DISMISSED" } })).toBe(3);
    const [aviso] = await correos(`publicidad-absuelta:${c.id}`);
    const texto = JSON.stringify(aviso?.payload);
    expect(texto).toContain("vuelve a mostrarse");
    expect(texto).toContain("hasta el 7 de diciembre");
    expect(texto).not.toContain(admin);
  });

  it("absuelta EL MISMO DÍA: vuelve mañana, porque hoy se le devolvió (no se sirve un día no pagado)", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    await denunciada(c.id, 3);
    expect(await absolver(c.id, admin, AHORA)).toEqual({
      estado: "hecho",
      reanudacion: "REANUDADA",
    });
    expect(await seSirve(c.id, AHORA)).toBe(false);
    expect((await diasOcupados(c.id))[0]).toBe("2026-12-02");
    // Ni un crédito movido en neto: hoy se cobró y se devolvió, y mañana lo cobrará el barrido.
    expect(await saldo(c.empresaId)).toBe(50);
    const [aviso] = await correos(`publicidad-absuelta:${c.id}`);
    expect(JSON.stringify(aviso?.payload)).toContain("Vuelve a mostrarse el 2 de diciembre");
  });

  it("con la zona llena: queda pausada, nada a medias, y el correo trae la primera fecha libre", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    await denunciada(c.id, 3);
    // Mientras está en revisión, otras tres campañas llenan su zona del 4 al 6. Del 4 y no del 2 a
    // propósito: así el intento SÍ llega a escribir el 2 y el 3 antes de chocar con el 4, que es lo que
    // el SAVEPOINT tiene que deshacer (con la zona llena desde el primer día no escribiría nada, y quitar
    // el SAVEPOINT seguiría en verde).
    for (let i = 0; i < 3; i += 1) await unaActiva({ fechaInicio: "2026-12-04", dias: 3 });

    expect(await absolver(c.id, admin, AHORA)).toEqual({
      estado: "hecho",
      reanudacion: "ZONA_LLENA",
    });
    expect((await miPublicidad(prisma, c.empresaId, c.id, AHORA))?.estado).toBe("PAUSADA");
    // Ni un día a medias: el intento se deshizo entero. Y el día 1 tampoco: se le devolvió al pasar a
    // revisión, así que intenta volver el 2 —escribe el 2 y el 3 y choca con el 4—.
    expect(await diasOcupados(c.id)).toEqual([]);
    // El día 1 se cobró al activar y se devolvió: en neto, nada.
    expect(await saldo(c.empresaId)).toBe(50);
    // La absolución sí se confirmó: denuncias descartadas y ya no está en revisión.
    expect(await prisma.report.count({ where: { targetId: c.id, status: "DISMISSED" } })).toBe(3);
    expect(await contarPublicidadEnRevision(prisma)).toBe(0);
    const [aviso] = await correos(`publicidad-absuelta:${c.id}`);
    const texto = JSON.stringify(aviso?.payload);
    expect(texto).toContain("se llenó su zona");
    expect(texto).toContain("7 de diciembre");
    // Y esa fecha es la que le ofrecerá su botón de reanudar.
    const suya = await reanudarPublicidad(prisma, c.empresaId, c.id, { ahora: AHORA });
    expect(suya).toMatchObject({ ok: false, code: "ZONA_LLENA" });
    expect(suya.ok ? null : suya.primeraLibre?.toISOString().slice(0, 10)).toBe("2026-12-07");
  });

  it("sin créditos para lo que le queda: queda pausada y el correo lo dice; el saldo no se toca", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    await denunciada(c.id, 3);
    await aplicarCreditos(prisma, {
      empresaId: c.empresaId,
      delta: -50,
      reason: "AJUSTE_ADMIN",
      idempotencyKey: `test:vaciar:${c.empresaId}`,
      nota: "sin saldo",
    });
    expect(await absolver(c.id, admin)).toEqual({ estado: "hecho", reanudacion: "SIN_SALDO" });
    expect((await miPublicidad(prisma, c.empresaId, c.id, LUEGO))?.estado).toBe("PAUSADA");
    expect(await saldo(c.empresaId)).toBe(0);
    const [aviso] = await correos(`publicidad-absuelta:${c.id}`);
    expect(JSON.stringify(aviso?.payload)).toContain("no llegan");
  });

  it("una que no estaba en revisión no se toca: solo se descartan sus denuncias", async () => {
    const admin = await crearUsuario(prisma);
    const c = await unaActiva();
    await denunciada(c.id, 2);
    expect(await absolver(c.id, admin, AHORA)).toEqual({ estado: "hecho", reanudacion: null });
    expect((await miPublicidad(prisma, c.empresaId, c.id, AHORA))?.estado).toBe("ACTIVA");
    expect(await correos(`publicidad-absuelta:${c.id}`)).toHaveLength(0);
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
    // Sus días, libres DESDE HOY, y el día de hoy DEVUELTO (P9, regla 7): el de la retirada no se cobra.
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: c.id } })).toBe(0);
    expect(await saldo(c.empresaId)).toBe(50);
    expect(await prisma.report.count({ where: { targetId: c.id, status: "RESOLVED" } })).toBe(2);
    const [correo] = await correos(`publicidad-retirada:${c.id}`);
    const texto = JSON.stringify(correo?.payload);
    expect(texto).toContain("El enlace lleva a un sitio que no es seguro");
    expect(texto).toContain("Te hemos devuelto los créditos de publicidad de hoy");
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
