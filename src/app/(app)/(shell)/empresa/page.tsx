import { notFound, redirect } from "next/navigation";

import { Tarjeta } from "@/components/ui/tarjeta";
import {
  ETIQUETA_ESTADO_EMPRESA,
  ETIQUETA_TIPO_CUENTA,
  ETIQUETA_TIPO_NEGOCIO,
  MSG_ESTADO_EMPRESA,
  MSG_MOTIVO_RECHAZO_EMPRESA,
} from "@/config/constants";
import { nombrePais } from "@/lib/paises";

import { AvisoVerificar } from "./aviso-verificar";

export const metadata = { title: "Mi empresa · DareFlash" };
// Lee la sesión y la fila de la empresa: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

const FECHA = { day: "numeric", month: "long", year: "numeric" } as const;

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-2xs font-semibold tracking-widest text-text-dim uppercase">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm break-words text-text">{valor}</dd>
    </div>
  );
}

/**
 * /empresa — EN QUÉ ESTADO ESTÁ MI EMPRESA.
 *
 * El ámbito sale del CHOKEPOINT (`requireEmpresa`), nunca de la URL, y los datos se piden POR ESE
 * ÁMBITO (`miEmpresa(prisma, empresaId)`): esta pantalla no sabe buscar «la empresa de un usuario»,
 * así que no hay forma de pedir la de otro ni por descuido.
 *
 * SIN EMPRESA NO ES UN ERROR: es alguien que acaba de llegar. Va al alta.
 *
 * LO QUE NO SE PINTA AQUÍ: la nota interna del equipo y el handle de quien verificó. No es que no se
 * seleccionen al pintar — es que el DTO del dueño no las trae (ver `MiEmpresa`), y hay un test de
 * igualdad exacta de claves para que un `select` que crezca se ponga rojo.
 */
export default async function PaginaMiEmpresa() {
  const { AuthError } = await import("@/server/auth/rbac");
  const { SinEmpresa, requireEmpresa } = await import("@/server/auth/empresa-actual");

  let ambito;
  try {
    ambito = await requireEmpresa();
  } catch (e) {
    if (e instanceof SinEmpresa) redirect("/empezar/empresa");
    if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") {
      return (
        <div className="df-rise">
          <h1 className="text-2xl text-text">Tu empresa</h1>
          <div className="mt-6">
            <AvisoVerificar />
          </div>
        </div>
      );
    }
    throw e;
  }

  const { prisma } = await import("@/server/db/client");
  const { miEmpresa } = await import("@/server/services/empresas");
  const { misCreditos } = await import("@/server/services/creditos");
  // Los dos por EL MISMO ámbito del chokepoint: esta pantalla no sabe pedir lo de otra empresa.
  const [empresa, creditos] = await Promise.all([
    miEmpresa(prisma, ambito.empresaId),
    misCreditos(prisma, ambito.empresaId),
  ]);
  // Solo si la fila desapareció entre el guard y la lectura. No se inventa una pantalla vacía.
  if (!empresa) notFound();

  const relato = MSG_ESTADO_EMPRESA[empresa.estado];

  return (
    <div className="df-rise">
      <h1 className="text-2xl text-text">{empresa.nombre}</h1>
      <p className="mt-1 text-sm text-text-dim">
        {ETIQUETA_TIPO_CUENTA[empresa.tipoCuenta]} · {ETIQUETA_TIPO_NEGOCIO[empresa.tipoNegocio]}
      </p>

      <Tarjeta className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-text">{relato.titulo}</h2>
          <span className="rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim">
            {ETIQUETA_ESTADO_EMPRESA[empresa.estado]}
          </span>
        </div>
        <p className="mt-2 max-w-prose text-sm text-text-dim">{relato.cuerpo}</p>
        {/* EL MOTIVO SÍ SE LE ENSEÑA. Un rechazo sin motivo genera un correo de soporte por cada
            caso; la nota interna del equipo, en cambio, no sale de la base de datos. */}
        {empresa.motivoRechazo ? (
          <p className="mt-3 max-w-prose text-sm text-text">
            {MSG_MOTIVO_RECHAZO_EMPRESA[empresa.motivoRechazo]}
          </p>
        ) : null}
      </Tarjeta>

      {/* CRÉDITOS DE PUBLICIDAD (Fase 9 · P4). Siempre con ese nombre —nunca «puntos»— y cada
          movimiento por su CONCEPTO: la nota de un ajuste es del equipo y no viaja aquí (el DTO no
          la trae). Sin promesas de fecha: la tarjeta cuenta lo que hay, no lo que vendrá. */}
      <Tarjeta className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-text">Créditos de publicidad</h2>
          <p className="text-sm text-text tabular-nums" data-creditos-saldo={creditos.saldo}>
            <span className="text-lg font-semibold">{creditos.saldo.toLocaleString("es-ES")}</span>{" "}
            {creditos.saldo === 1 ? "crédito" : "créditos"}
          </p>
        </div>
        <p className="mt-1 text-2xs text-text-dim">Cada crédito es un día de anuncio.</p>
        {creditos.movimientos.length > 0 ? (
          <ul className="mt-3 divide-y divide-line text-sm">
            {creditos.movimientos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                <span className="w-14 text-text tabular-nums">
                  {m.delta > 0 ? "+" : ""}
                  {m.delta.toLocaleString("es-ES")}
                </span>
                <span className="min-w-0 flex-1 text-text">{m.concepto}</span>
                <span className="text-2xs text-text-dim">
                  {new Date(m.creadoMs).toLocaleDateString("es-ES", FECHA)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-text-dim">Todavía no tienes movimientos.</p>
        )}
      </Tarjeta>

      <Tarjeta className="mt-4">
        <h2 className="text-sm font-semibold text-text">Los datos que nos diste</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <Dato etiqueta="Nombre" valor={empresa.nombre} />
          <Dato etiqueta="Tipo de cuenta" valor={ETIQUETA_TIPO_CUENTA[empresa.tipoCuenta]} />
          <Dato etiqueta="Tipo de negocio" valor={ETIQUETA_TIPO_NEGOCIO[empresa.tipoNegocio]} />
          <Dato etiqueta="País" valor={nombrePais(empresa.paisIso)} />
          <Dato etiqueta="Contacto" valor={empresa.personaContacto} />
          <Dato
            etiqueta="Alta"
            valor={new Date(empresa.creadaMs).toLocaleDateString("es-ES", FECHA)}
          />
          {empresa.ciudadTexto ? <Dato etiqueta="Ciudad" valor={empresa.ciudadTexto} /> : null}
          {empresa.webUrl ? <Dato etiqueta="Web" valor={empresa.webUrl} /> : null}
          {empresa.redes ? <Dato etiqueta="Redes" valor={empresa.redes} /> : null}
          {empresa.direccion ? <Dato etiqueta="Dirección" valor={empresa.direccion} /> : null}
          {empresa.verificadaMs !== null ? (
            <Dato
              etiqueta="Verificada"
              valor={new Date(empresa.verificadaMs).toLocaleDateString("es-ES", FECHA)}
            />
          ) : null}
        </dl>
        <p className="mt-4 text-2xs text-text-dim">
          Para cambiar cualquiera de estos datos, escríbenos: los revisamos a mano.
        </p>
      </Tarjeta>
    </div>
  );
}
