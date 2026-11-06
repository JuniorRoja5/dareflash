/**
 * PUBLICIDAD: ALTA, ACTIVACIÓN Y RESERVA, contra la base de datos (Fase 9 · P6).
 *
 * DIENTES DEL PLAN:
 *  - 10 activaciones SIMULTÁNEAS sobre una zona de 3 plazas → entran exactamente 3 (contra la base de
 *    datos y con concurrencia de verdad, no con un mock: con COUNT, el cupo de Boost dejó entrar 61 en
 *    60).
 *  - La reserva (programar una fecha futura) mueve 0 créditos.
 *  - Cambiar el precio en constants no mueve una campaña activa ni una reserva.
 *
 * Y lo que hace honesto el calendario: pausar y terminar LIBERAN los días por venir (otra campaña cabe
 * después), reanudar vuelve a ocupar lo que falta y puede no caber, el horizonte de reserva, el saldo
 * del calendario entero, el alcance por tipo de negocio y el aislamiento entre empresas.
 *
 * Para romperlo a propósito: ocupar contando (`count < MAX` y después INSERT) en vez de INSERT IGNORE
 * contra el único (rojo el de las 10); que `liberarFuturo` no borre nada (rojo el de pausar); leer la
 * tarifa de la constante en `aDto` aunque haya una congelada (rojo el del precio).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CREDITOS_POR_DIA, PUBLICIDAD_RESERVA_MAX_DIAS } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { aplicarCreditos } from "../src/server/services/creditos";
import {
  type DatosCampana,
  PublicidadError,
  activarPublicidad,
  apuntarImagenPublicidad,
  borrarBorrador,
  crearBorrador,
  miPublicidad,
  misPublicidades,
  pausarPublicidad,
  reanudarPublicidad,
  terminarPublicidad,
} from "../src/server/services/publicidad";

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
});

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-12-01T10:00:00.000Z");
const HOY = "2026-12-01";
const dentroDe = (n: number) =>
  new Date(Date.UTC(2026, 11, 1) + n * DIA).toISOString().slice(0, 10);

const VALENCIA = 2509954;
const CASTELLON = 2519752;
const MEDELLIN = 3674962;

let n = 0;
async function unaEmpresa(
  opciones: { tipoNegocio?: string; estado?: string; pais?: string; creditos?: number } = {},
): Promise<string> {
  n += 1;
  const userId = await crearUsuario(prisma);
  await prisma.user.update({ where: { id: userId }, data: { esCuentaEmpresa: true } });
  const e = await prisma.empresa.create({
    data: {
      ownerUserId: userId,
      nombre: `Empresa ${n}`,
      tipoCuenta: "EMPRESA",
      tipoNegocio: opciones.tipoNegocio ?? "FISICO",
      estado: opciones.estado ?? "VERIFICADA",
      paisIso: opciones.pais ?? "ES",
      personaContacto: "Lucía",
    },
    select: { id: true },
  });
  // El saldo CON su fila de ledger, por el primitivo: un saldo movido a mano sería un descuadre.
  const creditos = opciones.creditos ?? 100;
  if (creditos > 0) {
    await aplicarCreditos(prisma, {
      empresaId: e.id,
      delta: creditos,
      reason: "AJUSTE_ADMIN",
      idempotencyKey: `test:${e.id}`,
      nota: "saldo de prueba",
    });
  }
  return e.id;
}

const BASE: DatosCampana = {
  nombre: "Campaña de prueba",
  alcance: "CIUDAD",
  ciudadId: VALENCIA,
  estadoCodigo: undefined,
  paises: [],
  texto: "Ven a probar nuestro pan",
  destinoUrl: "https://panaderia.example.com",
  fechaInicio: HOY,
  dias: 5,
};

/** Un borrador listo para activar (con imagen apuntada, como lo deja la ruta). */
async function unBorrador(empresaId: string, datos: Partial<DatosCampana> = {}): Promise<string> {
  const { id } = await crearBorrador(prisma, empresaId, { ...BASE, ...datos }, AHORA);
  await apuntarImagenPublicidad(prisma, empresaId, id, `/portadas/publicidad-${id}.webp`);
  return id;
}

