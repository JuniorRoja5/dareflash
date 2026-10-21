/**
 * RETOS EXCLUSIVOS DE VIP MYTHIC (Fase 8 · P7) — el gate, la composición y la visibilidad.
 *
 * ┌─ EL GATE ES DEL SERVIDOR, NO DEL BOTÓN ─────────────────────────────────────────────────────┐
 * │ Un reto exclusivo es el primer sitio del producto donde alguien tiene un motivo claro para   │
 * │ saltarse la interfaz: hay un premio detrás. Por eso estos casos llaman al SERVICIO —el mismo │
 * │ que llama el endpoint de subida—, nunca a una vista: si el gate viviera en el botón, todos   │
 * │ pasarían en verde con la puerta abierta de par en par.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Lo que se fija:
 *  - un NO-VIP no participa en un reto `soloVip`, aunque llame directo al servicio;
 *  - SER VIP lo decide el CHOKEPOINT y no un estado: una suscripción ACTIVA pero VENCIDA no vale;
 *  - las dos puertas COMPONEN: nivel Y VIP, cada una con su motivo, y el nivel se dice primero;
 *  - el reto exclusivo SE VE: ninguna consulta pública lo esconde, ni al anónimo ni al no-VIP;
 *  - el admin lo guarda de verdad (crear y editar), que es por donde `nivelMinimo` se perdía.
 *
 * Para romperlo: quitar la rama de `soloVip` del servicio (rojo), mirar `estado === "ACTIVA"` en
 * vez del chokepoint (rojo), poner un `where: { soloVip: false }` en el listado (rojo), o volver a
 * enumerar los campos del formulario en las rutas del panel (rojo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { COMISION_SPONSOR_BPS_DEFECTO } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { iniciarParticipacion, puedeParticipar } from "../src/server/services/participacion";
import {
  listarRetosCerrados,
  listarRetosPublicos,
  retoPublicoPorCode,
} from "../src/server/services/retos-publico";
import { crearRetoAdmin, editarRetoAdmin } from "../src/server/services/retos-admin";
import { registrarSuscripcion } from "../src/server/services/vip";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let adminId: string;
let contador = 0;

const DIA = 86_400_000;
const AHORA = new Date();

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  contador = 0;
  adminId = await crearUsuario(prisma, { username: "admin_retos" });
});

/** Un reto PUBLISHED y abierto, con las puertas que se le pidan. */
async function crearReto(
  opciones: { soloVip?: boolean; nivelMinimo?: string } = {},
): Promise<string> {
  const n = ++contador;
  const r = await prisma.challenge.create({
    data: {
      title: `Reto ${n}`,
      slug: `reto-${n}`,
      publicCode: `rvip000${n}`,
      category: "fitness",
      status: "PUBLISHED",
      prizeCurrency: "USD",
      prizeAmountCents: 50_000,
      startsAt: new Date(AHORA.getTime() - DIA),
      deadline: new Date(AHORA.getTime() + 30 * DIA),
      createdById: adminId,
      soloVip: opciones.soloVip ?? false,
      ...(opciones.nivelMinimo ? { nivelMinimo: opciones.nivelMinimo } : {}),
    },
    select: { id: true },
  });
  return r.id;
}

/** Un usuario con sus puntos, y VIP o no. `finEnDias` negativo = suscripción vencida. */
async function crearPersona(opciones: {
  nombre: string;
  puntos?: number;
  vip?: { estado: string; finEnDias: number };
}): Promise<string> {
  const id = await crearUsuario(prisma, { username: opciones.nombre });
  if (opciones.puntos) {
    await prisma.user.update({
      where: { id },
      data: { pointsBalance: opciones.puntos },
    });
  }
  if (opciones.vip) {
    await registrarSuscripcion(prisma, {
      userId: id,
      estado: opciones.vip.estado,
      periodoFin: new Date(AHORA.getTime() + opciones.vip.finEnDias * DIA),
    });
  }
  return id;
}

/** Lo que de verdad protege: el servicio que llama el endpoint, no la vista. */
const intentar = (challengeId: string, userId: string) =>
  iniciarParticipacion(prisma, {
    challengeId,
    userId,
    bunnyGuid: `guid-${++contador}`,
    title: null,
  });

