import { Enlace } from "@/components/enlace";
import { notFound } from "next/navigation";
import { redirigir } from "@/server/redirigir";

import { Tarjeta } from "@/components/ui/tarjeta";
import { TarjetaMetrica } from "@/components/ui/tarjeta-metrica";
import { nombrePais } from "@/lib/paises";
import {
  creditoDia,
  estadoEmpresa,
  motivoRechazo,
  queEsUnCredito,
  tipoCuenta,
  tipoNegocio,
} from "@/textos/empresa";
import { textos } from "@/textos/servidor";

import { AvisoVerificar } from "./aviso-verificar";
import { formatearNumero, formatearFechaParaQuienMira } from "@/lib/formato";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("miEmpresa") };
}
// Lee la sesión y la fila de la empresa: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

const ENLACE = "font-medium text-text underline underline-offset-2 hover:no-underline";

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

  const [t, tn] = await Promise.all([textos("empresaResumen"), textos("negocio")]);
  let ambito;
  try {
    ambito = await requireEmpresa();
  } catch (e) {
    if (e instanceof SinEmpresa) return redirigir("/empezar/empresa");
    if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") {
      return (
        <div className="df-rise">
          <h1 className="text-2xl text-text">{t("tituloSinVerificar")}</h1>
          <div className="mt-6">
            <AvisoVerificar />
          </div>
        </div>
      );
    }
    throw e;
  }

  const { prisma } = await import("@/server/db/client");
  // El idioma y la zona de la empresa que mira (Fase 11): cifras y fechas salen de `lib/formato`.
  const { idiomaDeLaPeticion, zonaDeLaPeticion } = await import("@/server/formato-peticion");
  const [idioma, zona] = await Promise.all([idiomaDeLaPeticion(), zonaDeLaPeticion()]);
  const { miEmpresa } = await import("@/server/services/empresas");
  const { misCreditos } = await import("@/server/services/creditos");
  const { misPropuestasEnRevision } = await import("@/server/services/retos-empresa");
  // Los tres por EL MISMO ámbito del chokepoint: esta pantalla no sabe pedir lo de otra empresa.
  const [empresa, creditos, enRevision] = await Promise.all([
    miEmpresa(prisma, ambito.empresaId),
    misCreditos(prisma, ambito.empresaId),
    misPropuestasEnRevision(prisma, ambito.empresaId),
  ]);
  // Solo si la fila desapareció entre el guard y la lectura. No se inventa una pantalla vacía.
  if (!empresa) notFound();

  const estado = estadoEmpresa(tn, empresa.estado);
  const cuenta = tipoCuenta(tn, empresa.tipoCuenta);
  const negocio = tipoNegocio(tn, empresa.tipoNegocio);

  return (
    <div className="df-rise">
      <h1 className="text-2xl text-text">{empresa.nombre}</h1>
      <p className="mt-1 text-sm text-text-dim">
        {cuenta} · {negocio}
      </p>

      {/* ┌─ TRES CIFRAS ARRIBA, EN REJILLA ─────────────────────────────────────────────────────┐
          │ Estado, créditos de publicidad y propuestas: lo que una empresa viene a mirar. En   │
          │ escritorio, las tres en fila; en móvil, apiladas. Cada una lleva a su sección. Los  │
          │ créditos, siempre con ese nombre —nunca «puntos»—; sus movimientos, en «Créditos».  │
          └─────────────────────────────────────────────────────────────────────────────────────┘ */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <TarjetaMetrica etiqueta={t("estado")} valor={estado} />
        <TarjetaMetrica
          etiqueta={t("creditos")}
          valor={
            <span data-creditos-saldo={creditos.saldo}>
              {formatearNumero(creditos.saldo, idioma)}
            </span>
          }
          pie={
            <>
              {/* Con un tipo fuera del catálogo, la horquilla pública: decidido, no por defecto. */}
              {empresa.tipoNegocio
                ? queEsUnCredito(tn, empresa.tipoNegocio, idioma)
                : creditoDia(tn, idioma)}
              <Enlace href="/empresa/creditos" className={`mt-1 block ${ENLACE}`}>
                {t("verMovimientos")}
              </Enlace>
            </>
          }
        />
        <TarjetaMetrica
          etiqueta={t("enRevision")}
          valor={formatearNumero(enRevision, idioma)}
          pie={
            <Enlace href="/empresa/retos" className={ENLACE}>
              {t("verRetos")}
            </Enlace>
          }
        />
      </div>

      {/* DOS COLUMNAS EN ESCRITORIO: qué significa el estado (y el motivo, si lo hay) a la izquierda;
          los datos que nos dio, a la derecha. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:items-start">
        <Tarjeta className="p-5 lg:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-text">
              {t(`relato_${empresa.estado}_titulo`)}
            </h2>
            <span className="rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim">
              {estado}
            </span>
          </div>
          <p className="mt-2 max-w-prose text-sm text-text-dim">
            {t(`relato_${empresa.estado}_cuerpo`)}
          </p>
          {/* EL MOTIVO SÍ SE LE ENSEÑA. Un rechazo sin motivo genera un correo de soporte por cada
              caso; la nota interna del equipo, en cambio, no sale de la base de datos. */}
          {empresa.motivoRechazo ? (
            <p className="mt-3 max-w-prose text-sm text-text">
              {motivoRechazo(tn, empresa.motivoRechazo)}
            </p>
          ) : null}
        </Tarjeta>

        <Tarjeta className="p-5 lg:p-6">
          <h2 className="text-base font-semibold text-text">{t("datosTitulo")}</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <Dato etiqueta={t("dato_nombre")} valor={empresa.nombre} />
            <Dato etiqueta={t("dato_tipoCuenta")} valor={cuenta} />
            <Dato etiqueta={t("dato_tipoNegocio")} valor={negocio} />
            <Dato etiqueta={t("dato_pais")} valor={nombrePais(empresa.paisIso)} />
            <Dato etiqueta={t("dato_contacto")} valor={empresa.personaContacto} />
            <Dato
              etiqueta={t("dato_alta")}
              valor={formatearFechaParaQuienMira(empresa.creadaMs, idioma, zona, "diaMesLargoAno")}
            />
            {empresa.ciudadTexto ? (
              <Dato etiqueta={t("dato_ciudad")} valor={empresa.ciudadTexto} />
            ) : null}
            {empresa.webUrl ? <Dato etiqueta={t("dato_web")} valor={empresa.webUrl} /> : null}
            {empresa.redes ? <Dato etiqueta={t("dato_redes")} valor={empresa.redes} /> : null}
            {empresa.direccion ? (
              <Dato etiqueta={t("dato_direccion")} valor={empresa.direccion} />
            ) : null}
            {empresa.verificadaMs !== null ? (
              <Dato
                etiqueta={t("dato_verificada")}
                valor={formatearFechaParaQuienMira(
                  empresa.verificadaMs,
                  idioma,
                  zona,
                  "diaMesLargoAno",
                )}
              />
            ) : null}
          </dl>
          <p className="mt-4 text-2xs text-text-dim">{t("cambiarDatos")}</p>
        </Tarjeta>
      </div>
    </div>
  );
}
