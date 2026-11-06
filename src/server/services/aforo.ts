/**
 * EL AFORO POR ZONA — cuántas PERSONAS DISTINTAS pasaron por cada zona cada día (Fase 9 · P5, §5.3).
 *
 * ┌─ POR QUÉ EXISTE ANTES DE LA PRIMERA CAMPAÑA ──────────────────────────────────────────────────────┐
 * │ La estimación que se enseña antes de pagar (P6) es la mediana de 7 días de este número, y esa    │
 * │ estimación es la puerta de la compra: si se empezara a contar con la primera campaña, la primera │
 * │ empresa compraría a ciegas. Así que se cuenta YA, con los espectadores del feed (decidido con el │
 * │ analista: los huecos de anuncio no existen hasta P7).                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * UN HYPERLOGLOG POR ZONA Y DÍA en Redis (`PFADD`/`PFCOUNT`): O(1), 12 KB por clave sea cual sea el
 * tráfico, ≈0,8 % de error —invisible detrás de «unas 50 personas al día», redondeado a la baja— y, lo
 * que importa, NO GUARDA QUIÉN PASÓ: guarda un resumen del que no se puede sacar. Deduplica por
 * construcción: la misma sesión dos veces cuenta una.
 *
 * FUERA DEL CAMINO CRÍTICO: contar no se espera en el feed y nunca lanza; sin Redis no se cuenta y no se
 * rompe nada (Redis es opcional en este despliegue). Si Redis se cae se pierde ese rato de aforo, y la
 * mediana de 7 días ni se entera: por eso mediana y no media.
 *
 * MATERIALIZADO CADA HORA en `AforoZonaDia` con el RECUENTO ABSOLUTO (`PFCOUNT`), no con incrementos:
 * reejecutarlo converge, y el HLL no se borra al leerlo, así que no hay ventana en la que se pierda nada.
 */
import "server-only";

import {
  AFORO_MEDIANA_DIAS,
  AFORO_MIDE_DESDE_ISO,
  AFORO_TTL_S,
  type NivelAforo,
  NivelAforoSchema,
  ZONA_GLOBAL,
} from "@/config/constants";
import { type Ubicacion, type Zona, mediana, zonasDe } from "@/lib/geo";
import type { Db } from "@/server/db/types";

