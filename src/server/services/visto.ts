/**
 * GATE DE "VISTO" — la marca de que un usuario ha REPRODUCIDO una participación, que la ruta de voto
 * exigirá antes de aceptar el voto.
 *
 * QUÉ ES Y QUÉ NO: es FRICCIÓN DELIBERADA, no una garantía. La marca la pide el CLIENTE tras unos
 * segundos de reproducción, y el servidor no puede comprobar que el vídeo se viera de verdad: quien
 * quiera puede llamar al endpoint sin reproducir nada. Sirve para que votar exija al menos abrir el
 * vídeo. Contra el fraude real está el pago manual, no esto. Por eso NO se sobre-ingenieriza con
 * anti-spoof (tokens de reproducción, comprobación de segmentos servidos…): coste alto, ganancia nula.
 *
 * ┌─ DÓNDE VIVE LA MARCA, Y POR QUÉ DEGRADA COMO DEGRADA ──────────────────────────────────────────┐
 * │ En REDIS, con TTL. Es un dato efímero por naturaleza (vale unos minutos y no interesa después),  │
 * │ así que un TTL lo caduca solo: NO crece sin límite y NO abre una retención nueva que mantener.   │
 * │ En BD habría hecho falta tabla, migración y OTRO barrido de purga para el mismo efecto.          │
 * │                                                                                                 │
 * │ PERO Redis es OPCIONAL en este despliegue, y CLAUDE.md lo dice explícito: "Redis está montado    │
 * │ pero sin usar para nada crítico; MariaDB es la fuente de verdad". Sin Redis (o con Redis caído)  │
 * │ solo hay dos salidas, y las dos son decisiones, no detalles:                                     │
 * │   - decir que NADIE ha visto nada -> NADIE PUEDE VOTAR. Una caché opcional tumbaría la función   │
 * │     central del producto. Inaceptable.                                                           │
 * │   - decir que TODOS han visto -> el gate desaparece y votar vuelve a ser directo.                │
 * │ Se elige la SEGUNDA (fail-open), y es coherente: lo que se pierde es una fricción que ya era     │
 * │ spoofeable, no una protección. Además es lo que mantiene cierta la regla de CLAUDE.md — Redis    │
 * │ sigue sin ser crítico PRECISAMENTE porque el sistema funciona sin él.                            │
 * │ No es silencioso: cada vez que degrada lo DICE en el log. Un gate que no gatea sin que nadie se  │
 * │ entere sería el mismo anti-patrón que acabamos de arreglar con la retención.                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import "server-only";

import { VISTO_TTL_SEC } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";

import { getRedis } from "../cache/redis";

/**
 * Almacén de marcas. Inyectable para testear sin Redis. `existe` devuelve `null` cuando el almacén NO
 * está disponible —que es distinto de "no hay marca" (`false`)— y es esa diferencia la que permite
 * degradar a conciencia en vez de confundir "Redis caído" con "no lo ha visto".
 */
export interface AlmacenVisto {
  marcar(clave: string, ttlSec: number): Promise<void>;
  existe(clave: string): Promise<boolean | null>;
}

/** Almacén NULO: sin `REDIS_URL` no hay dónde marcar, y `existe` lo dice con `null`. */
const almacenNulo: AlmacenVisto = {
  async marcar() {
    /* no-op */
  },
  async existe() {
    return null;
  },
};

let memo: AlmacenVisto | null = null;

export function getAlmacenVisto(): AlmacenVisto {
  if (memo) return memo;
  const redis = getRedis();
  if (!redis) {
    memo = almacenNulo;
    return memo;
  }
  memo = {
    async marcar(clave, ttlSec) {
      await redis.set(clave, "1", "EX", ttlSec);
    },
    async existe(clave) {
      return (await redis.exists(clave)) === 1;
    },
  };
  return memo;
}

