/**
 * RETOS PATROCINADOS PROPUESTOS DESDE EL PORTAL (Fase 9 · P3), contra la base de datos de verdad.
 *
 * Lo que se fija:
 *  1. EL DIENTE DEL PLAN: una propuesta sin aprobar NO aparece en NINGUNA consulta pública de retos
 *     (listado, próximos, cerrados, detalle, buscador). Y lo que lo garantiza —que es otra tabla— se
 *     vigila: ningún fichero de `src/` fuera del servicio de propuestas lee `retoSolicitud`.
 *  2. QUIÉN PUEDE PROPONER: solo una empresa VERIFICADA, con tope de pendientes, y el admin se entera
 *     en el acto (un correo, uno solo, en la misma transacción que la fila).
 *  3. APROBAR: nace un BORRADOR patrocinado con la marca y el `empresaId`; no se publica solo; el
 *     doble clic —y tres aprobaciones A LA VEZ— crean un único reto; una propuesta vencida no se
 *     aprueba. RECHAZAR: el motivo llega a la empresa, la nota nunca.
 *  4. EL ÁMBITO: cada empresa ve SUS propuestas y SU extracto; el DTO del dueño, con igualdad exacta
 *     de claves; el extracto es la misma consulta que el panel y cuadra con él.
 *  5. LA RUTA: Origin + sesión + CSRF de verdad; un participante recibe 404, una empresa sin
 *     verificar 409, y el `empresaId` del cuerpo no lo lee nadie.
 *
 * Para romperlo a propósito: hacer que `aprobarSolicitudReto` cree el reto PUBLISHED (rojo el 1 y el
 * 3); quitar el estado del `WHERE` que la reclama (rojo el doble clic y la concurrencia); quitar el
 * `empresaId` de `misSolicitudesReto` o del extracto (rojo el 4); añadir `notaInterna` al DTO del
 * dueño (rojo la igualdad de claves); quitar `cuentaEmpresa: "permite"` de la ruta (rojo el 5).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import { issueCsrfToken } from "../src/server/auth/csrf";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

const SECRET = "TEST-FIXTURE-empresa-retos-secret-suficientemente-largo";
const APP_URL = "http://test.local";
const PORTADAS_DIR = mkdtempSync(path.join(tmpdir(), "df-propuestas-"));

const H = vi.hoisted(() => ({
  prisma: null as unknown as PrismaClient,
  sesion: null as unknown,
}));
vi.mock("@/server/db/client", () => ({
  get prisma() {
    return H.prisma;
  },
}));
vi.mock("@/config/env", () => ({
  env: { APP_URL, AUTH_SECRET: SECRET, PORTADAS_DIR, ADMIN_EMAIL: "admin@dareflash.test" },
}));
vi.mock("@/server/auth/current-user", () => ({ getCurrentUser: async () => H.sesion }));

const svc = await import("../src/server/services/retos-empresa");
const { publicarReto } = await import("../src/server/services/retos-admin");
const pub = await import("../src/server/services/retos-publico");
const { buscarRetos } = await import("../src/server/services/buscar");
const { listarPatrocinios, totalesPatrocinios, TODAS_LAS_MARCAS } =
  await import("../src/server/services/patrocinios");
const { POST: PROPONER } = await import("../src/app/api/empresa/retos/route");

let prisma: PrismaClient;
let admin: string;

beforeAll(() => {
  prisma = createTestPrisma();
  H.prisma = prisma;
});
afterAll(async () => {
  await prisma.$disconnect();
  rmSync(PORTADAS_DIR, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetDb(prisma);
  H.sesion = null;
  admin = await crearUsuario(prisma, { username: "admin_propuestas" });
});

const AHORA = new Date("2026-11-05T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

/** Una empresa con su cuenta. `estado` decide si puede proponer. */
async function unaEmpresa(nombre: string, estado = "VERIFICADA") {
  const userId = await crearUsuario(prisma);
  const email = `${nombre.toLowerCase().replace(/\W+/g, "")}@empresa.test`;
  await prisma.user.update({ where: { id: userId }, data: { email, esCuentaEmpresa: true } });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: userId,
      nombre,
      tipoCuenta: "EMPRESA",
      tipoNegocio: "FISICO",
      estado,
      paisIso: "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  return { empresaId: e.id, userId, email };
}