describe("el gate del reto exclusivo es estructural", () => {
  it("un NO-VIP no participa, aunque llame al servicio saltándose la UI", async () => {
    const reto = await crearReto({ soloVip: true });
    const persona = await crearPersona({ nombre: "sin_plan" });

    const guarda = await puedeParticipar(prisma, { challengeId: reto, userId: persona });
    expect(guarda).toEqual({ puede: false, motivo: "SOLO_VIP" });

    const r = await intentar(reto, persona);

    expect(r).toEqual({ modo: "bloqueada", motivo: "SOLO_VIP" });
    // Y NO deja rastro: ni participación ni fila de vídeo. Un rechazo que crea un Video es el
    // huérfano en Bunny de siempre.
    expect(await prisma.submission.count()).toBe(0);
    expect(await prisma.video.count()).toBe(0);
  });

  it("un VIP activo participa igual que en cualquier reto", async () => {
    const reto = await crearReto({ soloVip: true });
    const persona = await crearPersona({
      nombre: "la_mythic",
      vip: { estado: "ACTIVA", finEnDias: 20 },
    });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: true,
    });
    const r = await intentar(reto, persona);
    expect(r.modo).toBe("primera");
  });

  it("y en un reto NORMAL no cambia nada para quien no es VIP", async () => {
    // La otra mitad del candado: el flag no puede empezar a pedir suscripción en todas partes.
    const reto = await crearReto();
    const persona = await crearPersona({ nombre: "normal" });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: true,
    });
    expect((await intentar(reto, persona)).modo).toBe("primera");
  });
});

describe("ser VIP lo decide el CHOKEPOINT, no un estado", () => {
  it("una suscripción ACTIVA pero VENCIDA no abre un reto exclusivo", async () => {
    // El caso que separa "mirar la fecha" de "mirar el estado": si el webhook de baja se pierde, la
    // fila se queda en ACTIVA para siempre. Quien manda es `periodoFin`.
    const reto = await crearReto({ soloVip: true });
    const persona = await crearPersona({
      nombre: "se_le_acabo",
      vip: { estado: "ACTIVA", finEnDias: -1 },
    });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: false,
      motivo: "SOLO_VIP",
    });
    expect((await intentar(reto, persona)).modo).toBe("bloqueada");
  });

  it("una CANCELADA con el periodo por delante SÍ participa: está pagada", async () => {
    const reto = await crearReto({ soloVip: true });
    const persona = await crearPersona({
      nombre: "de_baja_pero_pagada",
      vip: { estado: "CANCELADA", finEnDias: 10 },
    });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: true,
    });
  });

  it("y una CORTADA no, aunque le quede periodo", async () => {
    const reto = await crearReto({ soloVip: true });
    const persona = await crearPersona({
      nombre: "cortada",
      vip: { estado: "CORTADA", finEnDias: 30 },
    });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: false,
      motivo: "SOLO_VIP",
    });
  });
});

/**
 * LAS DOS PUERTAS SE COMPONEN. Nivel (se juega) y VIP (se paga) son ejes distintos: un reto puede
 * pedir los dos, y entonces faltar CUALQUIERA de ellos bloquea. Un caso por lado, más el caso en
 * que faltan los dos —que es donde se nota el ORDEN—.
 */
describe("nivel Y VIP, no uno u otro", () => {
  it("VIP de nivel bajo en un reto soloVip + nivel Pro: NO participa, y falla por NIVEL", async () => {
    const reto = await crearReto({ soloVip: true, nivelMinimo: "pro" });
    const persona = await crearPersona({
      nombre: "mythic_rookie",
      puntos: 0,
      vip: { estado: "ACTIVA", finEnDias: 20 },
    });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: false,
      motivo: "NIVEL",
    });
  });

  it("no-VIP con nivel de sobra en el mismo reto: NO participa, y falla por VIP", async () => {
    const reto = await crearReto({ soloVip: true, nivelMinimo: "pro" });
    const persona = await crearPersona({ nombre: "pro_sin_plan", puntos: 100_000 });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: false,
      motivo: "SOLO_VIP",
    });
  });

  it("a quien le faltan las DOS se le dice la que NO cuesta dinero", async () => {
    // Si se dijera "hazte VIP" primero, esa persona pagaría una suscripción para encontrarse justo
    // después con una pared de nivel que ya estaba ahí. El orden es parte de la decisión.
    const reto = await crearReto({ soloVip: true, nivelMinimo: "pro" });
    const persona = await crearPersona({ nombre: "rookie_sin_plan", puntos: 0 });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: false,
      motivo: "NIVEL",
    });
  });

  it("y con las dos cosas, entra", async () => {
    const reto = await crearReto({ soloVip: true, nivelMinimo: "pro" });
    const persona = await crearPersona({
      nombre: "pro_y_mythic",
      puntos: 100_000,
      vip: { estado: "ACTIVA", finEnDias: 20 },
    });

    expect(await puedeParticipar(prisma, { challengeId: reto, userId: persona })).toEqual({
      puede: true,
    });
  });
});