/** Clave de la marca. Contiene ids internos, nunca datos personales. */
export function claveVisto(userId: string, submissionId: string): string {
  return `visto:${userId}:${submissionId}`;
}

export type ResultadoVisto =
  { marcado: true } | { marcado: false; motivo: "SIN_PARTICIPACION" | "NO_PUBLICADA" };

/**
 * ¿Esta participación se puede ver públicamente? "Regla del más restrictivo": la Submission Y su vídeo
 * tienen que estar PUBLISHED, igual que en el resto del sistema.
 *
 * Vive aquí, y no duplicada en cada consumidor, porque la usan las DOS puertas de la participación
 * (marcar visto y votar) y la respuesta que dan tiene que ser LA MISMA: si una considerase visible algo
 * que la otra no, la diferencia sería un oráculo para enumerar lo oculto. Devuelve el motivo, no un
 * booleano, para que quien llame pueda distinguirlos internamente — aunque hacia fuera colapsen los dos
 * en el mismo 404.
 */
export async function visibilidadParticipacion(
  db: PrismaClient,
  submissionId: string,
): Promise<{ visible: true } | { visible: false; motivo: "SIN_PARTICIPACION" | "NO_PUBLICADA" }> {
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    select: { status: true, video: { select: { status: true } } },
  });
  if (!sub) return { visible: false, motivo: "SIN_PARTICIPACION" };
  if (sub.status !== "PUBLISHED" || sub.video.status !== "PUBLISHED") {
    return { visible: false, motivo: "NO_PUBLICADA" };
  }
  return { visible: true };
}

/**
 * Deja la marca "este usuario ha visto esta participación".
 *
 * Solo para participaciones PUBLICADAS, con la misma "regla del más restrictivo" que usa el resto del
 * sistema (Submission Y Video): marcar como vista algo que no se puede ver no significa nada, y sin la
 * guarda el endpoint aceptaría ids arbitrarios y llenaría Redis de claves inútiles.
 */
export async function marcarVisto(
  db: PrismaClient,
  input: { userId: string; submissionId: string },
  almacen: AlmacenVisto = getAlmacenVisto(),
): Promise<ResultadoVisto> {
  const v = await visibilidadParticipacion(db, input.submissionId);
  if (!v.visible) return { marcado: false, motivo: v.motivo };

  try {
    await almacen.marcar(claveVisto(input.userId, input.submissionId), VISTO_TTL_SEC);
  } catch (e) {
    // Un fallo del almacén NO rompe la reproducción: el usuario está viendo un vídeo, no haciendo una
    // operación con efectos. Lo peor que pasa es que luego el gate le pida reproducir otra vez.
    console.warn("[visto] no se pudo dejar la marca:", e instanceof Error ? e.message : e);
  }
  return { marcado: true };
}

/**
 * ¿Este usuario ha visto esta participación? Lo consultará la ruta de voto.
 *
 * DEGRADA A `true` cuando el almacén no está disponible (ver la caja de arriba): sin Redis nadie
 * podría votar nunca, y lo que se pierde es una fricción spoofeable, no una protección.
 */
export async function haVisto(
  input: { userId: string; submissionId: string },
  almacen: AlmacenVisto = getAlmacenVisto(),
): Promise<boolean> {
  let hay: boolean | null;
  try {
    hay = await almacen.existe(claveVisto(input.userId, input.submissionId));
  } catch (e) {
    console.warn("[visto] el almacen fallo al consultar:", e instanceof Error ? e.message : e);
    hay = null;
  }
  if (hay === null) {
    // NO silencioso: si el gate deja de gatear, se dice. Un gate que no gatea sin que nadie se entere
    // es exactamente el anti-patron de "proteccion documentada que no existe".
    console.warn(
      "[visto] sin almacen disponible: el gate de 'visto' NO se aplica y se deja votar. " +
        "Revisar REDIS_URL / el estado de Redis.",
    );
    return true;
  }
  return hay;
}