/** Lo que llega del formulario, SIN parsear (la salida del esquema no es una entrada válida). */
const entrada = (over: Record<string, unknown> = {}) => ({
  title: "Patrocinazo de verano",
  category: "fitness",
  prizeAmountCents: 5000,
  startsAt: new Date(AHORA.getTime() + DIA),
  deadline: new Date(AHORA.getTime() + 10 * DIA),
  winnersCount: 1,
  ...over,
});
const datos = (over: Record<string, unknown> = {}) =>
  svc.solicitudRetoSchema(AHORA).parse(entrada(over));

const SIN_AVISO = { adminEmail: null, urlPanel: `${APP_URL}/panel/propuestas` };

async function proponer(empresaId: string, over: Record<string, unknown> = {}) {
  return (
    await svc.crearSolicitudReto(prisma, {
      empresaId,
      datos: datos(over),
      aviso: SIN_AVISO,
      ahora: AHORA,
    })
  ).id;
}

const aprobar = (solicitudId: string, ahora = AHORA) =>
  svc.aprobarSolicitudReto(prisma, { solicitudId, actorId: admin, appUrl: APP_URL, ahora });

/**
 * Lo que el público puede ver de los retos, PUERTA A PUERTA. Por puerta y no en una lista aplanada:
 * aplanado, un caso positivo pasaría en cuanto UNA puerta lo enseñe, y uno negativo no distinguiría
 * "no sale" de "esta puerta ni se ha consultado bien".
 */
async function loQueVeElPublico() {
  // Más allá del cierre de los retos de prueba, para que la puerta de CERRADOS pueda enseñarlos.
  const lejos = new Date(AHORA.getTime() + 30 * DIA);
  const [abiertos, proximos, cerrados, buscador] = await Promise.all([
    pub.listarRetosPublicos(prisma, AHORA),
    pub.listarRetosProximos(prisma, AHORA),
    pub.listarRetosCerrados(prisma, lejos),
    buscarRetos(prisma, "Patrocinazo", null),
  ]);
  return {
    abiertos: abiertos.map((r) => r.titulo),
    proximos: proximos.map((r) => r.titulo),
    cerrados: cerrados.items.map((r) => r.titulo),
    buscador: buscador.items.map((r) => r.title),
  };
}
const NADA = { abiertos: [], proximos: [], cerrados: [], buscador: [] };

// ---------------------------------------------------------------------------------------------------
// 1. El diente del plan
// ---------------------------------------------------------------------------------------------------

describe("una propuesta sin aprobar no aparece en ninguna consulta pública", () => {
  it("pendiente, rechazada o aprobada-en-borrador: el público no ve nada", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const pendiente = await proponer(empresaId, { title: "Patrocinazo pendiente" });
    const rechazada = await proponer(empresaId, { title: "Patrocinazo rechazado" });
    await svc.rechazarSolicitudReto(prisma, {
      solicitudId: rechazada,
      actorId: admin,
      motivo: "DUPLICADA",
      appUrl: APP_URL,
      ahora: AHORA,
    });
    const aprobada = await proponer(empresaId, { title: "Patrocinazo aprobado" });
    const r = await aprobar(aprobada);
    expect(r.estado).toBe("aprobada");
    expect(pendiente).toBeTruthy();

    expect(await loQueVeElPublico()).toEqual(NADA);
    // Ni por su código: el borrador no tiene página pública.
    if (r.estado === "aprobada") {
      expect(await pub.retoPublicoPorCode(prisma, r.publicCode)).toBeNull();
    }
  });

  it("y SOLO cuando el admin lo publica, sale — con la marca de la empresa", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const r = await aprobar(await proponer(empresaId));
    if (r.estado !== "aprobada") throw new Error("no se aprobó");
    await publicarReto(prisma, r.challengeId, AHORA);

    // Abre mañana: a esta hora es PRÓXIMO (no abierto), y el buscador lo encuentra. Dos puertas
    // distintas, comprobadas por separado.
    const visto = await loQueVeElPublico();
    expect(visto.proximos).toEqual(["Patrocinazo de verano"]);
    expect(visto.buscador).toEqual(["Patrocinazo de verano"]);
    const detalle = await pub.retoPublicoPorCode(prisma, r.publicCode);
    expect(detalle?.titulo).toBe("Patrocinazo de verano");
    expect(detalle?.sponsor).toEqual({ nombre: "Panadería La Espiga", logo: null });
  });

  it("estructural: ningún fichero de src/ fuera del servicio de propuestas lee `retoSolicitud`", () => {
    const raiz = path.resolve(__dirname, "..", "src");
    const fuentes = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) return n === "generated" ? [] : fuentes(p);
        return /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    const soloCodigo = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const lectores = fuentes(raiz)
      .filter((f) => /\.retoSolicitud\./.test(soloCodigo(readFileSync(f, "utf8"))))
      .map((f) => path.relative(raiz, f).split(path.sep).join("/"));
    // Si esto falla con un fichero nuevo: si es PÚBLICO, la propuesta acaba de volverse visible;
    // si es del portal o del panel, que pase por `retos-empresa` en vez de leer la tabla.
    expect(lectores).toEqual(["server/services/retos-empresa.ts"]);
  });
});

