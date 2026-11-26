import type { FuncionT } from "@/textos/plantilla";
import { textos, type Textos } from "@/textos/servidor";
import { importeConMoneda } from "@/lib/dinero";
import type { MovimientoMonedero } from "@/server/services/retirada";
import { PasosKeyset } from "@/components/ui/pasos-keyset";
import type { Paginacion } from "@/lib/paginacion-pila";
import { CLAVES_MOVIMIENTOS } from "@/lib/paginas-monedero";
import { formatearFechaParaQuienMira, type Idioma, type ZonaHoraria } from "@/lib/formato";

/**
 * ÚLTIMOS MOVIMIENTOS — de dónde sale y a dónde va el saldo.
 *
 * ┌─ EXISTE PORQUE EL SALDO TENÍA QUE PODER EXPLICARSE ───────────────────────────────────────────┐
 * │ Desde que el equipo puede ajustar un monedero a mano, una cuenta puede ver su dinero cambiar  │
 * │ sin una sola línea que lo cuente. Un saldo que se mueve solo no se distingue de un error, y   │
 * │ la persona que lo nota escribe a soporte — o peor, no escribe y desconfía.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL AJUSTE SE LLAMA "AJUSTE DEL EQUIPO", no "premio". Disfrazarlo sería mentir en el historial de
 * dinero de alguien. Lo que NO se enseña es el MOTIVO que escribió el admin ni QUIÉN lo firmó: eso
 * es traza interna y vive en el `AuditLog` —misma disciplina que la nota del ajuste de puntos—, y
 * por eso el DTO ni siquiera trae el `refId`, que en un ajuste es el id del admin.
 *
 * LA FRASE LA PONE EL COPY, NO LA FILA (`monedero.concepto_*`): la fila guarda el hecho —`refType`—
 * así que reescribir el texto reescribe también los movimientos viejos en vez de congelarlos. Y un
 * `refType` que ya no esté en el catálogo cae en un genérico honesto en lugar de dejar un hueco.
 *
 * PÁGINAS DE 10, POR KEYSET (PU1): antes era un tope —los 10 últimos— y ahora se recorre entero con
 * `PasosKeyset`, que REEMPLAZA la página. Su posición viaja en `movimientos=` y lleva la de las
 * solicitudes tal como está (`lib/paginas-monedero`): pasar de página aquí no mueve la otra lista.
 */
/** La caja de la lista: el mismo cristal que el resto de bloques de la pantalla. */
const CAJA =
  "rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-sm)] backdrop-blur-md";
const TH =
  "py-3 pr-4 text-2xs font-semibold tracking-widest whitespace-nowrap text-text-dim uppercase";

const fecha = (d: Date, idioma: Idioma, zona: ZonaHoraria | null) =>
  formatearFechaParaQuienMira(d, idioma, zona, "diaMesAno");
/** El concepto por su `refType`; uno que ya no está en el catálogo se dice con el genérico. */
function concepto(t: FuncionT<Textos["monedero"]>, m: MovimientoMonedero): string {
  switch (m.concepto) {
    case "PRIZE":
      return t("concepto_PRIZE");
    case "WITHDRAWAL":
      return t("concepto_WITHDRAWAL");
    case "WITHDRAWAL_REFUND":
      return t("concepto_WITHDRAWAL_REFUND");
    case "ADMIN":
      return t("concepto_ADMIN");
    default:
      return t("conceptoOtro");
  }
}

/**
 * EL SIGNO SIEMPRE, también en lo que entra: en una lista donde hay de los dos, un importe sin signo
 * obliga a deducir la dirección por el concepto.
 */
function Importe({ m, idioma }: { m: MovimientoMonedero; idioma: Idioma }) {
  const entra = m.amountCents > 0;
  return (
    <span className={`tabular-nums ${entra ? "text-money" : "text-text-dim"}`}>
      {entra ? "+" : "−"}
      {importeConMoneda(Math.abs(m.amountCents), idioma, m.currency)}
    </span>
  );
}

export async function MovimientosMonedero({
  movimientos,
  proximoCursor,
  aqui,
  conservar,
  idioma,
  zona,
}: {
  movimientos: MovimientoMonedero[];
  /** Cursor de la página siguiente, o `null` si esta era la última. */
  proximoCursor: string | null;
  /** Dónde está ESTA lista. */
  aqui: Paginacion;
  /** La posición de la OTRA lista (las solicitudes), que el enlace lleva tal cual. */
  conservar: Readonly<Record<string, string | null>>;
  idioma: Idioma;
  zona: ZonaHoraria | null;
}) {
  const t = await textos("monedero");
  return (
    <section aria-labelledby="movimientos">
      <h2 id="movimientos" className="font-medium text-text">
        {t("movimientos")}
      </h2>
      {movimientos.length === 0 ? (
        <p className="mt-3 text-sm text-text-dim">
          {aqui.cursor !== null ? t("movimientosVacioPosterior") : t("movimientosVacio")}
        </p>
      ) : (
        <>
          {/* ESCRITORIO: TABLA. Fecha, concepto e importe en su columna, para bajar por la de los
              importes de un vistazo. */}
          <div className={`mt-3 hidden overflow-x-auto md:block ${CAJA}`}>
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-line">
                <tr>
                  <th className={`pl-4 ${TH}`}>{t("col_fecha")}</th>
                  <th className={TH}>{t("col_concepto")}</th>
                  <th className={`text-right ${TH}`}>{t("col_importe")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {movimientos.map((m) => (
                  <tr key={m.id} data-movimiento={m.id}>
                    <td className="py-3 pr-4 pl-4 whitespace-nowrap text-text-dim tabular-nums">
                      {fecha(m.createdAt, idioma, zona)}
                    </td>
                    <td className="py-3 pr-4 text-text">{concepto(t, m)}</td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      <Importe m={m} idioma={idioma} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MÓVIL: una fila por movimiento, el importe a la derecha y la fecha bajo el concepto. */}
          <ul className={`mt-3 divide-y divide-line md:hidden ${CAJA}`}>
            {movimientos.map((m) => (
              <li
                key={m.id}
                data-movimiento-movil={m.id}
                className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block text-text">{concepto(t, m)}</span>
                  <span className="block text-2xs text-text-dim">
                    {fecha(m.createdAt, idioma, zona)}
                  </span>
                </span>
                <span className="shrink-0">
                  <Importe m={m} idioma={idioma} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {/* FUERA del `if` de la lista: en una página posterior vacía, «Anterior» tiene que seguir aquí. */}
      <PasosKeyset
        base="/wallet"
        aqui={aqui}
        proximoCursor={proximoCursor}
        filtro={conservar}
        claves={CLAVES_MOVIMIENTOS}
        ancla="movimientos"
        etiqueta={t("paginasMovimientos")}
      />
    </section>
  );
}
