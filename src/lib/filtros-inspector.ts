/**
 * FILTROS del inspector de notificaciones del panel (PURO): de lo que llega por la URL a filtros
 * válidos. Lo que no valida se IGNORA (no revienta la página ni la API): un `tipo` inventado o una
 * fecha imposible dejan ese filtro sin aplicar.
 *
 * Las fechas son DÍAS UTC ENTEROS, como todo el proyecto: `hasta=2026-03-02` incluye el día 2 entero,
 * así que el límite que se aplica es el 3 a las 00:00 UTC, exclusivo.
 */
import { TipoNotificacionSchema, type TipoNotificacion } from "@/config/constants";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

export interface FiltrosInspector {
  /** Handle exacto, sin "@". */
  usuario: string | null;
  tipo: TipoNotificacion | null;
  /** Inicio inclusivo (00:00 UTC del día). */
  desde: Date | null;
  /** Fin EXCLUSIVO (00:00 UTC del día siguiente al elegido). */
  hasta: Date | null;
}

export interface FiltrosLeidos {
  filtros: FiltrosInspector;
  /** Los valores VÁLIDOS, tal cual, para repintar el formulario. */
  valores: { usuario: string; tipo: string; desde: string; hasta: string };
  /** Query string de los filtros válidos, para pedir la página siguiente con los mismos. */
  consulta: string;
}

function inicioDia(dia: string): Date | null {
  if (!DIA.test(dia)) return null;
  const t = Date.parse(`${dia}T00:00:00Z`);
  // `Date.parse` acepta "2026-02-31" y lo lleva a marzo: se exige que el día vuelva igual.
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== dia) return null;
  return new Date(t);
}

export function leerFiltrosInspector(crudo: {
  usuario?: string | null;
  tipo?: string | null;
  desde?: string | null;
  hasta?: string | null;
}): FiltrosLeidos {
  const usuario = (crudo.usuario ?? "").trim().replace(/^@/, "").slice(0, 60) || null;
  const tipoOk = TipoNotificacionSchema.safeParse(crudo.tipo);
  const tipo = tipoOk.success ? tipoOk.data : null;
  const desde = crudo.desde ? inicioDia(crudo.desde) : null;
  const hastaDia = crudo.hasta ? inicioDia(crudo.hasta) : null;
  const hasta = hastaDia ? new Date(hastaDia.getTime() + DIA_MS) : null;

  const valores = {
    usuario: usuario ?? "",
    tipo: tipo ?? "",
    desde: desde ? crudo.desde! : "",
    hasta: hastaDia ? crudo.hasta! : "",
  };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(valores)) if (v) qs.set(k, v);

  return { filtros: { usuario, tipo, desde, hasta }, valores, consulta: qs.toString() };
}