// ---------------------------------------------------------------------------------------------------
// 2. Quién puede proponer, y el aviso al admin
// ---------------------------------------------------------------------------------------------------

describe("proponer", () => {
  it("una empresa sin verificar no puede: ni fila, ni aviso", async () => {
    const { empresaId } = await unaEmpresa("Pendiente SL", "PENDIENTE");
    await expect(proponer(empresaId)).rejects.toMatchObject({ code: "NO_VERIFICADA" });
    expect(await prisma.retoSolicitud.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
  });

  it("con el tope de pendientes alcanzado, la siguiente se rechaza", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const { RETO_SOLICITUDES_PENDIENTES_MAX } = await import("../src/config/constants");
    for (let i = 0; i < RETO_SOLICITUDES_PENDIENTES_MAX; i += 1) await proponer(empresaId);
    await expect(proponer(empresaId)).rejects.toMatchObject({ code: "DEMASIADAS_PENDIENTES" });
    // Decidir una libera el hueco.
    const [una] = await prisma.retoSolicitud.findMany({ select: { id: true } });
    await svc.rechazarSolicitudReto(prisma, {
      solicitudId: una!.id,
      actorId: admin,
      motivo: "DUPLICADA",
      appUrl: APP_URL,
    });
    await expect(proponer(empresaId)).resolves.toBeTruthy();
  });

  it("el admin se entera: EXACTAMENTE un correo, con su clave, y nada que el panel proteja", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const { id } = await svc.crearSolicitudReto(prisma, {
      empresaId,
      datos: datos(),
      aviso: { adminEmail: "admin@dareflash.test", urlPanel: `${APP_URL}/panel/propuestas` },
      ahora: AHORA,
    });
    const jobs = await prisma.job.findMany();
    expect(jobs.map((j) => j.idempotencyKey)).toEqual([svc.claveAvisoRetoPropuesto(id)]);
    const p = jobs[0]!.payload as { to: string; text: string };
    expect(p.to).toBe("admin@dareflash.test");
    expect(p.text).toContain("Panadería La Espiga");
    expect(p.text).toContain("Patrocinazo de verano");
    expect(p.text).toContain(`${APP_URL}/panel/propuestas`);
  });

  it("sin destinatario configurado: la propuesta se guarda, nadie recibe nada y queda en el log", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const log = vi.fn();
    await svc.crearSolicitudReto(prisma, {
      empresaId,
      datos: datos(),
      aviso: { ...SIN_AVISO, log },
      ahora: AHORA,
    });
    expect(await prisma.retoSolicitud.count()).toBe(1);
    expect(await prisma.job.count()).toBe(0);
    expect(log).toHaveBeenCalledOnce();
  });

  it("lo de DareFlash no se propone, y sin premio no hay patrocinio", () => {
    // Una comisión o un nivel en el cuerpo NO llegan a los datos: el esquema no los tiene.
    const d = svc.solicitudRetoSchema(AHORA).parse({
      ...entrada(),
      comisionBps: 0,
      nivelMinimo: "legend",
      soloVip: "1",
      esPatrocinado: "0",
      sponsorNombre: "Otra marca",
      empresaId: "otra",
    });
    expect(Object.keys(d).sort()).toEqual(
      [
        "category",
        "deadline",
        "description",
        "prizeAmountCents",
        "rules",
        "startsAt",
        "title",
        "winnersCount",
      ].sort(),
    );
    // El control primero: la MISMA entrada con premio pasa. Sin él, el «false» de abajo podría
    // venir de cualquier otro campo y el test pasaría sin medir el premio.
    expect(svc.solicitudRetoSchema(AHORA).safeParse(entrada()).success).toBe(true);
    const sinPremio = svc.solicitudRetoSchema(AHORA).safeParse(entrada({ prizeAmountCents: 0 }));
    expect(sinPremio.success).toBe(false);
    expect(sinPremio.error?.issues[0]?.path).toEqual(["prizeAmountCents"]);
  });
});

