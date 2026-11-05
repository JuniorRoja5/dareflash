import Link from "next/link";

import { DEFAULT_CURRENCY, MSG_MOTIVO_RECHAZO_RETO } from "@/config/constants";
import { nombreCategoria } from "@/lib/categorias";
import { importeConMoneda } from "@/lib/dinero";
import type { SolicitudPanel } from "@/server/services/retos-empresa";

import { AccionesPropuesta } from "./acciones-propuesta";
import { ETIQUETA_SOLICITUD_PANEL } from "./etiquetas";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";
const PILDORA =
  "inline-block whitespace-nowrap rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim";
/** Las fechas en UTC y diciéndolo: la propuesta se escribió en la hora local de la empresa. */
const FECHA_HORA = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
} as const;

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className={CABECERA}>{etiqueta}</dt>
      <dd className="mt-1 text-sm break-words text-text">{valor}</dd>
    </div>
  );
}

/**
 * LA FICHA DE UNA PROPUESTA (fase9-diseno), con la estructura de la ficha de una empresa: DOS
 * COLUMNAS en escritorio —la propuesta entera a la izquierda (lo que hay que leer para decidir), y a
 * la derecha su estado y lo que se puede hacer con ella—; en móvil, una debajo de otra.
 *
 * Una pendiente lleva sus botones; una aprobada, el enlace a su BORRADOR (donde se pone lo de
 * DareFlash y se publica); una rechazada, el motivo que leyó la empresa y la nota del equipo.
 */
export function FichaPropuesta({ s }: { s: SolicitudPanel }) {
  return (
    <section
      aria-label={`Propuesta «${s.titulo}»`}
      className="grid gap-6 rounded-sm border border-line bg-surface/60 p-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:p-6"
    >
      <div className="min-w-0 space-y-5">
        <div className="flex items-start gap-3">
          {s.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- fichero del volumen de portadas, ya saneado a WebP
            <img
              src={s.logo}
              alt={`Logo de ${s.empresa}`}
              className="h-12 w-12 shrink-0 rounded-xs border border-line bg-raised object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-lg font-semibold break-words text-text">{s.titulo}</p>
            <p className="text-sm text-text-dim">
              Propuesto por{" "}
              <Link
                href={`/panel/empresas?e=${s.empresaId}`}
                className="text-text underline underline-offset-2"
              >
                {s.empresa}
              </Link>{" "}
              · {new Date(s.creadaMs).toLocaleString("es-ES", FECHA_HORA)} UTC
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dato etiqueta="Premio" valor={importeConMoneda(s.premioCents, DEFAULT_CURRENCY)} />
          <Dato
            etiqueta="Ganadores"
            valor={s.ganadores === 1 ? "1 ganador" : `${s.ganadores} ganadores`}
          />
          <Dato etiqueta="Categoría" valor={nombreCategoria(s.categoria) ?? s.categoria} />
          <Dato
            etiqueta="Abre"
            valor={`${new Date(s.aperturaMs).toLocaleString("es-ES", FECHA_HORA)} UTC`}
          />
          <Dato
            etiqueta="Cierra"
            valor={`${new Date(s.cierreMs).toLocaleString("es-ES", FECHA_HORA)} UTC`}
          />
        </dl>

        {s.descripcion ? (
          <div>
            <p className={CABECERA}>Descripción</p>
            <p className="mt-1 text-sm whitespace-pre-line text-text-dim">{s.descripcion}</p>
          </div>
        ) : null}
        {s.reglas ? (
          <div>
            <p className={CABECERA}>Reglas</p>
            <p className="mt-1 text-sm whitespace-pre-line text-text-dim">{s.reglas}</p>
          </div>
        ) : null}
      </div>

      <aside className="space-y-4 border-t border-line pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <div>
          <p className={CABECERA}>Estado</p>
          <span className={`mt-2 ${PILDORA}`}>{ETIQUETA_SOLICITUD_PANEL[s.estado]}</span>
        </div>
        {s.estado === "PENDIENTE" ? (
          <>
            <p className="text-2xs text-text-dim">
              Aprobarla crea el reto en BORRADOR, patrocinado por {s.empresa}. Ahí pones la
              comisión, el nivel y la portada, y lo publicas.
            </p>
            <AccionesPropuesta id={s.id} titulo={s.titulo} />
          </>
        ) : s.estado === "APROBADA" && s.challengeId ? (
          <Link
            href={`/panel/retos/${s.challengeId}`}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-text underline underline-offset-2"
          >
            Ver el reto que salió de ella
          </Link>
        ) : s.estado === "CADUCADA" ? (
          <p className="text-sm text-text-dim">
            Caducó sin decidirse: el cierre que propuso ya pasó. La empresa recibe un correo y puede
            proponerla de nuevo con otras fechas.
          </p>
        ) : s.estado === "RECHAZADA" ? (
          <div className="space-y-1 text-sm">
            <p className="text-text">
              Motivo (lo leyó la empresa):{" "}
              {s.motivoRechazo ? MSG_MOTIVO_RECHAZO_RETO[s.motivoRechazo] : "—"}
            </p>
            {s.notaInterna ? <p className="text-text-dim">Nota interna: {s.notaInterna}</p> : null}
          </div>
        ) : null}
      </aside>
    </section>
  );
}
