/**
 * RECONCILIACION Parte C: PUBLICADOS DESAPARECIDOS (integridad de datos, carril 4 — NO moderacion).
 *
 * Detecta filas Video status=PUBLISHED cuyo objeto en Bunny YA NO existe (getVideo -> 404). El feed y
 * el cliente ya las ocultan con gracia, pero la fila quedaria PUBLISHED indefinidamente y ninguna otra
 * pasada la cubre (Parte A solo barre PENDING; Parte B itera la biblioteca —un objeto inexistente no
 * aparece— y ademas conserva las PUBLISHED). Esta pasada las SACA del estado "en vivo" de forma NO
 * destructiva: NO borra nada en Bunny (el objeto ya no existe, no hay nada que borrar) NI borra la
 * fila; solo la degrada a FAILED / OBJETO_INEXISTENTE (una LAPIDA: "retirar no es eliminar"). NO usa
 * REMOVED (reservado a la MODERACION de Fase 5, fuera de alcance). Idempotente: una vez FAILED la fila
 * ya no es PUBLISHED, asi que un barrido posterior no la re-selecciona.
 *
 * INCREMENTAL con COBERTURA COMPLETA (escala): sondear TODOS los PUBLISHED cada ciclo no escala y un
 * cursor local topado por paginas solo revisaria la CABEZA del catalogo. En su lugar cada barrido lee
 * un CURSOR ROTATORIO persistido en SystemState, sonda como mucho `lotePorCiclo` filas con `id > cursor`
 * y guarda el ultimo id como nuevo cursor; al llegar al fin de la tabla (vuelven menos de `lotePorCiclo`)
 * REINICIA el cursor -> round-robin que, a lo largo de muchos barridos, cubre TODO el catalogo con coste
 * FIJO por ciclo. El keyset por id tolera que filas dejen de ser PUBLISHED entre barridos (id > cursor
 * avanza igual).
 *
 * SALVAGUARDA anti-incidente (tope RELATIVO al lote, sin base en el total): ABORTA el modo "actuar" de
 * ESE barrido si los candidatos superan `min(topeFilas, ceil(revisados_del_barrido * topePct))` y se
 * queda en dry-run + alarma. Asi una incidencia de Bunny (casi todo el lote en 404) aborta en cada
 * barrido afectado, mientras que lo normal (0-pocos huerfanos por lote) procede.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { sanearError } from "@/server/observability/sanitize-error";
import { escribirEstado, leerEstado } from "@/server/services/system-state";

import { BunnyNotFoundError, type ClienteBunny, type ConfigBunny } from "./bunny";

/** Clave en SystemState del cursor rotatorio del barrido (ultimo id sondeado). Fuente unica aqui. */
export const RECON_PUBLICADOS_CURSOR_KEY = "recon_publicados_cursor";

/** Resultado de consultar el objeto en Bunny, ya CLASIFICADO (la llamada + try/catch lo produce). */
export type SondeoBunny = "existe" | "no-existe" | "error-transitorio";

export interface DecisionPublicado {
  accion: "degradar" | "conservar" | "reintentar";
  motivo: string;
}

/**
 * DECISION PURA (sin BD ni Bunny). SOLO el 404 tipado degrada; un error de RED/HTTP se REINTENTA el
 * proximo barrido (jamas se penaliza una fila por un fallo transitorio); si el objeto existe, se
 * conserva. Testeable en aislamiento (estilo decidirHuerfano / decidirTransicion).
 */
export function decidirPublicado(sondeo: SondeoBunny): DecisionPublicado {
  switch (sondeo) {
    case "no-existe":
      return { accion: "degradar", motivo: "el objeto ya no existe en Bunny (404)" };
    case "error-transitorio":
      return { accion: "reintentar", motivo: "fallo transitorio consultando Bunny: se reintenta" };
    case "existe":
      return { accion: "conservar", motivo: "el objeto existe: vivo" };
  }
}

/** Clasifica el resultado de getVideo (404 tipado -> no-existe; red/HTTP -> transitorio; ok -> existe). */
async function sondear(
  cliente: ClienteBunny,
  config: ConfigBunny,
  bunnyVideoId: string,
): Promise<SondeoBunny> {
  try {
    await cliente.getVideo({
      libraryId: config.libraryId,
      apiKey: config.apiKey,
      videoId: bunnyVideoId,
    });
    return "existe";
  } catch (e) {
    if (e instanceof BunnyNotFoundError) return "no-existe";
    return "error-transitorio"; // red/HTTP: NUNCA degradar por un transitorio
  }
}

export interface OpcionesPublicados {
  /** "dry-run" (defecto seguro): NO muta, solo LOGuea. "actuar": degrada los candidatos. */
  modo: "dry-run" | "actuar";
  /** Filas sondeadas por barrido (coste FIJO por ciclo, sea cual sea el tamaño del catalogo). */
  lotePorCiclo: number;
  /** TOPE de seguridad RELATIVO al lote: se aborta "actuar" si candidatos > `min(topeFilas, ceil(revisados*topePct))`. */
  topeFilas: number;
  topePct: number; // 0..1
  log?: (m: string) => void;
}