// ---------------------------------------------------------------------------------------------------
// 3. Aprobar y rechazar
// ---------------------------------------------------------------------------------------------------

describe("aprobar", () => {
  it("nace un BORRADOR patrocinado, con la marca, el logo y el empresaId de la propuesta", async () => {
    const { empresaId, email } = await unaEmpresa("Panadería La Espiga");
    const id = await proponer(empresaId);
    await svc.apuntarLogoSolicitud(prisma, {
      empresaId,
      solicitudId: id,
      url: "/portadas/propuesta-x-sponsor.webp?v=1",
    });
    const r = await aprobar(id);
    if (r.estado !== "aprobada") throw new Error("no se aprobó");

    const c = await prisma.challenge.findUniqueOrThrow({ where: { id: r.challengeId } });
    const { COMISION_SPONSOR_BPS_DEFECTO } = await import("../src/config/constants");
    expect(c).toMatchObject({
      status: "DRAFT",
      esPatrocinado: true,
      sponsorNombre: "Panadería La Espiga",
      sponsorLogo: "/portadas/propuesta-x-sponsor.webp?v=1",
      empresaId,
      prizeAmountCents: 5000,
      comisionBps: COMISION_SPONSOR_BPS_DEFECTO,
      createdById: admin,
    });
    const s = await prisma.retoSolicitud.findUniqueOrThrow({ where: { id } });
    expect(s).toMatchObject({ estado: "APROBADA", challengeId: c.id, revisadaPor: admin });

    // Un correo a la empresa, atado a SU fila de AuditLog.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "RETO_SOLICITUD_APROBAR", targetId: id },
    });
    const [job] = await prisma.job.findMany({
      where: { idempotencyKey: `reto-decision:${audit.id}` },
    });
    expect((job?.payload as { to: string }).to).toBe(email);
  });

  it("dos veces: un reto y un correo (la segunda no es un hecho)", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const id = await proponer(empresaId);
    await aprobar(id);
    expect(await aprobar(id)).toEqual({ estado: "sin_cambios" });
    expect(await prisma.challenge.count()).toBe(1);
    expect(
      await prisma.job.count({ where: { idempotencyKey: { startsWith: "reto-decision:" } } }),
    ).toBe(1);
  });

  it("tres aprobaciones A LA VEZ crean UN solo reto", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const id = await proponer(empresaId);
    const r = await Promise.allSettled([aprobar(id), aprobar(id), aprobar(id)]);
    const aprobadas = r.filter((x) => x.status === "fulfilled" && x.value.estado === "aprobada");
    expect(aprobadas).toHaveLength(1);
    expect(await prisma.challenge.count()).toBe(1);
  });

  it("una propuesta cuyo cierre ya pasó no se aprueba, y sigue pendiente", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const id = await proponer(empresaId);
    const despues = new Date(AHORA.getTime() + 11 * DIA);
    expect(await aprobar(id, despues)).toEqual({ estado: "rechazada", motivo: "CIERRE_PASADO" });
    expect(await prisma.challenge.count()).toBe(0);
    expect((await prisma.retoSolicitud.findUniqueOrThrow({ where: { id } })).estado).toBe(
      "PENDIENTE",
    );
  });
});