/**
 * LA VISIBILIDAD, que es la mitad del producto: el reto exclusivo SE VE. Si se escondiera, la
 * función dejaría de vender justo a quien tiene que convencer — y habría un reto con premio del que
 * nadie se entera.
 */
describe("un reto exclusivo SE VE, como el de nivel mínimo", () => {
  it("aparece en el listado de activos (la consulta no sabe quién mira)", async () => {
    await crearReto({ soloVip: true });
    await crearReto();

    const activos = await listarRetosPublicos(prisma, AHORA);

    expect(activos).toHaveLength(2);
    expect(activos.filter((r) => r.soloVip)).toHaveLength(1);
  });

  it("también cuando ya cerró", async () => {
    const id = await crearReto({ soloVip: true });
    await prisma.challenge.update({ where: { id }, data: { status: "CLOSED" } });

    const cerrados = await listarRetosCerrados(prisma, AHORA);

    expect(cerrados.map((r) => r.soloVip)).toEqual([true]);
  });

  it("y su detalle se resuelve igual, con el flag en el DTO", async () => {
    await crearReto({ soloVip: true });
    const detalle = await retoPublicoPorCode(prisma, "rvip0001");
    expect(detalle?.soloVip).toBe(true);
  });

  it("el DTO de la TARJETA lo trae: es lo que pinta el marco en el listado", async () => {
    await crearReto({ soloVip: true });
    const [tarjeta] = await listarRetosPublicos(prisma, AHORA);
    // Sin esto, el marco dorado no podría existir en /retos aunque el detalle lo supiera.
    expect(tarjeta?.soloVip).toBe(true);
  });
});

describe("el admin lo guarda de verdad: crear y editar", () => {
  const datos = (over: Record<string, unknown> = {}) => ({
    title: "Reto exclusivo",
    description: null,
    rules: null,
    category: "fitness" as const,
    prizeAmountCents: 50_000,
    startsAt: new Date(AHORA.getTime() + DIA),
    deadline: new Date(AHORA.getTime() + 30 * DIA),
    winnersCount: 1,
    nivelMinimo: "pro" as const,
    soloVip: true,
    // Los de patrocinio los añadió la Fase 9; aquí van en su valor neutro: lo que se mide en este
    // bloque es el exclusivo, y un reto puede ser exclusivo sin marca detrás.
    esPatrocinado: false,
    sponsorNombre: null,
    comisionBps: COMISION_SPONSOR_BPS_DEFECTO,
    ...over,
  });

  it("crear con el flag lo persiste, junto al nivel", async () => {
    const creado = await crearRetoAdmin(prisma, adminId, datos());
    const fila = await prisma.challenge.findUniqueOrThrow({ where: { id: creado.id } });
    expect(fila.soloVip).toBe(true);
    expect(fila.nivelMinimo).toBe("pro");
  });

  it("y editar puede QUITARLO: un reto exclusivo por error se arregla", async () => {
    const creado = await crearRetoAdmin(prisma, adminId, datos());
    await editarRetoAdmin(
      prisma,
      creado.id,
      creado.publicCode,
      datos({ soloVip: false, nivelMinimo: "rookie" }),
    );

    const fila = await prisma.challenge.findUniqueOrThrow({ where: { id: creado.id } });
    expect(fila.soloVip, "no se puede desmarcar un reto exclusivo").toBe(false);
    expect(fila.nivelMinimo).toBe("rookie");
  });

  it("y lo que NO llega se guarda como ABIERTO, no como exclusivo", async () => {
    // El default no es un detalle: un formulario viejo, o una llamada que no mande el campo, no
    // puede convertir un reto normal en exclusivo por accidente. Se comprueba sobre el SCHEMA, que
    // es quien pone el default (el servicio recibe el objeto ya parseado).
    const { crearRetoSchema } = await import("../src/server/services/retos-admin");
    const parseado = crearRetoSchema(AHORA).safeParse({
      title: "Sin el campo",
      category: "fitness",
      prizeAmountCents: "1000",
      startsAt: new Date(AHORA.getTime() + DIA).toISOString(),
      deadline: new Date(AHORA.getTime() + 30 * DIA).toISOString(),
      winnersCount: "1",
    });
    expect(parseado.success).toBe(true);
    expect(parseado.success && parseado.data.soloVip).toBe(false);
  });
});
