/**
 * EL AVISO DE CAPACIDAD — que avise ANTES del acantilado, una sola vez, y no por un pico.
 *
 * ┌─ QUÉ SE JUEGA ─────────────────────────────────────────────────────────────────────────────────┐
 * │ El lanzamiento es gradual y la máquina se amplía CUANDO el tráfico se acerque al techo, no    │
 * │ antes. Eso solo funciona si alguien se entera a tiempo, y el margen es estrecho: del límite   │
 * │ razonable (200 personas, 64 % de CPU) a inservible (300 personas, 98 %) la latencia se        │
 * │ multiplica por veinticinco.                                                                    │
 * │                                                                                                 │
 * │ Los dos fallos que lo dejarían inútil son opuestos y los dos son fáciles: avisar tarde (y     │
 * │ enterarse cuando ya está lento) o avisar por cualquier pico (y que se deje de mirar el         │
 * │ correo). Por eso aquí hay tanto caso de «NO avisa» como de «avisa».                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CPU_AVISO_AMPLIA_PCT,
  CPU_AVISO_PREPARATE_PCT,
  CPU_MUESTRAS_VENTANA,
} from "../src/config/constants";
import type { PrismaClient } from "../src/generated/prisma/client";
import { leerContadores, medianaUso, usoEntre } from "../src/lib/cpu-host";
import type { EmailAdapter, EmailMessage } from "../src/server/email/adapter";
import { avisarSiCargaAlta, VigilanteCapacidad } from "../src/server/jobs/aviso-capacidad";

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
  // La histéresis vive en SystemState y `resetDb` lo vacía, así que cada caso empieza ARMADO.
});

/** Un adaptador que guarda lo que se le manda, para poder mirarlo. */
function correoFalso() {
  const enviados: EmailMessage[] = [];
  const adapter: EmailAdapter = {
    name: "falso",
    send: async (m) => void enviados.push(m),
  };
  return { adapter, enviados };
}

/**
 * Un `/proc/stat` de mentira. `propio` y `steal` son los jiffies de ESTE intervalo; el resto del
 * intervalo (hasta 1000) es ocioso. Asi "propio 500" = 50 % del nucleo.
 */
function procStat(acumulado: { propio: number; steal: number; ocioso: number }): string {
  // user nice system idle iowait irq softirq steal guest guest_nice
  return [
    `cpu  ${acumulado.propio} 0 0 ${acumulado.ocioso} 0 0 0 ${acumulado.steal} 0 0`,
    "cpu0 1 2 3 4 5 6 7 8 9 10",
    "intr 12345",
  ].join("\n");
}

/** Un vigilante al que se le van dando intervalos con el uso que se quiera. */
function vigilanteCon(usos: Array<{ propio: number; steal?: number }>) {
  const acumulado = { propio: 0, steal: 0, ocioso: 0 };
  const cola = [procStat(acumulado)];
  for (const u of usos) {
    const steal = u.steal ?? 0;
    acumulado.propio += u.propio * 10; // 1000 jiffies por intervalo -> % directo
    acumulado.steal += steal * 10;
    acumulado.ocioso += (100 - u.propio - steal) * 10;
    cola.push(procStat(acumulado));
  }
  let i = 0;
  return new VigilanteCapacidad(async () => cola[Math.min(i++, cola.length - 1)]!);
}

/** Muestrea `n` veces. La primera no produce muestra (no hay con qué comparar). */
async function muestrear(v: VigilanteCapacidad, n: number) {
  for (let k = 0; k < n; k += 1) await v.muestrear();
}

const todas = (pct: number, n = CPU_MUESTRAS_VENTANA) =>
  Array.from({ length: n }, () => ({ propio: pct }));

describe("leer /proc/stat", () => {
  it("separa lo NUESTRO del steal, e ignora guest (que ya va dentro de user)", () => {
    // user=100 nice=10 system=20 idle=500 iowait=50 irq=5 softirq=5 steal=40 guest=7 guest_nice=3
    const c = leerContadores("cpu  100 10 20 500 50 5 5 40 7 3\ncpu0 1 1 1 1 1 1 1 1");
    expect(c).not.toBeNull();
    expect(c!.propio).toBe(140); // 100+10+20+5+5
    expect(c!.steal).toBe(40);
    expect(c!.ocioso).toBe(550); // idle + iowait
    // Si `guest` se sumara, el total seria 740 y todos los porcentajes saldrian bajos.
    expect(c!.total).toBe(730);
  });

  it("un fichero que no es /proc/stat devuelve null en vez de inventar un número", () => {
    expect(leerContadores("vaya por dios")).toBeNull();
    expect(leerContadores("cpu  1 2 3")).toBeNull(); // kernel sin `steal`: no se adivina
  });

  it("el uso de un intervalo reparte propio y steal, y los suma para el umbral", () => {
    const antes = leerContadores("cpu  0 0 0 0 0 0 0 0")!;
    const ahora = leerContadores("cpu  300 0 0 500 0 0 0 200")!;
    const u = usoEntre(antes, ahora)!;
    expect(u.propioPct).toBeCloseTo(30, 5);
    expect(u.stealPct).toBeCloseTo(20, 5);
    // EL STEAL CUENTA: es capacidad que no tenemos, aunque no la gastemos nosotros.
    expect(u.usadoPct).toBeCloseTo(50, 5);
  });

  it("un contador que RETROCEDE (la máquina se reinició) no produce muestra", () => {
    const antes = leerContadores("cpu  900 0 0 100 0 0 0 0")!;
    const ahora = leerContadores("cpu  10 0 0 10 0 0 0 0")!;
    expect(usoEntre(antes, ahora)).toBeNull();
  });

  it("la MEDIANA, no la media: un pico no la mueve", () => {
    const conPico = [10, 10, 10, 10, 100];
    expect(medianaUso(conPico)).toBe(10);
    // La media daria 28 y habria disparado el aviso.
    expect(conPico.reduce((a, b) => a + b, 0) / conPico.length).toBeCloseTo(28, 5);
  });
});