export interface ResultadoPublicados {
  modo: "dry-run" | "actuar";
  /** Filas sondeadas en ESTE barrido (base del tope relativo). */
  revisados: number;
  candidatos: number;
  degradados: number;
  reintentos: number;
  /** true si el tope de seguridad forzo dry-run (candidatos > tope). */
  abortadoPorTope: boolean;
  /** true si el barrido llego al fin de la tabla y REINICIO el cursor (wrap round-robin). */
  reinicioCursor: boolean;
}

const MOTIVO_FALLO = "OBJETO_INEXISTENTE";

/**
 * Un barrido INCREMENTAL. FASE 1: lee el cursor rotatorio, sonda hasta `lotePorCiclo` filas con
 * `id > cursor` (getVideo) y recolecta los candidatos (objeto 404), sin mutar nada; avanza/reinicia el
 * cursor. FASE 2: aplica el tope de seguridad relativo y, si procede, degrada cada candidato a FAILED/
 * OBJETO_INEXISTENTE + AuditLog, en transaccion e idempotente (updateMany condicionado a SEGUIR
 * PUBLISHED). En dry-run (o si el tope aborta) solo se LOGuea. Un fallo por fila no rompe el barrido.
 */
export async function reconciliarPublicadosDesaparecidos(
  db: PrismaClient,
  cliente: ClienteBunny,
  config: ConfigBunny,
  opts: OpcionesPublicados,
): Promise<ResultadoPublicados> {
  // FASE 1: leer el cursor rotatorio y sondear un LOTE acotado a partir de el (keyset por id).
  const cursor = (await leerEstado(db, RECON_PUBLICADOS_CURSOR_KEY)) ?? "";
  const filas = await db.video.findMany({
    where: { status: "PUBLISHED", id: { gt: cursor } },
    select: { id: true, bunnyVideoId: true },
    orderBy: { id: "asc" },
    take: opts.lotePorCiclo,
  });

  let revisados = 0;
  let reintentos = 0;
  const candidatosIds: { id: string; bunnyVideoId: string }[] = [];
  for (const fila of filas) {
    revisados += 1;
    const d = decidirPublicado(await sondear(cliente, config, fila.bunnyVideoId));
    if (d.accion === "degradar") {
      candidatosIds.push({ id: fila.id, bunnyVideoId: fila.bunnyVideoId });
    } else if (d.accion === "reintentar") {
      reintentos += 1;
    }
  }

  // Cursor rotatorio: si volvieron MENOS de `lotePorCiclo` es el fin de la tabla -> reiniciar (wrap),
  // asi el proximo barrido vuelve al principio. Si no, avanzar al ultimo id sondeado.
  const reinicioCursor = filas.length < opts.lotePorCiclo;
  const nuevoCursor = reinicioCursor ? "" : filas[filas.length - 1]!.id;
  await escribirEstado(db, RECON_PUBLICADOS_CURSOR_KEY, nuevoCursor);

  const candidatos = candidatosIds.length;

  // SALVAGUARDA (tope RELATIVO a lo sondeado en ESTE barrido): candidatos por encima del tope ->
  // se aborta "actuar" (posible incidencia masiva de Bunny: casi todo el lote en 404).
  const tope = Math.min(opts.topeFilas, Math.ceil(revisados * opts.topePct));
  const abortadoPorTope = opts.modo === "actuar" && candidatos > tope;
  const actua = opts.modo === "actuar" && !abortadoPorTope;

  if (abortadoPorTope) {
    opts.log?.(
      `[worker] publicados ALARMA: ${candidatos} candidatos > tope ${tope} (de ${revisados} ` +
        `sondeadas este barrido); se ABORTA el modo actuar y se queda en dry-run. Revisar incidencia de Bunny.`,
    );
  }

  // FASE 2: degradar (o loguear en dry-run/abortado).
  let degradados = 0;
  for (const c of candidatosIds) {
    if (!actua) {
      opts.log?.(
        `[worker] publicados DRY-RUN: degradaria ${c.id} (objeto ${c.bunnyVideoId} inexistente)`,
      );
      continue;
    }
    try {
      const hecho = await db.$transaction(async (tx) => {
        // Condicionado a SEGUIR PUBLISHED: si otra pasada/moderacion ya lo cambio, no re-degradamos.
        const r = await tx.video.updateMany({
          where: { id: c.id, status: "PUBLISHED" },
          data: { status: "FAILED", failureReason: MOTIVO_FALLO },
        });
        if (r.count !== 1) return false;
        await tx.auditLog.create({
          data: {
            action: "VIDEO_OBJETO_INEXISTENTE",
            targetType: "VIDEO",
            targetId: c.id,
            metadata: { bunnyVideoId: c.bunnyVideoId, motivo: MOTIVO_FALLO },
          },
        });
        return true;
      });
      if (hecho) {
        degradados += 1;
        opts.log?.(`[worker] publicados: degradado ${c.id} -> FAILED/${MOTIVO_FALLO}`);
      }
    } catch (e) {
      opts.log?.(`[worker] publicados: fallo degradando ${c.id}: ${sanearError(e)}; sigue`);
    }
  }

  return {
    modo: actua ? "actuar" : "dry-run",
    revisados,
    candidatos,
    degradados,
    reintentos,
    abortadoPorTope,
    reinicioCursor,
  };
}