describe("rechazar", () => {
  it("el motivo llega a la empresa y la nota NUNCA; dos veces, un correo", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const id = await proponer(empresaId);
    const base = {
      solicitudId: id,
      actorId: admin,
      motivo: "FECHAS_NO_VIABLES" as const,
      nota: "Traza interna: el verano está lleno.",
      appUrl: APP_URL,
    };
    expect(await svc.rechazarSolicitudReto(prisma, base)).toEqual({ rechazada: true });
    expect(await svc.rechazarSolicitudReto(prisma, base)).toEqual({ rechazada: false });

    const jobs = await prisma.job.findMany({
      where: { idempotencyKey: { startsWith: "reto-decision:" } },
    });
    expect(jobs).toHaveLength(1);
    const texto = JSON.stringify(jobs[0]!.payload);
    expect(texto).toContain("Las fechas no nos dan tiempo");
    expect(texto).not.toContain("Traza interna");
    expect(texto).not.toContain(admin);
  });

  it("una aprobada ya no se puede rechazar (ni al revés)", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const id = await proponer(empresaId);
    await aprobar(id);
    expect(
      await svc.rechazarSolicitudReto(prisma, {
        solicitudId: id,
        actorId: admin,
        motivo: "DUPLICADA",
        appUrl: APP_URL,
      }),
    ).toEqual({ rechazada: false });
    expect((await prisma.retoSolicitud.findUniqueOrThrow({ where: { id } })).estado).toBe(
      "APROBADA",
    );
  });
});

// ---------------------------------------------------------------------------------------------------
// 4. El ámbito
// ---------------------------------------------------------------------------------------------------

describe("cada empresa ve lo suyo", () => {
  it("sus propuestas, y ninguna de otra", async () => {
    const a = await unaEmpresa("Empresa A");
    const b = await unaEmpresa("Empresa B");
    const deA = await proponer(a.empresaId, { title: "Reto de A" });
    await proponer(b.empresaId, { title: "Reto de B" });
    const vistas = await svc.misSolicitudesReto(prisma, a.empresaId);
    expect(vistas.items.map((s) => s.id)).toEqual([deA]);
  });

  it("el DTO del dueño: ni la nota interna ni quién decidió (igualdad exacta de claves)", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const id = await proponer(empresaId);
    await svc.rechazarSolicitudReto(prisma, {
      solicitudId: id,
      actorId: admin,
      motivo: "DATOS_INSUFICIENTES",
      nota: "secreto del equipo",
      appUrl: APP_URL,
    });
    const [s] = (await svc.misSolicitudesReto(prisma, empresaId)).items;
    expect(Object.keys(s!).sort()).toEqual(
      [
        "aperturaMs",
        "categoria",
        "cierreMs",
        "creadaMs",
        "estado",
        "ganadores",
        "id",
        "motivoRechazo",
        "premioCents",
        "reto",
        "titulo",
      ].sort(),
    );
    expect(JSON.stringify(s)).not.toContain("secreto del equipo");
    expect(JSON.stringify(s)).not.toContain(admin);
    expect(s!.estado).toBe("RECHAZADA");
  });

  it("el estado que ve: en revisión, aprobada (borrador) y publicada con su enlace", async () => {
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const id = await proponer(empresaId);
    const ver = async () => (await svc.misSolicitudesReto(prisma, empresaId)).items[0]!;
    expect((await ver()).estado).toBe("EN_REVISION");
    const r = await aprobar(id);
    expect(await ver()).toMatchObject({ estado: "APROBADA", reto: null });
    if (r.estado !== "aprobada") throw new Error("no se aprobó");
    await publicarReto(prisma, r.challengeId, AHORA);
    expect((await ver()).estado).toBe("PUBLICADA");
    expect((await ver()).reto?.publicCode).toBe(r.publicCode);
  });

  it("no apunta un logo en la propuesta de OTRA empresa", async () => {
    const a = await unaEmpresa("Empresa A");
    const b = await unaEmpresa("Empresa B");
    const deB = await proponer(b.empresaId);
    expect(
      await svc.apuntarLogoSolicitud(prisma, {
        empresaId: a.empresaId,
        solicitudId: deB,
        url: "/portadas/intruso.webp",
      }),
    ).toBe(false);
    expect(
      (await prisma.retoSolicitud.findUniqueOrThrow({ where: { id: deB } })).sponsorLogo,
    ).toBeNull();
  });

  it("el extracto: SUS retos, y cuadra con el panel por construcción", async () => {
    const a = await unaEmpresa("Empresa A");
    const b = await unaEmpresa("Empresa B");
    await aprobar(await proponer(a.empresaId, { prizeAmountCents: 10000 }));
    await aprobar(await proponer(a.empresaId, { prizeAmountCents: 3333 }));
    await aprobar(await proponer(b.empresaId, { prizeAmountCents: 7000 }));

    const deA = await listarPatrocinios(prisma, { empresaId: a.empresaId });
    const totA = await totalesPatrocinios(prisma, { empresaId: a.empresaId });
    expect(deA.filas.map((f) => f.marca)).toEqual(["Empresa A", "Empresa A"]);
    // El total (agregado en SQL) es la suma de SUS filas (calculadas en TS): mismo redondeo.
    expect(totA.totalCents).toBe(deA.filas.reduce((s, f) => s + f.totalCents, 0));
    expect(totA.retos).toBe(2);

    // Y lo que ve A es EXACTAMENTE lo que el panel tiene de A.
    const panel = await listarPatrocinios(prisma, TODAS_LAS_MARCAS);
    expect(panel.filas.filter((f) => f.marca === "Empresa A")).toEqual(deA.filas);
    const totTodas = await totalesPatrocinios(prisma, TODAS_LAS_MARCAS);
    const totB = await totalesPatrocinios(prisma, { empresaId: b.empresaId });
    expect(totA.totalCents + totB.totalCents).toBe(totTodas.totalCents);
  });
});