async function plazas(zona: string, dia: string): Promise<number> {
  return prisma.zonaOcupacion.count({
    where: { zonaClave: zona, dia: new Date(`${dia}T00:00:00.000Z`) },
  });
}

async function codigoDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof PublicidadError) return e.code;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------
// El máximo por zona, con concurrencia de verdad
// ---------------------------------------------------------------------------------------------------

describe("el máximo por zona", () => {
  it("10 activaciones simultáneas sobre una zona de 3 plazas: entran exactamente 3", async () => {
    const empresas = await Promise.all(Array.from({ length: 10 }, () => unaEmpresa()));
    const borradores = await Promise.all(empresas.map((e) => unBorrador(e)));
    const resultados = await Promise.all(
      borradores.map((id, i) => activarPublicidad(prisma, empresas[i]!, id, { ahora: AHORA })),
    );
    expect(resultados.filter((r) => r.ok)).toHaveLength(3);
    const llenas = resultados.filter((r) => !r.ok);
    expect(llenas).toHaveLength(7);
    for (const r of llenas) expect(r).toMatchObject({ ok: false, code: "ZONA_LLENA" });
    // Cada uno de los 5 días tiene sus 3 plazas, ni una más; y las que no entraron no tocaron nada.
    for (let d = 0; d < 5; d += 1) expect(await plazas(`CIUDAD:${VALENCIA}`, dentroDe(d))).toBe(3);
    expect(await prisma.publicidad.count({ where: { estado: "ACTIVA" } })).toBe(3);
    expect(await prisma.publicidad.count({ where: { estado: "BORRADOR" } })).toBe(7);
  });

  it("lleno, ofrece la primera fecha libre, y aceptarla la programa", async () => {
    for (let i = 0; i < 3; i += 1) {
      const e = await unaEmpresa();
      expect((await activarPublicidad(prisma, e, await unBorrador(e), { ahora: AHORA })).ok).toBe(
        true,
      );
    }
    const cuarta = await unaEmpresa();
    const id = await unBorrador(cuarta);
    const r = await activarPublicidad(prisma, cuarta, id, { ahora: AHORA });
    expect(r).toMatchObject({ ok: false, code: "ZONA_LLENA" });
    // Las tres ocupan del día 0 al 4: lo primero libre para 5 días seguidos es el día 5.
    expect(r.ok ? null : r.primeraLibre?.toISOString().slice(0, 10)).toBe(dentroDe(5));
    const aceptada = await activarPublicidad(prisma, cuarta, id, {
      ahora: AHORA,
      fechaInicio: dentroDe(5),
    });
    expect(aceptada.ok).toBe(true);
    expect((await miPublicidad(prisma, cuarta, id, AHORA))?.estado).toBe("PROGRAMADA");
  });

  it("la plaza es de la ZONA COMPRADA: Castellón no se llena porque Valencia esté llena", async () => {
    for (let i = 0; i < 3; i += 1) {
      const e = await unaEmpresa();
      await activarPublicidad(prisma, e, await unBorrador(e), { ahora: AHORA });
    }
    const otra = await unaEmpresa();
    const r = await activarPublicidad(
      prisma,
      otra,
      await unBorrador(otra, { ciudadId: CASTELLON }),
      { ahora: AHORA },
    );
    expect(r.ok).toBe(true);
  });

  it("activar despliega el radio de 100 km: Valencia y Castellón dentro, Alicante fuera", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    await activarPublicidad(prisma, e, id, { ahora: AHORA });
    const radio = (
      await prisma.publicidadCiudad.findMany({
        where: { publicidadId: id },
        select: { ciudadId: true },
      })
    ).map((c) => c.ciudadId);
    expect(radio).toContain(VALENCIA);
    expect(radio).toContain(CASTELLON);
    expect(radio).not.toContain(2521978);
  });
});

// ---------------------------------------------------------------------------------------------------
// La reserva y el precio
// ---------------------------------------------------------------------------------------------------

