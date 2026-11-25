import type { MovimientoCreditoEmpresa } from "@/server/services/creditos";
import { textos } from "@/textos/servidor";
import {
  formatearNumero,
  formatearFechaParaQuienMira,
  type Idioma,
  type ZonaHoraria,
} from "@/lib/formato";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/**
 * EL RECIBO DE UNA COMPRA (P11): enlace normal, no del router —la ruta lleva a la página del recibo de
 * Stripe, otro origen—, y en pestaña nueva para no sacar a la empresa de su historial. «Recibo», nunca
 * «Factura».
 */
function EnlaceRecibo({ href, texto }: { href: string; texto: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center text-sm text-text underline underline-offset-2 hover:text-text-dim lg:min-h-0"
    >
      {texto}
    </a>
  );
}

const cantidad = (delta: number, idioma: Idioma) =>
  `${delta > 0 ? "+" : ""}${formatearNumero(delta, idioma)}`;

/**
 * LOS MOVIMIENTOS DE CRÉDITOS DE PUBLICIDAD QUE VE LA EMPRESA. Cada uno por su CONCEPTO: la nota de un
 * ajuste es del equipo y no viaja aquí (el DTO `MovimientoCreditoEmpresa` no la trae).
 *
 * TABLA EN ESCRITORIO (fecha · concepto · créditos, la cifra alineada a la derecha para que se lean
 * en columna) y FILAS APILADAS EN MÓVIL, donde tres columnas no caben con el concepto entero.
 */
export async function MovimientosCreditos({
  movimientos,
  idioma,
  zona,
}: {
  movimientos: MovimientoCreditoEmpresa[];
  idioma: Idioma;
  zona: ZonaHoraria | null;
}) {
  const t = await textos("creditosEmpresa");
  if (movimientos.length === 0) {
    return <p className="text-sm text-text-dim">{t("vacio")}</p>;
  }
  return (
    <>
      <table className="hidden w-full border-collapse text-left text-sm md:table">
        <thead className="border-b border-line">
          <tr>
            <th className={`py-2 pr-4 ${CABECERA}`}>{t("fecha")}</th>
            <th className={`py-2 pr-4 ${CABECERA}`}>{t("concepto")}</th>
            <th className={`py-2 text-right ${CABECERA}`}>{t("columnaCreditos")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {movimientos.map((m) => (
            <tr key={m.id}>
              <td className="py-2.5 pr-4 whitespace-nowrap text-text-dim tabular-nums">
                {formatearFechaParaQuienMira(m.creadoMs, idioma, zona, "diaMesAno")}
              </td>
              <td className="py-2.5 pr-4 text-text">
                {m.concepto}
                {m.recibo ? (
                  <>
                    {" · "}
                    <EnlaceRecibo href={m.recibo} texto={t("recibo")} />
                  </>
                ) : null}
              </td>
              <td className="py-2.5 text-right font-semibold whitespace-nowrap text-text tabular-nums">
                {cantidad(m.delta, idioma)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-line md:hidden">
        {movimientos.map((m) => (
          <li key={m.id} className="flex items-baseline justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block text-sm text-text">{m.concepto}</span>
              <span className="block text-2xs text-text-dim tabular-nums">
                {formatearFechaParaQuienMira(m.creadoMs, idioma, zona, "diaMesAno")}
              </span>
              {m.recibo ? <EnlaceRecibo href={m.recibo} texto={t("recibo")} /> : null}
            </span>
            <span className="shrink-0 text-sm font-semibold text-text tabular-nums">
              {cantidad(m.delta, idioma)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
