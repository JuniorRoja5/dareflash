/**
 * EL REGALO SEMANAL, CABLEADO (Fase 8 · P5). Estructural: lo que `vip-boost-semanal.test` no ve.
 *
 * El reparto puede estar perfecto y no repartir nada, y eso no lo descubre ningún test del
 * servicio: basta con que el handler no esté en el registro, con que su política sea FAIL, o con
 * que el worker no mire nunca si toca arrancar la semana. Son tres cables, y cada uno se puede
 * quitar en silencio.
 *
 * Para romperlo a propósito: sacar `VIP_BOOST_SEMANAL` del registro (rojo), ponerle `reaper: FAIL`
 * (rojo), o quitar el barrido del worker (rojo).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { VIP_BOOST_SEMANAL, VIP_BOOST_SEMANAL_CADENCIA_MS } from "../src/config/constants";
import { TIPO_JOB_VIP_BOOST } from "../src/server/services/vip-boost-semanal";

const SRC = path.resolve(__dirname, "..", "src");
const leer = (rel: string): string => readFileSync(path.join(SRC, rel), "utf8");
/** Sin comentarios: un comentario no registra un handler ni dispara un barrido. */
const sinComentarios = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const REGISTRY = sinComentarios(leer("server/jobs/registry.ts"));
const WORKER = sinComentarios(leer("server/jobs/worker.ts"));

describe("el handler está en el registro, y con la política correcta", () => {
  it("el tipo del job es el que escribe el servicio", () => {
    // Si el registro usara otro literal, los jobs se encolarían y nadie los despacharía: se
    // quedarían PENDING para siempre sin que falle nada.
    expect(TIPO_JOB_VIP_BOOST).toBe("VIP_BOOST_SEMANAL");
    expect(REGISTRY).toContain(`${TIPO_JOB_VIP_BOOST}: {`);
  });

  it("su política de reaper es REQUEUE, no FAIL", () => {
    // FAIL es para efectos externos que no son idempotentes de verdad (SMTP). Esto escribe en
    // NUESTRA BD con una clave única por (persona, semana): reintentarlo es seguro, y NO
    // reintentarlo deja gente sin su boost, que es el fallo que importa.
    const bloque = new RegExp(`${TIPO_JOB_VIP_BOOST}: \\{[\\s\\S]*?\\n    \\},`).exec(REGISTRY);
    expect(bloque, "no encuentro el bloque del handler").not.toBeNull();
    expect(bloque![0]).toContain('reaper: "REQUEUE"');
    expect(bloque![0], "la política es FAIL").not.toContain('reaper: "FAIL"');
  });

  it("y encola la continuación cuando queda audiencia", () => {
    // Sin esto el reparto se queda en el primer tramo: los VIP que caen detrás del cursor no
    // cobran, y el job termina en DONE como si hubiera ido bien.
    const bloque = new RegExp(`${TIPO_JOB_VIP_BOOST}: \\{[\\s\\S]*?\\n    \\},`).exec(REGISTRY)![0];
    expect(bloque).toMatch(/if \(tramo\.siguiente\)/);
    expect(bloque).toContain("encolarTramoSemanal");
  });
});

describe("el worker mira si toca arrancar la semana", () => {
  it("LLAMA al disparador en su barrido, no solo lo nombra", () => {
    // El disparador es lo único que convierte "existe el job" en "se reparte": sin él, nadie
    // crea nunca el primer tramo y el beneficio no llega jamás.
    //
    // Y se exige la LLAMADA, no que el nombre aparezca: con un `toContain` del nombre a secas,
    // dejarlo en una variable muerta —o renombrarlo a `arrancarRepartoSemanalX`— pasaba en verde.
    // Lo descubrió el diente, que es para lo que está.
    expect(WORKER).toMatch(/await arrancarRepartoSemanal\(\s*db,\s*t\s*\)/);
    // Y que se importe de su servicio, no de otro sitio que lo reexporte a medias.
    expect(WORKER).toMatch(
      /const \{ arrancarRepartoSemanal \} = await import\("@\/server\/services\/vip-boost-semanal"\)/,
    );
  });

  it("con su propia cadencia, por token y no clavada", () => {
    expect(WORKER).toContain("VIP_BOOST_SEMANAL_CADENCIA_MS");
    expect(WORKER).toMatch(/proximoVipBoost = t\.getTime\(\) \+ VIP_BOOST_SEMANAL_CADENCIA_MS/);
    // Una hora: no es "cada cuánto se reparte" (eso lo decide la semana), es cada cuánto se mira.
    expect(VIP_BOOST_SEMANAL_CADENCIA_MS).toBe(60 * 60 * 1000);
  });

  it("y si el disparador falla, el worker sigue: no tumba el bucle", () => {
    // Un barrido que revienta el bucle del worker para la cola ENTERA. Todos los demás barridos
    // llevan su try/catch por lo mismo.
    const i = WORKER.indexOf("arrancarRepartoSemanal");
    const alrededor = WORKER.slice(Math.max(0, i - 300), i + 500);
    expect(alrededor).toContain("try {");
    expect(alrededor).toContain("catch");
  });
});

describe("el número del beneficio es una constante de producto", () => {
  it("es 1 por semana, y sale de `VIP_BOOST_SEMANAL`", () => {
    // Clavado con cifra a propósito: es el beneficio #2 del maestro y el mecanismo que sustituye
    // al "auto-destacar" descartado. Cambiarlo es una decisión de producto, no un retoque.
    expect(VIP_BOOST_SEMANAL).toBe(1);
    const servicio = sinComentarios(leer("server/services/vip-boost-semanal.ts"));
    expect(servicio).toContain("delta: VIP_BOOST_SEMANAL");
    expect(servicio, "el delta está escrito a mano").not.toMatch(/delta: \d/);
  });

  it("y la acreditación pasa por el ledger, no por un UPDATE suelto del saldo", () => {
    // Tocar `boostBalance` sin insertar su fila es exactamente el descuadre que `LEDGER_RECONCILE`
    // existe para detectar. El saldo y el movimiento van juntos o no van.
    const servicio = sinComentarios(leer("server/services/vip-boost-semanal.ts"));
    expect(servicio).toContain("applyBoostCredits");
    expect(servicio, "escribe el saldo a mano").not.toMatch(/boostBalance/);
    expect(servicio, "inserta en el ledger por su cuenta").not.toMatch(/boostLedger\.create/);
  });

  it("y NO abre una transacción propia alrededor del lote (veto del deadlock)", () => {
    // `applyBoostCredits` ya bloquea la fila del `User` con FOR UPDATE. Envolver el lote entero
    // en otra transacción mantendría N filas bloqueadas a la vez, y en orden distinto según por
    // dónde fuera el cursor: el ciclo servido en bandeja.
    const servicio = sinComentarios(leer("server/services/vip-boost-semanal.ts"));
    expect(servicio, "el reparto abre su propia transacción").not.toMatch(/\$transaction/);
  });
});