describe("la reserva y el precio congelado", () => {
  it("programar una fecha futura mueve 0 créditos", async () => {
    const e = await unaEmpresa({ creditos: 50 });
    const movimientosAntes = await prisma.creditoLedger.count({ where: { empresaId: e } });
    const id = await unBorrador(e, { fechaInicio: dentroDe(10), dias: 10 });
    const r = await activarPublicidad(prisma, e, id, { ahora: AHORA });
    expect(r.ok).toBe(true);
    expect((await miPublicidad(prisma, e, id, AHORA))?.estado).toBe("PROGRAMADA");
    expect(await prisma.creditoLedger.count({ where: { empresaId: e } })).toBe(movimientosAntes);
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id: e } })).creditosSaldo).toBe(50);
    // Y ocupa sus 10 días de verdad: es una reserva, no una promesa.
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: id } })).toBe(10);
  });

  it("activar HOY tampoco mueve créditos: cobra cada día (P9), no al activar", async () => {
    const e = await unaEmpresa({ creditos: 50 });
    await activarPublicidad(prisma, e, await unBorrador(e), { ahora: AHORA });
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id: e } })).creditosSaldo).toBe(50);
  });

  it("cambiar el precio en constants no mueve una campaña activa ni una reserva", async () => {
    const e = await unaEmpresa();
    const activa = await unBorrador(e);
    const reserva = await unBorrador(e, { ciudadId: CASTELLON, fechaInicio: dentroDe(20) });
    await activarPublicidad(prisma, e, activa, { ahora: AHORA });
    await activarPublicidad(prisma, e, reserva, { ahora: AHORA });
    const sinVender = await unBorrador(e, { nombre: "sin vender" });

    const original = CREDITOS_POR_DIA.CIUDAD;
    try {
      CREDITOS_POR_DIA.CIUDAD = 9;
      expect((await miPublicidad(prisma, e, activa, AHORA))?.creditosPorDia).toBe(original);
      expect((await miPublicidad(prisma, e, reserva, AHORA))?.creditosPorDia).toBe(original);
      // Control: el cambio SÍ llegó (un borrador, que aún no se ha vendido, ya lo ve).
      expect((await miPublicidad(prisma, e, sinVender, AHORA))?.creditosPorDia).toBe(9);
      const enBd = await prisma.publicidad.findMany({
        where: { id: { in: [activa, reserva] } },
        select: { creditosPorDia: true },
      });
      expect(enBd.every((p) => p.creditosPorDia === original)).toBe(true);
    } finally {
      CREDITOS_POR_DIA.CIUDAD = original;
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Pausar, reanudar, terminar
// ---------------------------------------------------------------------------------------------------

describe("pausar, reanudar y terminar", () => {
  async function llenarConTres(): Promise<{ empresas: string[]; ids: string[] }> {
    const empresas: string[] = [];
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const e = await unaEmpresa();
      const id = await unBorrador(e);
      await activarPublicidad(prisma, e, id, { ahora: AHORA });
      empresas.push(e);
      ids.push(id);
    }
    return { empresas, ids };
  }

  it("pausar libera los días por venir: otra campaña cabe a partir de mañana", async () => {
    const { empresas, ids } = await llenarConTres();
    await pausarPublicidad(prisma, empresas[0]!, ids[0]!, AHORA);
    expect((await miPublicidad(prisma, empresas[0]!, ids[0]!, AHORA))?.estado).toBe("PAUSADA");
    // Hoy sigue siendo suyo (el día en curso); de mañana en adelante, libre.
    expect(await plazas(`CIUDAD:${VALENCIA}`, HOY)).toBe(3);
    expect(await plazas(`CIUDAD:${VALENCIA}`, dentroDe(1))).toBe(2);
    const nueva = await unaEmpresa();
    const r = await activarPublicidad(
      prisma,
      nueva,
      await unBorrador(nueva, { fechaInicio: dentroDe(1), dias: 4 }),
      { ahora: AHORA },
    );
    expect(r.ok).toBe(true);
  });

  it("reanudar ocupa lo que FALTA, desde mañana si hoy ya era suyo", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    await activarPublicidad(prisma, e, id, { ahora: AHORA });
    await pausarPublicidad(prisma, e, id, AHORA);
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: id } })).toBe(1);
    const r = await reanudarPublicidad(prisma, e, id, { ahora: AHORA });
    expect(r).toMatchObject({ ok: true, dias: 4 });
    expect(r.ok ? r.inicio.toISOString().slice(0, 10) : null).toBe(dentroDe(1));
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: id } })).toBe(5);
    expect((await miPublicidad(prisma, e, id, AHORA))?.estado).toBe("ACTIVA");
  });

  it("reanudar puede no caber: si la zona se llenó, ofrece la primera fecha libre", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    await activarPublicidad(prisma, e, id, { ahora: AHORA });
    await pausarPublicidad(prisma, e, id, AHORA);
    // Mientras estaba pausada, tres campañas llenan del día 1 al 5.
    for (let i = 0; i < 3; i += 1) {
      const o = await unaEmpresa();
      await activarPublicidad(prisma, o, await unBorrador(o, { fechaInicio: dentroDe(1) }), {
        ahora: AHORA,
      });
    }
    const r = await reanudarPublicidad(prisma, e, id, { ahora: AHORA });
    expect(r).toMatchObject({ ok: false, code: "ZONA_LLENA" });
    expect(r.ok ? null : r.primeraLibre?.toISOString().slice(0, 10)).toBe(dentroDe(6));
    expect((await miPublicidad(prisma, e, id, AHORA))?.estado).toBe("PAUSADA");
  });

  it("terminar libera los días por venir y no tiene vuelta atrás", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    await activarPublicidad(prisma, e, id, { ahora: AHORA });
    await terminarPublicidad(prisma, e, id, AHORA);
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: id } })).toBe(1);
    expect((await miPublicidad(prisma, e, id, AHORA))?.estado).toBe("TERMINADA");
    expect(await codigoDe(reanudarPublicidad(prisma, e, id, { ahora: AHORA }))).toBe(
      "ESTADO_NO_PERMITE",
    );
  });

  it("una programada que se termina libera TODOS sus días (ninguno había empezado)", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e, { fechaInicio: dentroDe(3) });
    await activarPublicidad(prisma, e, id, { ahora: AHORA });
    await terminarPublicidad(prisma, e, id, AHORA);
    expect(await prisma.zonaOcupacion.count({ where: { publicidadId: id } })).toBe(0);
  });

  it("pasados sus días, está FINALIZADA (calculado, sin que corra nada) y no se puede pausar", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e, { dias: 2 });
    await activarPublicidad(prisma, e, id, { ahora: AHORA });
    const despues = new Date(AHORA.getTime() + 5 * DIA);
    expect((await miPublicidad(prisma, e, id, despues))?.estado).toBe("FINALIZADA");
    expect(await codigoDe(pausarPublicidad(prisma, e, id, despues))).toBe("ESTADO_NO_PERMITE");
  });
});

