import {
  ETIQUETA_ESTADO_EMPRESA,
  ETIQUETA_TIPO_CUENTA,
  ETIQUETA_TIPO_NEGOCIO,
  MSG_MOTIVO_RECHAZO_EMPRESA,
} from "@/config/constants";
import { alcancesPermitidos } from "@/lib/empresa";
import { nombrePais } from "@/lib/paises";
import type { MovimientoCreditoPanel } from "@/server/services/creditos";
import type { FichaEmpresa as DatosFicha } from "@/server/services/empresas";

import { AccionesEmpresa } from "./acciones-empresa";
import { CreditosEmpresa } from "./creditos-empresa";
import { VerFiscal } from "./ver-fiscal";

const DATO = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const PILDORA = "rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
const FECHA = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" } as const;

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={DATO}>{etiqueta}</dt>
      <dd className="mt-1 text-sm break-words text-text">{children}</dd>
    </div>
  );
}

/**
 * LA FICHA DE VERIFICACIÓN DE UNA EMPRESA — con la MISMA estructura que la ficha de una cuenta en
 * `/panel/usuarios`, y a propósito: identidad y pastillas arriba, los datos en una rejilla de
 * etiquetas, y las acciones en un pie con su filete. Un admin que sabe leer una ficha del panel tiene
 * que saber leer todas; dos maquetas para la misma idea obligan a reaprender cada pantalla.
 *
 * DOS COLUMNAS EN ESCRITORIO (fase9-diseno): a la izquierda, quién es (los datos con los que se
 * verifica); a la derecha, lo que se HACE con ella —decidir, y sus créditos de publicidad con su
 * historial—. En móvil, una debajo de otra, en ese orden.
 *
 * LA DECISIÓN SE TOMA AQUÍ, no en la lista: es donde están todos los datos con los que se verifica.
 * La identificación fiscal no se pinta —se pide con su botón, y pedirla deja rastro—; aquí solo se
 * dice si la hay.
 */
export function FichaEmpresa({
  ficha,
  creditos,
}: {
  ficha: DatosFicha;
  /** Saldo y últimos movimientos de créditos de publicidad (`creditosDeFicha`). */
  creditos?: { saldo: number; movimientos: MovimientoCreditoPanel[] };
}) {
  return (
    <section
      aria-label={`Ficha de ${ficha.nombre}`}
      data-ficha={ficha.id}
      className="grid gap-6 rounded-sm border border-line bg-surface/60 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:p-6"
    >
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-text">{ficha.nombre}</p>
            <p className="text-sm text-text-dim">
              {ficha.dueno ? `@${ficha.dueno}` : "—"} · {ficha.personaContacto}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className={PILDORA}>{ETIQUETA_TIPO_CUENTA[ficha.tipoCuenta]}</span>
            <span className={PILDORA}>{ETIQUETA_TIPO_NEGOCIO[ficha.tipoNegocio]}</span>
            <span className={PILDORA}>{ETIQUETA_ESTADO_EMPRESA[ficha.estado]}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dato etiqueta="País">{nombrePais(ficha.paisIso)}</Dato>
          <Dato etiqueta="Ciudad">{ficha.ciudadTexto ?? "—"}</Dato>
          <Dato etiqueta="Alta">
            <span className="tabular-nums">
              {new Date(ficha.creadaMs).toLocaleDateString("es-ES", FECHA)}
            </span>
          </Dato>
          <Dato etiqueta="Puede comprar">
            {alcancesPermitidos(ficha.tipoNegocio)
              .map((a) => a.toLowerCase())
              .join(", ")}
          </Dato>
          <Dato etiqueta="Web">{ficha.webUrl ?? "—"}</Dato>
          <Dato etiqueta="Redes">{ficha.redes ?? "—"}</Dato>
          <Dato etiqueta="Dirección">{ficha.direccion ?? "—"}</Dato>
          {/* LA IDENTIFICACIÓN FISCAL NO SE PINTA: se pide, y pedirla deja rastro (`fiscalDeEmpresa`).
            Si no la dio, se dice; no se ofrece un botón que va a devolver nada. */}
          <Dato etiqueta="Id. fiscal">
            {ficha.tieneFiscal ? (
              <VerFiscal empresaId={ficha.id} />
            ) : (
              <span className="text-text-dim">No la ha dado</span>
            )}
          </Dato>
          {ficha.verificadaMs !== null ? (
            <Dato etiqueta="Verificada">
              <span className="tabular-nums">
                {new Date(ficha.verificadaMs).toLocaleDateString("es-ES", FECHA)}
              </span>
              {ficha.verificadaPor ? ` · @${ficha.verificadaPor}` : ""}
            </Dato>
          ) : null}
        </dl>

        {ficha.motivoRechazo || ficha.notaInterna ? (
          <div className="space-y-1">
            {ficha.motivoRechazo ? (
              <p className="text-sm text-text">
                <span className="text-text-dim">Motivo (lo ve la empresa): </span>
                {MSG_MOTIVO_RECHAZO_EMPRESA[ficha.motivoRechazo]}
              </p>
            ) : null}
            {ficha.notaInterna ? (
              <p className="text-sm text-text-dim">
                <span className={DATO}>Nota interna</span> {ficha.notaInterna}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 space-y-4 border-t border-line pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <div>
          <p className={DATO}>Decisión</p>
          <div className="mt-2">
            <AccionesEmpresa id={ficha.id} nombre={ficha.nombre} estado={ficha.estado} />
          </div>
        </div>

        {/* LOS CRÉDITOS DE PUBLICIDAD (Fase 9 · P4): saldo, historial con nota y ajuste manual. */}
        {creditos ? (
          <CreditosEmpresa
            empresaId={ficha.id}
            nombre={ficha.nombre}
            saldo={creditos.saldo}
            movimientos={creditos.movimientos}
          />
        ) : null}
      </div>
    </section>
  );
}