/** Lo de Redis que se usa aquí. `ioredis` lo cumple; los tests lo implementan en memoria. */
export interface RedisAforo {
  pipeline(): {
    pfadd(clave: string, ...miembros: string[]): unknown;
    sadd(clave: string, ...miembros: string[]): unknown;
    expire(clave: string, segundos: number): unknown;
    exec(): Promise<unknown>;
  };
  smembers(clave: string): Promise<string[]>;
  pfcount(clave: string): Promise<number>;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** El día UTC de un instante, como `AAAA-MM-DD`. El aforo se corta por días UTC (como el resto del producto). */
export function diaUtc(t: Date): string {
  return t.toISOString().slice(0, 10);
}

const claveHll = (dia: string, z: Zona) => `aforo:${dia}:${z.nivel}:${z.zona}`;
const claveZonas = (dia: string) => `aforo:${dia}:zonas`;

/**
 * Cuenta a una persona en las zonas de su ubicación (su ciudad, su estado, su país, y siempre la global).
 *
 * `quien` identifica a la PERSONA para deduplicar —el id de la sesión, o la IP ya hasheada de un
 * invitado—, nunca un dato en claro. Sin Redis o si Redis falla: no hace nada. No lanza nunca.
 */
export async function contarEnAforo(
  redis: RedisAforo | null,
  entrada: { quien: string; ubicacion: Ubicacion; ahora?: Date },
): Promise<void> {
  if (!redis) return;
  try {
    const dia = diaUtc(entrada.ahora ?? new Date());
    const p = redis.pipeline();
    for (const z of zonasDe(entrada.ubicacion)) {
      const k = claveHll(dia, z);
      p.pfadd(k, entrada.quien);
      p.expire(k, AFORO_TTL_S);
      // El ÍNDICE de zonas del día: la materialización no puede hacer `SCAN` sobre todo Redis.
      p.sadd(claveZonas(dia), `${z.nivel}|${z.zona}`);
    }
    p.expire(claveZonas(dia), AFORO_TTL_S);
    await p.exec();
  } catch {
    // Se pierde esta cuenta. El aforo es una estimación con mediana de 7 días: aguanta.
  }
}

/**
 * Pasa el aforo de HOY y de AYER de Redis a `AforoZonaDia`, con el recuento absoluto. Ayer también,
 * porque la última hora de ayer solo se ve en la primera pasada de hoy. Idempotente: reejecutar escribe
 * las mismas cifras. Sin Redis, no hace nada (y lo dice).
 */
export async function materializarAforo(
  db: Db,
  redis: RedisAforo | null,
  ahora: Date = new Date(),
): Promise<{ filas: number; sinRedis: boolean }> {
  if (!redis) return { filas: 0, sinRedis: true };
  let filas = 0;
  for (const dia of [diaUtc(ahora), diaUtc(new Date(ahora.getTime() - DIA_MS))]) {
    for (const miembro of await redis.smembers(claveZonas(dia))) {
      const [nivelCrudo, zona] = miembro.split("|");
      const nivel = NivelAforoSchema.safeParse(nivelCrudo);
      if (!nivel.success || !zona) continue;
      const personas = await redis.pfcount(claveHll(dia, { nivel: nivel.data, zona }));
      // Recuento ABSOLUTO, nunca `increment`: lo que se escribe es lo que hay.
      await db.$executeRaw`
        INSERT INTO \`AforoZonaDia\` (\`alcance\`, \`zona\`, \`dia\`, \`personas\`, \`updatedAt\`)
        VALUES (${nivel.data}, ${zona}, ${dia}, ${personas}, NOW(3))
        ON DUPLICATE KEY UPDATE \`personas\` = VALUES(\`personas\`), \`updatedAt\` = NOW(3)`;
      filas += 1;
    }
  }
  return { filas, sinRedis: false };
}

/** Opciones de lectura del aforo. `midiendoDesde` solo lo cambian los tests: en el producto, la constante. */
export interface OpcionesAforo {
  midiendoDesde?: Date;
}

/**
 * LOS DÍAS MEDIDOS de la ventana: los últimos `AFORO_MEDIANA_DIAS` días COMPLETOS (hoy no: está a medias),
 * desde `AFORO_MIDE_DESDE_ISO`, que además tienen fila GLOBAL. Ver la constante: sin fila GLOBAL ese día
 * no se midió nada, y un día sin medir no es un día sin visitas.
 */
async function diasMedidos(db: Db, ahora: Date, opciones: OpcionesAforo): Promise<string[]> {
  const hoy = new Date(`${diaUtc(ahora)}T00:00:00.000Z`);
  const inicioVentana = new Date(hoy.getTime() - AFORO_MEDIANA_DIAS * DIA_MS);
  const mideDesde = opciones.midiendoDesde ?? new Date(`${AFORO_MIDE_DESDE_ISO}T00:00:00.000Z`);
  const desde = inicioVentana > mideDesde ? inicioVentana : mideDesde;
  if (desde >= hoy) return [];
  const filas = await db.aforoZonaDia.findMany({
    where: { alcance: "GLOBAL", zona: ZONA_GLOBAL, dia: { gte: desde, lt: hoy } },
    select: { dia: true },
  });
  return filas.map((f) => diaUtc(f.dia));
}

/**
 * LAS MEDIANAS DE VARIAS ZONAS DE UN NIVEL, en dos consultas (los días medidos y las filas). Es la que
 * usa la estimación de P6, que necesita a la vez las decenas de ciudades de un radio.
 *
 * Por cada zona: `null` si no hay ningún día medido en la ventana («no sabemos»); si los hay, la
 * mediana sobre ESOS días, contando 0 en los que la zona no tiene fila («no vino nadie»). Las dos cosas
 * son distintas y por eso no se devuelven igual.
 */
export async function medianasAforo(
  db: Db,
  nivel: NivelAforo,
  zonas: readonly string[],
  ahora: Date = new Date(),
  opciones: OpcionesAforo = {},
): Promise<Map<string, number | null>> {
  const resultado = new Map<string, number | null>();
  const medidos = await diasMedidos(db, ahora, opciones);
  if (medidos.length === 0 || zonas.length === 0) {
    for (const z of zonas) resultado.set(z, null);
    return resultado;
  }
  const filas = await db.aforoZonaDia.findMany({
    // La columna es `alcance` (ver el modelo): en el código, el nivel de la zona.
    where: {
      alcance: nivel,
      zona: { in: [...new Set(zonas)] },
      dia: { in: medidos.map((d) => new Date(`${d}T00:00:00.000Z`)) },
    },
    select: { zona: true, dia: true, personas: true },
  });
  const porZona = new Map<string, Map<string, number>>();
  for (const f of filas) {
    const m = porZona.get(f.zona) ?? new Map<string, number>();
    m.set(diaUtc(f.dia), f.personas);
    porZona.set(f.zona, m);
  }
  for (const z of zonas) {
    const deLaZona = porZona.get(z);
    resultado.set(z, mediana(medidos.map((d) => deLaZona?.get(d) ?? 0)));
  }
  return resultado;
}

/** LA MEDIANA DEL AFORO de UNA zona. Ver `medianasAforo`. */
export async function medianaAforo(
  db: Db,
  zona: Zona,
  ahora: Date = new Date(),
  opciones: OpcionesAforo = {},
): Promise<number | null> {
  return (await medianasAforo(db, zona.nivel, [zona.zona], ahora, opciones)).get(zona.zona) ?? null;
}

/**
 * LA ESTIMACIÓN CON SU CASCADA (§3.5 bis): la primera zona, en el orden dado, con tráfico medido. Quien
 * llama pasa la cascada de SU espacio (Ciudad → Estado → País para lo local; País → Global para lo
 * global): subir de ciudad a global cruzaría los dos espacios y la cifra dejaría de describir lo que se
 * compra. Devuelve DE QUÉ NIVEL es la cifra, para que la frase lo diga («En Colombia, unas 300…»).
 *
 * Sube de nivel con `null` (sin datos) Y con 0 (medido, pero no vino nadie): «unas 0 personas al día» no
 * se le enseña a nadie. `null` = ningún nivel tiene tráfico, y entonces se dice, no se enseña un 0.
 */
export async function aforoEnCascada(
  db: Db,
  cascada: readonly Zona[],
  ahora: Date = new Date(),
  opciones: OpcionesAforo = {},
): Promise<{ nivel: NivelAforo; zona: string; personas: number } | null> {
  for (const z of cascada) {
    const m = await medianaAforo(db, z, ahora, opciones);
    if (m !== null && m > 0) return { nivel: z.nivel, zona: z.zona, personas: m };
  }
  return null;
}