describe("censo del servicio: lo que opera sobre UNA empresa recibe su `empresaId`, obligatorio", () => {
  const fuente = readFileSync(
    path.resolve(__dirname, "..", "src", "server", "services", "retos-empresa.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const exportadas = [...fuente.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]!);
  const firma = (n: string) => {
    const i = fuente.indexOf(`function ${n}(`);
    return fuente.slice(i, fuente.indexOf("{\n", fuente.indexOf(")", i)));
  };

  /** ambito = de UNA empresa; panel = la cola entera (decide por id de propuesta, solo ADMIN). */
  const CLASIFICADAS: Record<string, "esquema" | "clave" | "ambito" | "panel"> = {
    solicitudRetoSchema: "esquema",
    claveAvisoRetoPropuesto: "clave",
    crearSolicitudReto: "ambito",
    apuntarLogoSolicitud: "ambito",
    misSolicitudesReto: "ambito",
    filtroSolicitudesReto: "panel",
    contarSolicitudesReto: "panel",
    listarSolicitudesReto: "panel",
    aprobarSolicitudReto: "panel",
    rechazarSolicitudReto: "panel",
  };

  it("toda función exportada está clasificada", () => {
    expect(exportadas.filter((n) => !(n in CLASIFICADAS))).toEqual([]);
  });

  it("las de ámbito reciben `empresaId` y NO opcional; ninguna busca por `userId`", () => {
    for (const [n, clase] of Object.entries(CLASIFICADAS)) {
      expect(firma(n), `${n} busca por userId`).not.toMatch(/\buserId\b/);
      if (clase !== "ambito") continue;
      expect(firma(n), `${n} no recibe empresaId`).toMatch(/empresaId/);
      expect(firma(n), `${n} lo recibe opcional`).not.toMatch(/empresaId\?/);
    }
  });

  it("el extracto exige su alcance: `listarPatrocinios` y `totalesPatrocinios`, sin `?`", () => {
    const p = readFileSync(
      path.resolve(__dirname, "..", "src", "server", "services", "patrocinios.ts"),
      "utf8",
    );
    expect(p).toMatch(/listarPatrocinios\(\s*db: PrismaClient,\s*alcance: AlcancePatrocinios,/);
    expect(p).toMatch(/totalesPatrocinios\(\s*db: PrismaClient,\s*alcance: AlcancePatrocinios,/);
  });
});

// ---------------------------------------------------------------------------------------------------
// 5. La ruta, de verdad
// ---------------------------------------------------------------------------------------------------

describe("POST /api/empresa/retos", () => {
  const campos = (over: Record<string, string> = {}) => ({
    title: "Patrocinazo por la ruta",
    category: "fitness",
    prizeAmountCents: "5000",
    startsAt: "2999-01-01T00:00:00.000Z",
    deadline: "2999-02-01T00:00:00.000Z",
    winnersCount: "1",
    ...over,
  });
  const pedir = (sessionId: string, data: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) fd.set(k, v);
    return PROPONER(
      new Request(`${APP_URL}/api/empresa/retos`, {
        method: "POST",
        headers: { Origin: APP_URL, "X-CSRF-Token": issueCsrfToken(SECRET, sessionId) },
        body: fd,
      }),
      {},
    );
  };
  const sesion = (userId: string, esCuentaEmpresa: boolean) => ({
    userId,
    sessionId: `s-${userId}`,
    role: "USER",
    emailVerified: new Date(),
    esCuentaEmpresa,
  });

  it("una empresa verificada propone; el `empresaId` del cuerpo no lo lee nadie", async () => {
    const a = await unaEmpresa("Empresa A");
    const b = await unaEmpresa("Empresa B");
    H.sesion = sesion(a.userId, true);
    const r = await pedir(`s-${a.userId}`, campos({ empresaId: b.empresaId }));
    expect(r.status).toBe(200);
    const filas = await prisma.retoSolicitud.findMany({ select: { empresaId: true } });
    expect(filas).toEqual([{ empresaId: a.empresaId }]);
  });

  it("un participante recibe 404 (no se le cuenta qué es esto)", async () => {
    const u = await crearUsuario(prisma);
    H.sesion = sesion(u, false);
    const r = await pedir(`s-${u}`, campos());
    expect(r.status).toBe(404);
    expect(await prisma.retoSolicitud.count()).toBe(0);
  });

  it("una empresa sin verificar recibe 409 con lo que le falta", async () => {
    const e = await unaEmpresa("Pendiente SL", "PENDIENTE");
    H.sesion = sesion(e.userId, true);
    const r = await pedir(`s-${e.userId}`, campos());
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("NO_VERIFICADA");
  });

  it("sin CSRF no entra nada (la puerta de siempre)", async () => {
    const a = await unaEmpresa("Empresa A");
    H.sesion = sesion(a.userId, true);
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos())) fd.set(k, v);
    const r = await PROPONER(
      new Request(`${APP_URL}/api/empresa/retos`, {
        method: "POST",
        headers: { Origin: APP_URL },
        body: fd,
      }),
      {},
    );
    expect(r.status).toBe(403);
    expect(await prisma.retoSolicitud.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------
// 6. El admin se entera sin buscar: la insignia sube y baja con la cola
// ---------------------------------------------------------------------------------------------------

describe("la cifra de propuestas pendientes", () => {
  it("sube con una propuesta y baja al decidirla; a un moderador no se le cuenta", async () => {
    const { pendientesPanel } = await import("../src/server/services/pendientes-panel");
    const { pendientesDeSeccion, totalPendientes } = await import("../src/lib/pendientes-panel");
    const { empresaId } = await unaEmpresa("Panadería La Espiga");
    const cifras = async (rol = "ADMIN") => {
      const p = await pendientesPanel(prisma, rol);
      return {
        insignia: pendientesDeSeccion("/panel/propuestas", p, rol),
        cabecera: totalPendientes(p, rol),
        resumen: p.propuestas,
      };
    };

    expect(await cifras()).toEqual({ insignia: 0, cabecera: 0, resumen: 0 });
    const id = await proponer(empresaId);
    expect(await cifras()).toEqual({ insignia: 1, cabecera: 1, resumen: 1 });
    expect(await cifras("MODERATOR")).toEqual({ insignia: 0, cabecera: 0, resumen: 0 });
    // Y cuadra con las filas de la cola filtrada.
    const cola = await svc.listarSolicitudesReto(prisma, { estado: "PENDIENTE" });
    expect(cola.items).toHaveLength(1);
    await aprobar(id);
    expect(await cifras()).toEqual({ insignia: 0, cabecera: 0, resumen: 0 });
  });

  it("estructural: el contador y la cola usan el MISMO filtro", () => {
    const src = readFileSync(
      path.resolve(__dirname, "..", "src", "server", "services", "retos-empresa.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).toMatch(/count\(\{ where: filtroSolicitudesReto\(estado\) \}\)/);
    expect(src).toMatch(/const filtro = filtroSolicitudesReto\(opciones\.estado\)/);
  });
});