// ---------------------------------------------------------------------------------------------------
// Las reglas del alta y de la activación
// ---------------------------------------------------------------------------------------------------

describe("las reglas", () => {
  it("el saldo se comprueba contra el calendario ENTERO, no contra un día", async () => {
    const e = await unaEmpresa({ creditos: 4 });
    const id = await unBorrador(e, { dias: 5 });
    expect(await codigoDe(activarPublicidad(prisma, e, id, { ahora: AHORA }))).toBe(
      "SALDO_INSUFICIENTE",
    );
    expect(await prisma.zonaOcupacion.count()).toBe(0);
  });

  it("un negocio FÍSICO no compra país ni global; uno ONLINE no compra ciudad", async () => {
    const fisico = await unaEmpresa();
    expect(
      await codigoDe(
        crearBorrador(prisma, fisico, { ...BASE, alcance: "PAIS", paises: ["ES"] }, AHORA),
      ),
    ).toBe("ALCANCE_NO_PERMITIDO");
    const online = await unaEmpresa({ tipoNegocio: "ONLINE" });
    expect(await codigoDe(crearBorrador(prisma, online, BASE, AHORA))).toBe("ALCANCE_NO_PERMITIDO");
  });

  it("un negocio FÍSICO solo compra ciudades o regiones de SU país", async () => {
    const e = await unaEmpresa({ pais: "ES" });
    expect(await codigoDe(crearBorrador(prisma, e, { ...BASE, ciudadId: MEDELLIN }, AHORA))).toBe(
      "ZONA_NO_VALIDA",
    );
    expect(
      await codigoDe(
        crearBorrador(prisma, e, { ...BASE, alcance: "ESTADO", estadoCodigo: "CO.02" }, AHORA),
      ),
    ).toBe("ZONA_NO_VALIDA");
    expect(
      await codigoDe(
        crearBorrador(prisma, e, { ...BASE, alcance: "ESTADO", estadoCodigo: "ES.60" }, AHORA),
      ),
    ).toBe("OK");
  });

  it("varios países: 5 créditos por país y día, con tope en Global", async () => {
    const e = await unaEmpresa({ tipoNegocio: "ONLINE" });
    const dos = await unBorrador(e, { alcance: "PAIS", ciudadId: undefined, paises: ["ES", "CO"] });
    const cinco = await unBorrador(e, {
      alcance: "PAIS",
      ciudadId: undefined,
      paises: ["ES", "CO", "MX", "AR", "CL"],
    });
    expect((await miPublicidad(prisma, e, dos, AHORA))?.creditosPorDia).toBe(10);
    expect((await miPublicidad(prisma, e, cinco, AHORA))?.creditosPorDia).toBe(
      CREDITOS_POR_DIA.GLOBAL,
    );
    // Y ocupa una plaza en CADA país.
    await activarPublicidad(prisma, e, dos, { ahora: AHORA });
    expect(await plazas("PAIS:ES", HOY)).toBe(1);
    expect(await plazas("PAIS:CO", HOY)).toBe(1);
  });

  it(`no se puede empezar en el pasado ni a más de ${PUBLICIDAD_RESERVA_MAX_DIAS} días`, async () => {
    const e = await unaEmpresa();
    expect(
      await codigoDe(crearBorrador(prisma, e, { ...BASE, fechaInicio: "2026-11-30" }, AHORA)),
    ).toBe("FECHA_FUERA_DE_PLAZO");
    expect(
      await codigoDe(
        crearBorrador(
          prisma,
          e,
          { ...BASE, fechaInicio: dentroDe(PUBLICIDAD_RESERVA_MAX_DIAS + 1) },
          AHORA,
        ),
      ),
    ).toBe("FECHA_FUERA_DE_PLAZO");
    expect(
      await codigoDe(
        crearBorrador(
          prisma,
          e,
          { ...BASE, fechaInicio: dentroDe(PUBLICIDAD_RESERVA_MAX_DIAS) },
          AHORA,
        ),
      ),
    ).toBe("OK");
  });

  it("una empresa sin verificar no crea ni activa", async () => {
    const e = await unaEmpresa({ estado: "PENDIENTE" });
    expect(await codigoDe(crearBorrador(prisma, e, BASE, AHORA))).toBe("EMPRESA_NO_OPERA");
    const ok = await unaEmpresa();
    const id = await unBorrador(ok);
    await prisma.empresa.update({ where: { id: ok }, data: { estado: "SUSPENDIDA" } });
    expect(await codigoDe(activarPublicidad(prisma, ok, id, { ahora: AHORA }))).toBe(
      "EMPRESA_NO_OPERA",
    );
  });

  it("sin imagen no se activa", async () => {
    const e = await unaEmpresa();
    const { id } = await crearBorrador(prisma, e, BASE, AHORA);
    expect(await codigoDe(activarPublicidad(prisma, e, id, { ahora: AHORA }))).toBe("SIN_IMAGEN");
  });

  it("solo se borra un borrador; una campaña que ocupó días es historia", async () => {
    const e = await unaEmpresa();
    const borrador = await unBorrador(e);
    const activa = await unBorrador(e, { ciudadId: CASTELLON });
    await activarPublicidad(prisma, e, activa, { ahora: AHORA });
    expect(await borrarBorrador(prisma, e, activa)).toBe(false);
    expect(await borrarBorrador(prisma, e, borrador)).toBe(true);
    expect(await prisma.publicidad.count()).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------
// La estimación, con el aforo medido
// ---------------------------------------------------------------------------------------------------

describe("la estimación antes de pagar", () => {
  /** Siete días medidos antes de AHORA (todos posteriores al despliegue de P5). */
  async function aforo(alcance: string, zona: string, personas: number) {
    for (let d = 1; d <= 7; d += 1) {
      await prisma.aforoZonaDia.create({
        data: { alcance, zona, dia: new Date(AHORA.getTime() - d * DIA), personas },
      });
    }
  }
  beforeEach(async () => {
    await aforo("GLOBAL", "*", 5000);
  });

  it("sola en su ciudad: la gente medida de su radio (Valencia + Castellón)", async () => {
    await aforo("CIUDAD", String(VALENCIA), 60);
    await aforo("CIUDAD", String(CASTELLON), 30);
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    const { estimacionDeMiPublicidad } = await import("../src/server/services/publicidad");
    expect(await estimacionDeMiPublicidad(prisma, e, id, AHORA)).toEqual({
      tipo: "zona",
      personas: 90,
    });
  });

  it("con una campaña activa en Castellón (cuyo radio cubre Valencia), se reparten", async () => {
    await aforo("CIUDAD", String(VALENCIA), 60);
    await aforo("CIUDAD", String(CASTELLON), 30);
    const otra = await unaEmpresa();
    await activarPublicidad(prisma, otra, await unBorrador(otra, { ciudadId: CASTELLON }), {
      ahora: AHORA,
    });
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    const { estimacionDeMiPublicidad } = await import("../src/server/services/publicidad");
    expect(await estimacionDeMiPublicidad(prisma, e, id, AHORA)).toEqual({
      tipo: "zona",
      personas: 45,
    });
  });

  it("sin tráfico en la ciudad: la cifra de su región o su país, diciendo de cuál", async () => {
    await aforo("PAIS", "ES", 800);
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    const { estimacionDeMiPublicidad } = await import("../src/server/services/publicidad");
    expect(await estimacionDeMiPublicidad(prisma, e, id, AHORA)).toEqual({
      tipo: "respaldo",
      zonaSinDatos: "Valencia",
      nivelNombre: "España",
      personas: 800,
    });
  });

  it("sin tráfico en ningún nivel: lo dice, no inventa una cifra", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    const { estimacionDeMiPublicidad } = await import("../src/server/services/publicidad");
    expect(await estimacionDeMiPublicidad(prisma, e, id, AHORA)).toEqual({
      tipo: "sin-datos",
      zonaSinDatos: "Valencia",
    });
  });

  it("una campaña ya activa no tiene estimación (ya está vendida), ni la de otra empresa", async () => {
    const e = await unaEmpresa();
    const id = await unBorrador(e);
    await activarPublicidad(prisma, e, id, { ahora: AHORA });
    const otra = await unaEmpresa();
    const { estimacionDeMiPublicidad } = await import("../src/server/services/publicidad");
    expect(await estimacionDeMiPublicidad(prisma, e, id, AHORA)).toBeNull();
    expect(await estimacionDeMiPublicidad(prisma, otra, id, AHORA)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------
// El aislamiento, con dos empresas de verdad
// ---------------------------------------------------------------------------------------------------

describe("dos empresas: la A no ve ni toca nada de la B", () => {
  it("lista, ficha y cada acción: cero filas de B y NO_EXISTE (que la ruta da como 404)", async () => {
    const a = await unaEmpresa();
    const b = await unaEmpresa();
    const deB = await unBorrador(b);
    const deBActiva = await unBorrador(b, { ciudadId: CASTELLON });
    await activarPublicidad(prisma, b, deBActiva, { ahora: AHORA });
    await unBorrador(a, { nombre: "la de A" });

    const lista = await misPublicidades(prisma, a, { ahora: AHORA });
    expect(lista.items.map((c) => c.nombre)).toEqual(["la de A"]);
    expect(await miPublicidad(prisma, a, deB, AHORA)).toBeNull();
    expect(await codigoDe(activarPublicidad(prisma, a, deB, { ahora: AHORA }))).toBe("NO_EXISTE");
    expect(await codigoDe(pausarPublicidad(prisma, a, deBActiva, AHORA))).toBe("NO_EXISTE");
    expect(await codigoDe(terminarPublicidad(prisma, a, deBActiva, AHORA))).toBe("NO_EXISTE");
    expect(await codigoDe(reanudarPublicidad(prisma, a, deBActiva, { ahora: AHORA }))).toBe(
      "NO_EXISTE",
    );
    expect(await borrarBorrador(prisma, a, deB)).toBe(false);
    expect(await apuntarImagenPublicidad(prisma, a, deB, "/portadas/otra.webp")).toBe(false);
    // Y nada de B cambió.
    expect((await miPublicidad(prisma, b, deB, AHORA))?.estado).toBe("BORRADOR");
    expect((await miPublicidad(prisma, b, deBActiva, AHORA))?.estado).toBe("ACTIVA");
  });
});
