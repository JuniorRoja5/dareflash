/**
 * DAR UN TOQUE (Fase 8 · P4) — y lo que de verdad se prueba aquí es el ANTI-ACOSO.
 *
 * Un toque es la única cosa que una persona puede mandar a la bandeja de otra sin que haya nada de
 * por medio: ni un vídeo, ni un voto, ni un reto. O sea que es, en potencia, un canal de acoso, y
 * tiene DOS topes que miden cosas distintas:
 *
 *   1. A -> B, UNA VEZ AL DÍA. Lo fuerza la CLAVE ÚNICA del aviso (emisor + día). Los casos de
 *      abajo lo prueban forzando el estado A MANO —llamando al servicio dos veces, y también en
 *      paralelo—, no solo pasando por la ruta: si el corte estuviera en un `if` de la ruta en vez
 *      de en la BD, se saltaría llamando al servicio directamente y aquí saldría en rojo.
 *   2. CUÁNTAS PERSONAS AL DÍA. Eso la clave no lo ve (cada pareja es un hecho distinto), y lo
 *      acota el cubo por emisor, que vive en la ruta.
 *
 * CADA CASO MIRA EL COUNT DE NOTIFICACIONES, no solo el estado que devuelve la función: un gate
 * que responde "no-vip" y además escribe la fila estaría verde mirando solo el estado.
 *
 * Para romperlo a propósito: quitar el gate de `esVipActivoDe` (rojo: un no-VIP escribe), sacar el
 * día de la clave (rojo: el segundo toque del mismo día escribe otra fila), o cambiar el
 * chokepoint por un flag (rojo: el caso de la suscripción vencida).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { TOQUE_MAX_DIA } from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { textoAviso } from "../src/lib/notificaciones";
import { listarNotificaciones } from "../src/server/services/notificaciones";
import { darToque } from "../src/server/services/toque";
import { registrarSuscripcion } from "../src/server/services/vip";

import { crearUsuario, createTestPrisma, resetDb } from "./helpers/db";

let prisma: PrismaClient;
let vip: string;
let otro: string;

const AHORA = new Date("2026-06-15T12:00:00.000Z");
const MANANA = new Date("2026-06-16T09:00:00.000Z");
/** Las 23:30 UTC del MISMO día: sigue siendo el mismo bucket aunque en media Europa sea mañana. */
const ESA_NOCHE = new Date("2026-06-15T23:30:00.000Z");

beforeAll(() => {
  prisma = createTestPrisma();
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  vip = await crearUsuario(prisma, { username: "la_vip" });
  otro = await crearUsuario(prisma, { username: "el_otro" });
  await suscribir(vip, { vigente: true });
});

/**
 * `vigente: true` dura TREINTA DÍAS, no treinta minutos, y la diferencia importa: varios casos de
 * abajo mueven el reloj a "esa noche" y a "mañana" para probar el bucket del día. Con un periodo
 * corto, esos casos salían `no-vip` y habrían estado midiendo la caducidad en vez de la clave.
 * Quien prueba la caducidad pasa su propio `minutos`.
 */
const suscribir = (
  userId: string,
  { vigente, minutos }: { vigente: boolean; minutos?: number },
  estado = "ACTIVA",
) =>
  registrarSuscripcion(prisma, {
    userId,
    estado,
    periodoFin: new Date(AHORA.getTime() + (vigente ? (minutos ?? 30 * 24 * 60) : -30) * 60_000),
  });

const toques = (receptor = otro) =>
  prisma.notification.count({ where: { userId: receptor, tipo: "TOQUE" } });

