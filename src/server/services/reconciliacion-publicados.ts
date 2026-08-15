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
 * SALVAGUARDA anti-incidente: si un barrido degradaria MAS del tope (min(topeFilas, % de las
 * PUBLISHED)), ABORTA el modo "actuar" de ESE barrido, se queda en dry-run y LOGuea alarma: una
 * incidencia de Bunny con 404 masivos NO debe fulminar el catalogo.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { sanearError } from "@/server/observability/sanitize-error";

import { BunnyNotFoundError, type ClienteBunny, type ConfigBunny } from "./bunny";

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
  now?: Date;
  /** "dry-run" (defecto seguro): NO muta, solo LOGuea. "actuar": degrada los candidatos. */
  modo: "dry-run" | "actuar";
  /** Filas PUBLISHED por pagina (acota memoria/consultas). */
  lote: number;
  /** Cota de paginas por barrido (backstop anti-bucle). */
  maxPaginas?: number;
  /** TOPE de seguridad: se aborta "actuar" si los candidatos superan `min(topeFilas, ceil(total*topePct))`. */
  topeFilas: number;
  topePct: number; // 0..1
  log?: (m: string) => void;
}

export interface ResultadoPublicados {
  modo: "dry-run" | "actuar";
  /** Total de PUBLISHED al inicio (base del tope). */
  publicados: number;
  revisados: number;
  candidatos: number;
  degradados: number;
  reintentos: number;
  /** true si el tope de seguridad forzo dry-run (candidatos > tope). */
  abortadoPorTope: boolean;
}

const MOTIVO_FALLO = "OBJETO_INEXISTENTE";

/**
 * Un barrido. FASE 1: sonda cada PUBLISHED (getVideo) y recolecta los candidatos (objeto 404), sin
 * mutar nada. FASE 2: aplica el tope de seguridad y, si procede, degrada cada candidato a FAILED/
 * OBJETO_INEXISTENTE + AuditLog, en transaccion e idempotente (updateMany condicionado a SEGUIR
 * PUBLISHED). En dry-run (o si el tope aborta) solo se LOGuea. Un fallo por fila no rompe el barrido.
 */
export async function reconciliarPublicadosDesaparecidos(
  db: PrismaClient,
  cliente: ClienteBunny,
  config: ConfigBunny,
  opts: OpcionesPublicados,
): Promise<ResultadoPublicados> {
  const maxPaginas = opts.maxPaginas ?? 1000;

  const publicados = await db.video.count({ where: { status: "PUBLISHED" } });
  const tope = Math.min(opts.topeFilas, Math.ceil(publicados * opts.topePct));

  let revisados = 0;
  let reintentos = 0;
  const candidatosIds: { id: string; bunnyVideoId: string }[] = [];

  // FASE 1: sondear (keyset por id) y recolectar candidatos.
  let cursor: string | undefined;
  for (let page = 0; page < maxPaginas; page++) {
    const filas = await db.video.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, bunnyVideoId: true },
      orderBy: { id: "asc" },
      take: opts.lote,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (filas.length === 0) break;
    cursor = filas[filas.length - 1]!.id;

    for (const fila of filas) {
      revisados += 1;
      const d = decidirPublicado(await sondear(cliente, config, fila.bunnyVideoId));
      if (d.accion === "degradar") {
        candidatosIds.push({ id: fila.id, bunnyVideoId: fila.bunnyVideoId });
      } else if (d.accion === "reintentar") {
        reintentos += 1;
      }
    }
    if (filas.length < opts.lote) break;
  }

  const candidatos = candidatosIds.length;

  // SALVAGUARDA: candidatos por encima del tope -> se aborta "actuar" (posible incidencia masiva de Bunny).
  const abortadoPorTope = opts.modo === "actuar" && candidatos > tope;
  const actua = opts.modo === "actuar" && !abortadoPorTope;

  if (abortadoPorTope) {
    opts.log?.(
      `[worker] publicados ALARMA: ${candidatos} candidatos > tope ${tope} (de ${publicados} ` +
        `PUBLISHED); se ABORTA el modo actuar y se queda en dry-run. Revisar incidencia de Bunny.`,
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
    publicados,
    revisados,
    candidatos,
    degradados,
    reintentos,
    abortadoPorTope,
  };
}
