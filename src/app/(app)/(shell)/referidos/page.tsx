import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { TarjetaMetrica } from "@/components/ui/tarjeta-metrica";
import { POINTS } from "@/config/constants";
import { nombreMostrado } from "@/lib/identidad";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { HeroInvitacion } from "./hero-invitacion";

export const metadata = { title: "Mis referidos · DareFlash" };
// Lee la sesión y consulta por cursor: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/**
 * REFERIDOS — cómo invito y qué me llevo. Dos preguntas, y ninguna más.
 *
 * LA TABLA DE PUNTOS SE FUE A /puntos. Vivía aquí y no era su sitio: invitar es una de las nueve
 * formas de ganar puntos, así que colgar el sistema entero del enlace de invitación hacía parecer
 * que lo demás era un añadido. Aquí queda LA recompensa de esta sección, en una línea.
 *
 * EL CÓDIGO Y EL ENLACE, POR SEPARADO. El enlace es lo que se comparte —se pega y ya está—, pero el
 * código hace falta suelto cuando lo que se comparte no admite un enlace (se dicta en un vídeo, se
 * escribe en una bio). Dos campos, dos botones de copiar, ningún "extrae tú el código de la URL".
 *
 * EXIGE SESIÓN, resuelta en el SERVIDOR: "mis referidos" no significa nada sin un "mí".
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
  // MISMO patrón que el resto de listados: el cursor de la página que se ve, y la PILA de los que se
  // han ido dejando atrás. Volver cuesta lo mismo que ir (ver `lib/paginacion-pila`).
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 80) : null,
    pila: leerPila(sp["pila"]),
  };

  const { prisma } = await import("@/server/db/client");
  const { env } = await import("@/config/env");
  const { enlaceReferido, misReferidos, resumenReferidos } =
    await import("@/server/services/referidos");

  const [yo, pagina, resumen] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sesion.userId },
      select: { referralCode: true },
    }),
    misReferidos(prisma, { userId: sesion.userId, cursor: aqui.cursor }),
    resumenReferidos(prisma, sesion.userId),
  ]);

  const enlace = yo ? enlaceReferido(env.APP_URL, yo.referralCode) : null;
  const primeraPagina = aqui.cursor === null;

  return (
    <div className="df-rise mx-auto w-full max-w-5xl px-4 py-8 lg:px-8 lg:py-12">
      <HeroInvitacion enlace={enlace} codigo={yo?.referralCode ?? null} />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <TarjetaMetrica etiqueta="Invitados" valor={resumen.invitados.toLocaleString("es-ES")} />
        <TarjetaMetrica
          etiqueta="Puntos ganados"
          valor={resumen.puntosGanados.toLocaleString("es-ES")}
          pie="Por invitaciones que ya verificaron"
        />
        <TarjetaMetrica
          etiqueta="Pendientes de verificar"
          valor={resumen.pendientes.toLocaleString("es-ES")}
          pie={resumen.pendientes > 0 ? "Todavía no te han dado puntos" : undefined}
        />
      </div>

      {/* EL HISTORIAL, A TODO EL ANCHO. Antes compartía fila con el bloque de compartir, que ahora
          vive en el hero: una lista de personas con su avatar respira mejor ancha que en una
          columna de 360 px, y ya no hay nada al lado con lo que compararla. */}
      <div className="mt-10">
        <section aria-labelledby="historial">
          <h2
            id="historial"
            className="text-sm font-semibold tracking-widest text-text-dim uppercase"
          >
            A quién has invitado
          </h2>

          {pagina.items.length === 0 ? (
            <p className="mt-4 rounded-sm border border-line bg-surface/40 p-6 text-sm text-text-dim">
              {primeraPagina
                ? "Todavía no se ha registrado nadie con tu enlace. Compártelo y aparecerán aquí."
                : "No queda nadie más por aquí."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-sm)] backdrop-blur-md">
              {pagina.items.map((r) => (
                <li
                  key={r.id}
                  data-referido={r.id}
                  className="flex flex-wrap items-center gap-3 p-4 transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised/60"
                >
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
                      Se unió el{" "}
                      {new Date(r.altaMs).toLocaleDateString("es-ES", { timeZone: "UTC" })}
                    </span>
                  </span>
                  {/* EL ESTADO SALE DEL LEDGER, no de si verificó: lo que se pinta al lado de una
                      cifra tiene que ser lo que de verdad se cobró. */}
                  {r.cobrado ? (
                    <span className="shrink-0 rounded-xs bg-raised px-2 py-1 text-sm font-medium tabular-nums text-text">
                      +{POINTS.INVITE_FRIEND} ganados
                    </span>
                  ) : (
                    <span className="shrink-0 text-2xs text-text-dim">Pendiente de verificar</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* FUERA del `if` de la lista: si una página posterior se queda vacía, "Anterior" tiene que
              seguir ahí o el usuario se queda encerrado. */}
          <PasosKeyset base="/referidos" aqui={aqui} proximoCursor={pagina.proximoCursor} />

          <p className="mt-6 text-2xs text-text-dim">
            Invitar es una de las formas de ganar puntos.{" "}
            <Link href="/puntos" className="underline underline-offset-2 hover:text-text">
              Ver todas y tu nivel
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