describe("quién puede tocar", () => {
  it("un VIP activo: se escribe el aviso", async () => {
    expect(await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA })).toEqual({
      estado: "enviado",
    });
    expect(await toques()).toBe(1);
  });

  it("un NO VIP: no puede, y NO deja ninguna notificación", async () => {
    // El COUNT es la mitad del caso: un gate que responde bien pero escribe igual sería verde
    // mirando solo el estado.
    const plano = await crearUsuario(prisma, { username: "sin_plan" });
    expect(await darToque(prisma, { emisorId: plano, receptorId: otro, ahora: AHORA })).toEqual({
      estado: "no-vip",
    });
    expect(await toques()).toBe(0);
  });

  it("una suscripción ACTIVA con el periodo VENCIDO tampoco", async () => {
    // El caso que separa "mirar el chokepoint" de "mirar un flag": el webhook de la baja se puede
    // perder y la fila se queda en ACTIVA. Lo único que queda cierto es `periodoFin`.
    const caducado = await crearUsuario(prisma, { username: "caducado" });
    await suscribir(caducado, { vigente: false }, "ACTIVA");
    expect(await darToque(prisma, { emisorId: caducado, receptorId: otro, ahora: AHORA })).toEqual({
      estado: "no-vip",
    });
    expect(await toques()).toBe(0);
  });

  it("una CORTADA con el periodo por delante tampoco: el estado puede quitar", async () => {
    const cortada = await crearUsuario(prisma, { username: "cortada" });
    await suscribir(cortada, { vigente: true }, "CORTADA");
    expect(await darToque(prisma, { emisorId: cortada, receptorId: otro, ahora: AHORA })).toEqual({
      estado: "no-vip",
    });
    expect(await toques()).toBe(0);
  });

  it("y deja de poder cuando pasa su periodo, sin que nadie escriba nada", async () => {
    // Se evalúa al consultar: pasar de VIP a no VIP no necesita que nadie escriba una columna.
    const corta = await crearUsuario(prisma, { username: "periodo_corto" });
    await suscribir(corta, { vigente: true, minutos: 30 });
    expect(
      (await darToque(prisma, { emisorId: corta, receptorId: otro, ahora: AHORA })).estado,
    ).toBe("enviado");

    const despues = new Date(AHORA.getTime() + 60 * 60_000);
    const tercero = await crearUsuario(prisma, { username: "tercero_corto" });
    expect(
      await darToque(prisma, { emisorId: corta, receptorId: tercero, ahora: despues }),
    ).toEqual({ estado: "no-vip" });
    expect(await toques(tercero)).toBe(0);
  });
});

describe("a quién, y a quién no", () => {
  it("a uno mismo, no", async () => {
    expect(await darToque(prisma, { emisorId: vip, receptorId: vip, ahora: AHORA })).toEqual({
      estado: "a-ti-mismo",
    });
    expect(await prisma.notification.count({ where: { userId: vip } })).toBe(0);
  });

  it("a un id que no existe: el MISMO resultado que a uno suspendido", async () => {
    // Por construcción: quien prueba ids no averigua cuáles son cuentas de verdad.
    const suspendido = await crearUsuario(prisma, { username: "suspendido" });
    await prisma.user.update({ where: { id: suspendido }, data: { bannedAt: new Date() } });

    const inventado = await darToque(prisma, {
      emisorId: vip,
      receptorId: "noexiste",
      ahora: AHORA,
    });
    const baneado = await darToque(prisma, {
      emisorId: vip,
      receptorId: suspendido,
      ahora: AHORA,
    });
    expect(inventado).toEqual({ estado: "no-disponible" });
    expect(baneado).toEqual(inventado);
    expect(await prisma.notification.count({ where: { tipo: "TOQUE" } })).toBe(0);
  });
});

