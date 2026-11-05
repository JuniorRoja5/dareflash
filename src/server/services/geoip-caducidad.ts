/**
 * ¿SE HA QUEDADO VIEJO EL FICHERO DE IP? — Fase 9 · P5, §4.2 del plan.
 *
 * Un job diario compara la FECHA DEL FICHERO con el reloj y, si pasa de `GEOIP_DIAS_CADUCA`, avisa al
 * admin una vez (histéresis compartida: `avisarConHisteresis`), y se re-arma solo cuando el fichero se
 * actualiza.
 *
 * SE MIRA LA FECHA DEL FICHERO, NO UNA FILA QUE ESCRIBA EL GUIÓN. Un guión que no se ejecuta no escribe
 * nada, y una fila que falta se lee igual que una instalación nueva. La antigüedad del fichero es el
 * único dato que sigue siendo cierto cuando el cron deja de correr, que es justo el fallo a detectar.
 *
 * SIN FICHERO TAMBIÉN SE AVISA (con su propio texto): la ubicación de todo el mundo es «desconocida» y
 * el aforo solo cuenta la zona global. No rompe nada, pero no puede pasar en silencio.
 *
 * Urgente pero no cierra nada: un fichero viejo sigue resolviendo, solo deriva. Lo que no se puede
 * permitir es que derive en silencio durante un año.
 */
import "server-only";

import { stat } from "node:fs/promises";

import { CLAVE_AVISO_GEOIP, GEOIP_DIAS_CADUCA } from "@/config/constants";
import type { PrismaClient } from "@/generated/prisma/client";
import { avisarConHisteresis } from "@/server/jobs/aviso-histeresis";
import type { EmailAdapter } from "@/server/email/adapter";

const DIA_MS = 24 * 60 * 60 * 1000;

async function fechaPorDefecto(ruta: string): Promise<number | null> {
  try {
    return (await stat(ruta)).mtimeMs;
  } catch {
    return null;
  }
}

export interface EstadoFicheroIp {
  /** `null` = no hay fichero. */
  dias: number | null;
  viejo: boolean;
}

/** Pura sobre la fecha: cuántos días tiene el fichero y si pasa del umbral. Sin fichero cuenta como viejo. */
export function estadoFicheroIp(fechaMs: number | null, ahoraMs: number): EstadoFicheroIp {
  if (fechaMs === null) return { dias: null, viejo: true };
  const dias = Math.floor((ahoraMs - fechaMs) / DIA_MS);
  return { dias, viejo: dias > GEOIP_DIAS_CADUCA };
}

export async function revisarFicheroGeoIp(
  db: PrismaClient,
  entrada: {
    ruta: string;
    adapter: EmailAdapter;
    adminEmail?: string;
    ahora?: Date;
    fechaFichero?: (ruta: string) => Promise<number | null>;
    log?: (m: string) => void;
  },
): Promise<{ estado: EstadoFicheroIp; avisado: boolean }> {
  const ahora = entrada.ahora ?? new Date();
  const fecha = await (entrada.fechaFichero ?? fechaPorDefecto)(entrada.ruta);
  const estado = estadoFicheroIp(fecha, ahora.getTime());
  const avisado = await avisarConHisteresis(db, {
    clave: CLAVE_AVISO_GEOIP,
    superado: estado.viejo,
    mensaje: () => ({
      to: "",
      subject:
        estado.dias === null
          ? "DareFlash: no hay fichero de geolocalización por IP"
          : `DareFlash: el fichero de geolocalización tiene ${estado.dias} días`,
      text:
        estado.dias === null
          ? `No se encuentra el fichero de IP en ${entrada.ruta}. Mientras falte, la ubicación de quien ` +
            "mira es «desconocida» y el aforo solo cuenta la zona global. Nada se rompe, pero la " +
            "publicidad local y su estimación se quedan sin datos. Revisa el guión mensual del host " +
            "(scripts/actualizar-geoip.sh) y su registro."
          : `El fichero de IP (${entrada.ruta}) tiene ${estado.dias} días; el umbral es ${GEOIP_DIAS_CADUCA} ` +
            "(dos ciclos mensuales perdidos). Sigue resolviendo, pero cada mes deriva más. Revisa el " +
            "guión mensual del host (scripts/actualizar-geoip.sh) y su registro.",
    }),
    sinDestinatario:
      "[worker] AVISO geoip: el fichero de IP falta o está viejo, pero no hay ADMIN_EMAIL.",
    enviado: "[worker] AVISO geoip enviado al admin.",
    adapter: entrada.adapter,
    adminEmail: entrada.adminEmail,
    log: entrada.log,
  });
  return { estado, avisado };
}
