/**
 * LIMPIEZA de objetos HUERFANOS en Bunny (reconciliacion Parte B, DESTRUCTIVA — con salvaguardas).
 * Objetos en la biblioteca sin fila util (creados pero la fila nunca cuajo, o filas ya FAILED) se
 * acumulan (coste + panel sucio). Un borrado en un proveedor es IRREVERSIBLE, asi que:
 *   - Arranca en DRY-RUN por defecto (env RECON_HUERFANOS_MODO): LOGuea que borraria, NO borra.
 *   - Las REGLAS de decision (decidirHuerfano) son PURAS, testeadas, y NUNCA borran algo que pueda
 *     estar vivo (PENDING/PUBLISHED/moderacion, o un objeto reciente sin fila -> ventana de la ruta).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { sanearError } from "@/server/observability/sanitize-error";

import type { ClienteBunny, ConfigBunny } from "./bunny";

/** Estados de la fila `Video` (== ModerationStatus) que le importan a la decision. */
export type EstadoFila = "PENDING" | "PUBLISHED" | "REJECTED" | "REMOVED" | "FAILED";

/** Lo que la decision necesita del objeto de Bunny (de List Videos). */
export interface ObjetoBunny {
  guid: string;
  /** Fecha de subida (ISO) que reporta Bunny; se usa la edad del objeto SIN fila. */
  dateUploaded: string;
}

/** Lo que la decision necesita de la fila en BD (o null si no existe). */
export interface FilaHuerfano {
  status: EstadoFila;
  updatedAt: Date;
}

export interface DecisionHuerfano {
  accion: "borrar" | "conservar";
  motivo: string;
}

/**
 * DECISION PURA (sin BD ni Bunny). REGLAS DE SEGURIDAD, duras y no negociables — borrar un objeto
 * VIVO es perder un video:
 *   - fila PENDING   -> CONSERVAR (puede estar subiendo).
 *   - fila PUBLISHED -> CONSERVAR (vivo).
 *   - fila REJECTED/REMOVED -> CONSERVAR (moderacion: fuera de alcance).
 *   - fila FAILED y (now - updatedAt) >= graciaMs -> BORRAR; si es reciente -> CONSERVAR.
 *   - SIN fila y (now - dateUploaded) >= umbralAbandonoMs -> BORRAR (huerfano sin fila).
 *   - SIN fila pero RECIENTE -> CONSERVAR: la ruta crea el objeto en Bunny ANTES de la fila; hay una
 *     ventana en la que un objeto legitimo aun no tiene fila.
 */
export function decidirHuerfano(
  objeto: ObjetoBunny,
  fila: FilaHuerfano | null,
  now: Date,
  opts: { graciaMs: number; umbralAbandonoMs: number },
): DecisionHuerfano {
  if (fila) {
    if (fila.status === "PENDING")
      return { accion: "conservar", motivo: "pending: puede estar subiendo" };
    if (fila.status === "PUBLISHED") return { accion: "conservar", motivo: "publicado: vivo" };
    if (fila.status === "REJECTED" || fila.status === "REMOVED") {
      return { accion: "conservar", motivo: "moderacion: fuera de alcance" };
    }
    // FAILED
    const edad = now.getTime() - fila.updatedAt.getTime();
    return edad >= opts.graciaMs
      ? { accion: "borrar", motivo: "fila fallida pasada la gracia" }
      : { accion: "conservar", motivo: "fila fallida reciente: dentro de la gracia" };
  }

  // SIN fila en BD.
  const subidoMs = Date.parse(objeto.dateUploaded);
  const edad = Number.isFinite(subidoMs) ? now.getTime() - subidoMs : 0;
  return edad >= opts.umbralAbandonoMs
    ? { accion: "borrar", motivo: "huerfano sin fila (pasado el umbral)" }
    : { accion: "conservar", motivo: "sin fila pero reciente: posible fila en curso" };
}