describe("ANTI-ACOSO: A toca a B una vez al día, y lo fuerza la clave", () => {
  it("dos veces el mismo día dejan UNA notificación", async () => {
    expect((await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA })).estado).toBe(
      "enviado",
    );
    const segundo = await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA });
    expect(segundo).toEqual({ estado: "repetido" });
    expect(await toques()).toBe(1);
  });

  it("y a las 23:30 UTC del mismo día SIGUE siendo el mismo día", async () => {
    // El corte es UTC (`RESET_TIMEZONE`), el mismo de Boost y de la racha. Si el bucket se
    // calculara en la zona del servidor, este caso cambiaría de resultado al mover el VPS.
    await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA });
    expect(
      (await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: ESA_NOCHE })).estado,
    ).toBe("repetido");
    expect(await toques()).toBe(1);
  });

  it("CINCO a la vez dejan UNA: no hay carrera que valga", async () => {
    // Lo que esto descarta es un `SELECT` previo: con una lectura antes de escribir, cinco
    // peticiones simultáneas leerían todas "no hay" y escribirían cinco. Lo corta el UNIQUE.
    const r = await Promise.all(
      Array.from({ length: 5 }, () =>
        darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA }),
      ),
    );
    expect(r.filter((x) => x.estado === "enviado")).toHaveLength(1);
    expect(await toques()).toBe(1);
  });

  it("al día siguiente SÍ puede volver a tocar", async () => {
    // Si la clave no llevara el día, A tocaría a B una vez EN LA VIDA.
    await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA });
    expect(
      (await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: MANANA })).estado,
    ).toBe("enviado");
    expect(await toques()).toBe(2);
  });

  it("y el tope es POR PAREJA: a otra persona sí puede, el mismo día", async () => {
    // Si la clave no llevara el emisor, el primer toque del día bloquearía los de todos los demás.
    const tercero = await crearUsuario(prisma, { username: "tercero" });
    const otroVip = await crearUsuario(prisma, { username: "otra_vip" });
    await suscribir(otroVip, { vigente: true });

    await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA });
    expect(
      (await darToque(prisma, { emisorId: vip, receptorId: tercero, ahora: AHORA })).estado,
    ).toBe("enviado");
    // Y otra persona puede tocar al MISMO receptor el mismo día: son dos hechos distintos.
    expect(
      (await darToque(prisma, { emisorId: otroVip, receptorId: otro, ahora: AHORA })).estado,
    ).toBe("enviado");
    expect(await toques()).toBe(2);
  });
});

describe("lo que ve quien lo recibe", () => {
  it("un aviso con copy humano que lleva al perfil de quien tocó", async () => {
    await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA });
    const { items } = await listarNotificaciones(prisma, otro);
    expect(items).toHaveLength(1);
    expect(items[0]!.tipo).toBe("TOQUE");
    expect(items[0]!.texto).toBe("@la_vip te ha dado un toque.");
    expect(items[0]!.href).toBe("/u/la_vip");
    expect(items[0]!.leida).toBe(false);
  });

  it("el handle viaja en el aviso: cambiarlo después no reescribe el pasado", async () => {
    // El aviso es un REGISTRO de lo que pasó, igual que el autor de un comentario. Si se uniera al
    // leer, un cambio de handle reescribiría avisos viejos (y uno borrado los dejaría sin texto).
    await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA });
    await prisma.user.update({ where: { id: vip }, data: { username: "otro_nombre" } });
    const { items } = await listarNotificaciones(prisma, otro);
    expect(items[0]!.texto).toBe("@la_vip te ha dado un toque.");
  });

  it("y NO se pinta el id del emisor, que va en la clave solo para deduplicar", async () => {
    await darToque(prisma, { emisorId: vip, receptorId: otro, ahora: AHORA });
    const { items } = await listarNotificaciones(prisma, otro);
    expect(JSON.stringify(items)).not.toContain(vip);
  });

  it("una fila de TOQUE manipulada no se pinta, se omite", async () => {
    // Misma disciplina que el resto: mejor un hueco que un texto roto.
    expect(
      textoAviso({ tipo: "TOQUE", refType: "USER", refId: "x:2026-06-15", datos: {} }),
    ).toBeNull();
    expect(
      textoAviso({ tipo: "TOQUE", refType: "VIDEO", refId: "x", datos: { autor: "a" } }),
    ).toBeNull();
  });
});

describe("el tope por emisor existe y sale de una constante", () => {
  it("es un número de producto, no un literal escondido en la ruta", async () => {
    const { RATE_LIMITS } = await import("../src/config/constants");
    expect(RATE_LIMITS.TOQUE_PER_USER.limit).toBe(TOQUE_MAX_DIA);
    // Ventana de 24 h: es un tope DIARIO de producto, no el "que nadie martillee" de 15 min.
    expect(RATE_LIMITS.TOQUE_PER_USER.windowMs).toBe(24 * 60 * 60 * 1000);
  });
});