describe("cuándo avisa y cuándo no", () => {
  it("por debajo del umbral NO avisa, por mucho que se sostenga", async () => {
    const { adapter, enviados } = correoFalso();
    const v = vigilanteCon(todas(CPU_AVISO_PREPARATE_PCT - 10));
    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);

    const r = await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "junior@test.local" });
    expect(r.avisos).toEqual({ preparate: false, amplia: false });
    expect(enviados).toHaveLength(0);
  });

  it("con la ventana a MEDIAS no decide: diez minutos sostenidos tienen que serlo", async () => {
    // Sin esto, el aviso saltaria a los noventa segundos de arrancar el worker.
    const { adapter, enviados } = correoFalso();
    const v = vigilanteCon(todas(95, 5));
    await muestrear(v, 6);

    const r = await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "junior@test.local" });
    expect(r.mediana).toBeNull();
    expect(enviados).toHaveLength(0);
  });

  it("diez minutos por encima avisan UNA vez, y no se repite mientras siga arriba", async () => {
    const { adapter, enviados } = correoFalso();
    const v = vigilanteCon(todas(CPU_AVISO_PREPARATE_PCT + 5, CPU_MUESTRAS_VENTANA * 3));
    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);

    const primero = await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(primero.avisos.preparate).toBe(true);
    expect(enviados).toHaveLength(1);

    // Sigue arriba: silencio. Con el correo caido serian cien correos identicos en una hora.
    await muestrear(v, 5);
    const segundo = await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(segundo.avisos.preparate).toBe(false);
    expect(enviados).toHaveLength(1);
  });

  it("baja, se re-arma, y al volver a subir avisa OTRA vez", async () => {
    const { adapter, enviados } = correoFalso();
    const alto = todas(CPU_AVISO_PREPARATE_PCT + 5);
    const bajo = todas(5);
    const v = vigilanteCon([...alto, ...bajo, ...alto]);

    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);
    await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(enviados).toHaveLength(1);

    await muestrear(v, CPU_MUESTRAS_VENTANA); // la ventana se llena de muestras bajas
    await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(enviados, "no debe avisar al bajar").toHaveLength(1);

    await muestrear(v, CPU_MUESTRAS_VENTANA); // y vuelve a subir
    await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(enviados, "la segunda vez importa tanto como la primera").toHaveLength(2);
  });

  it("un pico de 2-3 minutos (el cron de puntuaciones) NO dispara", async () => {
    // ┌─ ESTE CASO SOLO VALE SI LA BASE ES REALISTA ────────────────────────────────────────────┐
    // │ Con el tráfico de fondo al 30 % (~100 personas) y tres minutos al tope, la MEDIA sale a │
    // │ 51 % y habría disparado; la MEDIANA se queda en 30 % y no. Con una base del 10 %, como  │
    // │ estaba escrito antes, la media daba 37 % y el caso pasaba también con la media: no      │
    // │ distinguía nada. Un test que pasa con el código roto es peor que no tenerlo.            │
    // └──────────────────────────────────────────────────────────────────────────────────────────┘
    const { adapter, enviados } = correoFalso();
    const base = 30;
    const v = vigilanteCon([...todas(base, 14), ...todas(100, 6)]);
    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);

    const media = (14 * base + 6 * 100) / CPU_MUESTRAS_VENTANA;
    expect(media, "la media habría disparado; de eso va el caso").toBeGreaterThan(
      CPU_AVISO_PREPARATE_PCT,
    );

    const r = await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(r.mediana).toBeLessThan(CPU_AVISO_PREPARATE_PCT);
    expect(enviados).toHaveLength(0);
  });
});

describe("los dos umbrales son independientes", () => {
  it("cruzar el de AMPLIAR no re-dispara el de PREPARARSE", async () => {
    const { adapter, enviados } = correoFalso();
    // Primero se cruza solo el bajo.
    const v = vigilanteCon([
      ...todas(CPU_AVISO_PREPARATE_PCT + 5),
      ...todas(CPU_AVISO_AMPLIA_PCT + 10),
    ]);
    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);
    await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.subject).toMatch(/Preparate/i);

    // Ahora se cruza tambien el alto: llega el segundo aviso, y SOLO el segundo.
    await muestrear(v, CPU_MUESTRAS_VENTANA);
    const r = await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(r.avisos).toEqual({ preparate: false, amplia: true });
    expect(enviados).toHaveLength(2);
    expect(enviados[1]!.subject).toMatch(/AMPLIA YA/i);
  });
});

