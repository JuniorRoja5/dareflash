import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { POINTS } from "@/config/constants";
import { nombreMostrado } from "@/lib/identidad";
import {
  anterior,
  escribirPila,
  leerPila,
  siguiente,
  type Paginacion,
} from "@/lib/paginacion-pila";

import { EnlaceInvitacion } from "./enlace-invitacion";
import { TablaPuntos } from "./tabla-puntos";

export const metadata = { title: "Mis referidos · DareFlash" };
// Lee la sesión y consulta por cursor: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

const PASO =
  "inline-block min-h-[38px] rounded-sm border border-line px-4 py-2 text-sm font-medium text-text transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised";

/**
 * MIS REFERIDOS — tu enlace de invitación y a quién has traído.
 *
 * POR QUÉ UNA PÁGINA PROPIA Y NO UN HUECO EN "EDITAR PERFIL": el enlace vivía ahí y no tenía sentido
 * —nadie entra a "editar su perfil" para copiar un enlace—. Invitar no es un ajuste de la cuenta, es
 * algo que se hace; y algo que se hace necesita su sitio, su entrada en la navegación y su historial.
 *
 * SOLO SE PROMETE LO QUE SE PAGA. Aquí se explica una cosa y una sola: los puntos por invitar, que
 * existen de verdad (`premiarReferido`). Nada de una tabla de "gana puntos por compartir, por likes,
 * por rachas": hoy no otorgan nada, y anunciarlas sería prometer lo que no se cumple.
 *
 * EXIGE SESIÓN, y se resuelve en el SERVIDOR: "mis referidos" no significa nada sin un "mí". Al
 * invitado se le manda a entrar con `?siguiente=`, para que vuelva aquí al terminar.
 */
export default async function ReferidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  if (!sesion) redirect("/entrar?siguiente=%2Freferidos");

  const sp = await searchParams;
  // MISMO patrón que /panel/usuarios: el cursor de la página que se ve, y la PILA de los que se han
  // ido dejando atrás. Volver cuesta lo mismo que ir (ver `lib/paginacion-pila`).
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 80) : null,
    pila: leerPila(sp["pila"]),
  };
  const cursor = aqui.cursor;

  const { prisma } = await import("@/server/db/client");
  const { env } = await import("@/config/env");
  const { enlaceReferido, misReferidos } = await import("@/server/services/referidos");

  const [yo, pagina] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sesion.userId },
      select: { referralCode: true },
    }),
    misReferidos(prisma, { userId: sesion.userId, cursor }),
  ]);

  const enlace = yo ? enlaceReferido(env.APP_URL, yo.referralCode) : null;
  const primeraPagina = cursor === null;
  // Los dos controles se derivan de lo que hay: "Anterior" si queda de dónde desapilar, "Siguiente"
  // solo si el servicio dijo que queda algo. Ninguno lleva a una página vacía.
  const atras = anterior(aqui);
  const adelante = pagina.proximoCursor ? siguiente(aqui, pagina.proximoCursor) : null;
  const enlaceA = (p: Paginacion): string => {
    const q = new URLSearchParams();
    if (p.cursor) q.set("cursor", p.cursor);
    const pila = escribirPila(p.pila);
    if (pila) q.set("pila", pila);
    const s = q.toString();
    return s ? `/referidos?${s}` : "/referidos";
  };

  return (
    <div className="df-rise mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
      <h1 className="text-2xl font-semibold text-text">Invita y gana puntos</h1>
      <p className="mt-2 max-w-prose text-sm text-text-dim">
        Comparte tu enlace. Cuando alguien se registre con él y verifique su correo, ganáis{" "}
        <strong className="font-semibold text-text">{POINTS.INVITE_FRIEND} puntos cada uno</strong>.
        Los puntos suben tu nivel; no son dinero ni se canjean por dinero.
      </p>

      <div className="mt-6 rounded-sm border border-line bg-surface/60 p-5">
        {enlace ? (
          <EnlaceInvitacion enlace={enlace} />
        ) : (
          <p className="text-sm text-text-dim">
            No hemos podido cargar tu enlace. Recarga la página.
          </p>
        )}
      </div>

      <div className="mt-10">
        <TablaPuntos />
      </div>

      <section aria-labelledby="historial" className="mt-10">
        <h2
          id="historial"
          className="text-sm font-semibold tracking-widest text-text-dim uppercase"
        >
          A quién has invitado
        </h2>

        {pagina.items.length === 0 ? (
          <p className="mt-4 text-sm text-text-dim">
            {primeraPagina
              ? "Todavía no se ha registrado nadie con tu enlace. Compártelo y aparecerán aquí."
              : "No queda nadie más por aquí."}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-sm border border-line bg-surface">
            {pagina.items.map((r) => (
              <li key={r.id} data-referido={r.id} className="flex flex-wrap items-center gap-3 p-4">
                {/* Mismo avatar y mismo anillo de nivel que en el resto del producto. */}
                <Avatar
                  nombre={r.username}
                  imagen={r.imagen}
                  tamano="sm"
                  perezosa
                  puntos={r.puntos}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">
                    {nombreMostrado(r.displayName, r.username)}
                  </span>
                  <span className="block truncate text-2xs text-text-dim">
                    Se unió el {new Date(r.altaMs).toLocaleDateString("es-ES", { timeZone: "UTC" })}
                  </span>
                </span>
                {/* EL ESTADO SALE DEL LEDGER, no de si verificó: lo que se pinta al lado de una cifra
                    tiene que ser lo que de verdad se cobró. */}
                {r.cobrado ? (
                  <span className="shrink-0 text-sm font-medium text-text tabular-nums">
                    +{POINTS.INVITE_FRIEND} ganados
                  </span>
                ) : (
                  <span className="shrink-0 text-2xs text-text-dim">Pendiente de verificar</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* PASAR DE PÁGINA, no acumular: la lista se REEMPLAZA. Keyset, nunca OFFSET ni scroll
            infinito. Los controles van FUERA del `if` de la lista: si una página posterior se queda
            vacía, "Anterior" tiene que seguir ahí o el usuario se queda encerrado. */}
        {atras || adelante ? (
          <nav aria-label="Paginación" className="mt-6 flex items-center justify-between gap-3">
            {atras ? (
              <Link href={enlaceA(atras)} rel="prev" className={PASO}>
                <span aria-hidden="true">←</span> Anterior
              </Link>
            ) : (
              <span />
            )}
            {adelante ? (
              <Link href={enlaceA(adelante)} rel="next" className={PASO}>
                Siguiente <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