export interface OpcionesHuerfanos {
  now?: Date;
  /** "dry-run" (defecto seguro): NO borra, solo LOGuea. "borrar": borra los candidatos. */
  modo: "dry-run" | "borrar";
  perPage: number;
  graciaMs: number;
  umbralAbandonoMs: number;
  /** Cota de paginas por barrido (backstop anti-bucle, como el reaper). */
  maxPaginas?: number;
  log?: (m: string) => void;
}

export interface ResultadoHuerfanos {
  /** Modo del barrido ("dry-run"/"borrar"), para que el resumen del worker lo muestre SIEMPRE. */
  modo: "dry-run" | "borrar";
  revisados: number;
  candidatos: number;
  borrados: number;
  conservados: number;
}

/**
 * Un barrido: pagina la biblioteca de Bunny; por cada objeto busca su fila y decide. En "dry-run"
 * SOLO LOGuea los candidatos (deleteVideo NUNCA se llama); en "borrar" borra cada candidato. Un fallo
 * de red/Bunny/BD en un objeto NO rompe el barrido (try/catch por objeto) y NUNCA borra a ciegas.
 */
export async function limpiarHuerfanosBunny(
  db: PrismaClient,
  cliente: ClienteBunny,
  config: ConfigBunny,
  opts: OpcionesHuerfanos,
): Promise<ResultadoHuerfanos> {
  const now = opts.now ?? new Date();
  const maxPaginas = opts.maxPaginas ?? 1000;
  const decisionOpts = { graciaMs: opts.graciaMs, umbralAbandonoMs: opts.umbralAbandonoMs };

  let revisados = 0;
  let candidatos = 0;
  let borrados = 0;
  let conservados = 0;

  for (let page = 1; page <= maxPaginas; page++) {
    const { items, totalItems } = await cliente.listVideos({
      libraryId: config.libraryId,
      apiKey: config.apiKey,
      page,
      perPage: opts.perPage,
    });
    if (items.length === 0) break;

    for (const obj of items) {
      revisados += 1;

      let fila: FilaHuerfano | null;
      try {
        const row = await db.video.findUnique({
          where: { bunnyVideoId: obj.guid },
          select: { status: true, updatedAt: true },
        });
        fila = row ? { status: row.status as EstadoFila, updatedAt: row.updatedAt } : null;
      } catch (e) {
        // Fallo de BD -> CONSERVAR (nunca borrar sin poder comprobar la fila).
        opts.log?.(
          `[worker] huerfanos: fallo consultando la fila de ${obj.guid}: ${sanearError(e)}; se conserva`,
        );
        conservados += 1;
        continue;
      }

      const d = decidirHuerfano(obj, fila, now, decisionOpts);
      if (d.accion === "conservar") {
        conservados += 1;
        continue;
      }

      candidatos += 1;
      if (opts.modo === "dry-run") {
        opts.log?.(`[worker] huerfanos DRY-RUN: borraria ${obj.guid} (${d.motivo})`);
        continue;
      }
      try {
        await cliente.deleteVideo({
          libraryId: config.libraryId,
          apiKey: config.apiKey,
          videoId: obj.guid,
        });
        borrados += 1;
        opts.log?.(`[worker] huerfanos: borrado ${obj.guid} (${d.motivo})`);
      } catch (e) {
        // Un fallo al borrar NO rompe el barrido; no cuenta como borrado, se reintenta el proximo.
        opts.log?.(`[worker] huerfanos: fallo borrando ${obj.guid}: ${sanearError(e)}; sigue`);
      }
    }

    if (revisados >= totalItems || items.length < opts.perPage) break; // ultima pagina
  }

  // El RESUMEN lo loguea el bucle del worker (como confirm/reconcile); aqui solo van las lineas por
  // objeto (DRY-RUN/borrado), que ya dejan claro el modo. No duplicar el resumen.
  return { modo: opts.modo, revisados, candidatos, borrados, conservados };
}