describe("qué lleva el correo", () => {
  it("separa lo nuestro del steal, porque la ACCIÓN no es la misma", async () => {
    // Si lo que sube es el steal, una segunda vCPU no arregla nada: el problema esta en el
    // anfitrion. Contarlo junto para el umbral y enseñarlo separado es lo que evita comprar el
    // remedio equivocado.
    const { adapter, enviados } = correoFalso();
    const v = vigilanteCon(
      Array.from({ length: CPU_MUESTRAS_VENTANA }, () => ({
        propio: 20,
        steal: 40,
      })),
    );
    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);

    await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(enviados).toHaveLength(1);
    const texto = enviados[0]!.text ?? "";
    expect(texto).toMatch(/nuestro: 20[.,]0 %/);
    expect(texto).toMatch(/steal\): 40[.,]0 %/);
    expect(texto, "no dice que una vCPU no arregla el steal").toMatch(/no arregla nada/i);
  });

  it("NO dice cuántas personas son: esa cifra envejece con cada optimización", async () => {
    // El 50 % eran ~150 personas y, tras arreglar el plan del feed, son ~215. Una equivalencia
    // escrita en el correo se queda vieja sin que nadie la revise, y un aviso que miente deja de
    // leerse. El correo dice el porcentaje; las equivalencias viven en `constants.ts` con su SHA.
    const { adapter, enviados } = correoFalso();
    const v = vigilanteCon(todas(CPU_AVISO_AMPLIA_PCT + 5));
    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);
    await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });

    const correo = `${enviados[0]!.subject} ${enviados[0]!.text ?? ""}`;
    expect(correo).not.toMatch(/personas/i);
    // Y sí dice lo que no caduca: el porcentaje, el reparto y qué hacer.
    expect(correo).toMatch(/%/);
    expect(correo).toMatch(/steal/i);
    expect(correo).toMatch(/QUE HACER/);
  });

  it("lleva las 20 muestras y la hora en Europe/Madrid", async () => {
    const { adapter, enviados } = correoFalso();
    const v = vigilanteCon(todas(CPU_AVISO_PREPARATE_PCT + 5));
    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);

    // Enero: Madrid va en UTC+1, asi que las 10:30 UTC son las 11:30 locales. Con la hora en UTC
    // este caso se pondria rojo, que es el punto.
    await avisarSiCargaAlta(prisma, adapter, v, {
      adminEmail: "j@test.local",
      now: new Date(Date.UTC(2026, 0, 15, 10, 30, 0)),
    });
    const texto = enviados[0]!.text ?? "";
    expect(texto).toContain("11:30");
    expect((texto.match(/^ *\d+\. /gm) ?? []).length).toBe(CPU_MUESTRAS_VENTANA);
    // Y avisa de que un despliegue puede dispararlo: es el falso positivo que aceptamos.
    expect(texto).toMatch(/despliegue/i);
  });
});

describe("está cableado de verdad", () => {
  it("el worker construye el vigilante y se lo pasa al bucle", () => {
    // Sin esta línea el aviso es código muerto: todo lo de arriba seguiría verde y en producción
    // no se muestrearía nada. Casi se me queda fuera, así que queda atado.
    const fuente = readFileSync(join(process.cwd(), "scripts", "worker.ts"), "utf8");
    expect(fuente).toMatch(/vigilanteCapacidad:\s*new VigilanteCapacidad\(\)/);
  });

  it("y el bucle lo muestrea y lo consulta", () => {
    const fuente = readFileSync(join(process.cwd(), "src", "server", "jobs", "worker.ts"), "utf8");
    expect(fuente, "no muestrea").toMatch(/vigilanteCapacidad\.muestrear\(\)/);
    expect(fuente, "no comprueba los umbrales").toContain("avisarSiCargaAlta");
  });
});

describe("sin ADMIN_EMAIL", () => {
  it("lo registra y se queda ARMADO, para que salga en cuanto se configure", async () => {
    const { adapter, enviados } = correoFalso();
    const v = vigilanteCon(todas(CPU_AVISO_PREPARATE_PCT + 5, CPU_MUESTRAS_VENTANA * 2));
    await muestrear(v, CPU_MUESTRAS_VENTANA + 1);

    const logs: string[] = [];
    await avisarSiCargaAlta(prisma, adapter, v, { log: (m) => logs.push(m) });
    expect(enviados).toHaveLength(0);
    expect(logs.join("\n")).toMatch(/sin ADMIN_EMAIL/);

    // Y AHORA se configura: el aviso sale sin esperar a que baje y vuelva a cruzar. Si se hubiera
    // marcado disparado, el silencio duraria hasta el proximo cruce — que puede no llegar nunca.
    await muestrear(v, 3);
    await avisarSiCargaAlta(prisma, adapter, v, { adminEmail: "j@test.local" });
    expect(enviados).toHaveLength(1);
  });
});
