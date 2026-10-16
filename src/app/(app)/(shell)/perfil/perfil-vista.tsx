import type { ReactNode } from "react";

import { BadgeAvisos } from "@/app/(app)/avisos-contexto";
import { ConmutadorTemaServidor } from "@/components/ui/conmutador-tema-servidor";
import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";
import {
  conHandleSecundario,
  EmblemaVipGrande,
  HandleUsuario,
  NombreUsuario,
  textoNombre,
} from "@/components/ui/identidad-usuario";

import { CeldaVideo } from "./celda-video";
import type { EstadoVideo } from "./perfil-logic";

import { CerrarSesion } from "../cerrar-sesion";

/**
 * Celda de la rejilla. `poster` firmado cuando el vídeo está PUBLICADO; "" cuando no (aún no se
 * reproduce). `estado` SOLO viaja en el perfil PROPIO: el perfil público de otro NUNCA lo incluye,
 * así que la etiqueta de estado no puede aparecer —ni filtrarse— fuera del dueño. El render de la
 * celda (póster + play + modal para publicados, icono + estado para el resto) vive en `celda-video`.
 */
export type VideoCelda = {
  id: string;
  title: string | null;
  poster: string;
  estado?: EstadoVideo;
  /** Categoria (KEY de CATEGORIES) o null; se pinta como chip en la celda publicada. */
  categoria?: string | null;
};

/** Enlace externo del perfil: SIEMPRE rel="nofollow noopener" + target _blank (no confiamos la URL). */
function EnlaceExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener"
      className="rounded-xs font-medium text-text underline underline-offset-2 transition-colors duration-150 ease-mechanical hover:text-text-dim"
    >
      {children}
    </a>
  );
}

/** Hostname legible de una URL ya validada (http/https), sin "www.". Si fallara, muestra la URL. */
function hostnameDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Estadistica({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="flex-1 px-2 py-3 text-center">
      {/* cifras tabulares y NEUTRAS: los puntos NO llevan el color del dinero */}
      <p className="text-xl font-semibold tabular-nums text-text">
        {valor.toLocaleString("en-US")}
      </p>
      <p className="mt-0.5 text-2xs tracking-widest text-text-dim uppercase">{etiqueta}</p>
    </div>
  );
}

/**
 * LA TARJETA DE IDENTIDAD, con o sin el tratamiento VIP.
 *
 * ┌─ UN NO-VIP RECIBE EXACTAMENTE EL MISMO NODO DE SIEMPRE ─────────────────────────────────────┐
 * │ No un envoltorio transparente, no un `div` de más con las clases vacías: el MISMO `div` con │
 * │ las MISMAS clases que antes de la Fase 8. Esa es la disciplina que ya se siguió con el      │
 * │ nombre y con el avatar en P2, y vale por lo mismo: la inmensa mayoría de la gente no es     │
 * │ VIP, y un nodo de más en su tarjeta es una maqueta que se mueve para todos ellos a cambio   │
 * │ de nada.                                                                                     │
 * │                                                                                              │
 * │ Y es lo que hace comprobable el candado: el guard compara el render de un no-VIP contra la  │
 * │ forma de siempre, y cualquier filtración del tratamiento sale en rojo.                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TRES CAPAS, y cada una hace una cosa que las otras no pueden:
 *   - `df-vip-marco` NO recorta, y por eso es quien puede llevar el bloom que desborda;
 *   - `df-vip-borde` SÍ recorta, y por eso es quien puede llevar el cuadrado de luz que gira —al
 *     recortarlo, lo único que queda a la vista son sus 2 px de canto;
 *   - `df-vip-tarjeta` pone el fondo opaco (que tapa el centro del cuadrado) y recorta el barrido.
 * Son tres porque recortar y desbordar son incompatibles en la misma caja.
 */
function TarjetaIdentidad({ esVip, children }: { esVip: boolean; children: ReactNode }) {
  if (!esVip) {
    return (
      <div className="df-rise rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md">
        {children}
      </div>
    );
  }
  return (
    <div className="df-vip-marco df-rise shadow-[var(--df-shadow-md)]">
      <div className="df-vip-borde">
        <div className="df-vip-tarjeta p-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * LO QUE TRAE EL PLAN, como etiquetas. No son controles y no pretenden serlo: describen qué
 * incluye Mythic, igual que la letra pequeña de un plan.
 *
 * ESTÁN ESCRITAS AQUÍ Y NO EN `constants` a propósito: no son una configuración del producto —no
 * hay nada que leer ni comparar contra ellas—, son el copy de esta tarjeta. El día que un perk
 * tenga una CIFRA que dependa de verdad del plan (cuántos Boosts, por ejemplo), esa cifra sí sale
 * de la constante y entra aquí por parámetro; hoy el "×1" es copy, no un dato.
 */
function PerksVip() {
  return (
    <ul data-vip-perks className="mt-4 flex flex-wrap justify-center gap-2">
      {[
        { texto: "Boost semanal", cifra: "×1" },
        { texto: "Acceso anticipado", cifra: null },
        { texto: "Perfil animado", cifra: null },
      ].map((p) => (
        <li
          key={p.texto}
          className="inline-flex items-center gap-1.5 rounded-full border border-action/40 bg-action/8 px-2.5 py-1 text-2xs font-semibold text-text"
        >
          {p.texto}
          {p.cifra ? <b className="font-bold tabular-nums text-money">{p.cifra}</b> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * PERFIL — vista presentacional COMPARTIDA por `/perfil` (mi perfil, con Boost) y `/u/[username]`
 * (perfil público de otro, sin Boost). Recibe SOLO datos ya resueltos (nada de `env`, nada de Bunny):
 * identidad, stats, videos con póster firmado y `esPropio`. El NIVEL se deriva de `puntos` con la misma
 * `InsigniaNivel` (medidor + nombre), coherente con el ranking. Boost = ÚNICO acento de la pantalla y
 * solo en el perfil propio (es una acción sobre uno mismo).
 */
export function PerfilVista({
  displayName,
  handle,
  imagen,
  bio,
  website,
  instagram,
  youtube,
  puntos,
  retosGanados,
  totalVideos,
  videos,
  racha,
  esPropio,
  esVip = false,
  colorNombre,
}: {
  /** Nombre visible (opcional). Si falta, el `handle` hace de nombre. */
  displayName: string | null;
  handle: string;
  imagen: string | null;
  bio: string | null;
  website: string | null;
  instagram: string | null;
  youtube: string | null;
  puntos: number;
  retosGanados: number;
  totalVideos: number;
  videos: VideoCelda[];
  /**
   * Días activos seguidos. SOLO llega en el perfil PROPIO: no está en el DTO público, así que
   * mirar el perfil de otro no dice cuántos días seguidos lleva. Es su actividad, no su escaparate.
   */
  racha?: number;
  esPropio: boolean;
  /**
   * ¿VIP ahora mismo? Aquí SÍ se resuelve de uno en uno, y es correcto: un perfil es UNA persona,
   * no una lista. La regla de "en lote" existe para las listas, donde preguntar por fila son veinte
   * consultas; aquí la consulta es una y no hay lote que hacer.
   */
  esVip?: boolean;
  /** CLAVE del color de nombre (nunca un hex). Solo pinta si `esVip`. */
  colorNombre?: string | null;
}) {
  // Identidad (modelo TikTok/YouTube): el displayName manda; el @handle va debajo y solo si hay
  // displayName (si no, el @handle ES el nombre prominente). Fuente única: `NombreUsuario`.
  const nombre = textoNombre(displayName, handle);
  const conHandle = conHandleSecundario(displayName);
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8">
        {/* IDENTIDAD (aside) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TarjetaIdentidad esVip={esVip}>
            <div className="flex flex-col items-center text-center">
              {/* EL EMBLEMA Y LA PALABRA, solo para un VIP: es la cabecera de la tarjeta completa.
                  Van DENTRO del bloque centrado para que caigan en el mismo eje que la cara y el
                  nombre; separarlos los descuadraba medio pixel en escritorio. */}
              {esVip ? (
                <>
                  <EmblemaVipGrande clase="df-vip-emblema h-[76px] w-[76px]" />
                  <p
                    data-vip-palabra
                    className="mt-1 text-2xs font-black tracking-[0.22em] text-[var(--vip-gold)] uppercase"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Mythic
                  </p>
                </>
              ) : null}
              {/* El AVATAR del VIP lleva además el aro de luz. El envoltorio solo existe para un
                  VIP: sin él, el avatar de todos los demás se pinta exactamente como siempre. */}
              {esVip ? (
                <span className="df-vip-aro mt-3.5">
                  <Avatar nombre={nombre} tamano="xl" imagen={imagen} puntos={puntos} esVip />
                </span>
              ) : (
                <Avatar nombre={nombre} tamano="xl" imagen={imagen} puntos={puntos} />
              )}
              <p className="mt-3 max-w-full truncate text-lg font-semibold text-text">
                <NombreUsuario
                  displayName={displayName}
                  username={handle}
                  prefijo={!conHandle}
                  esVip={esVip}
                  colorNombre={colorNombre}
                />
              </p>
              {conHandle ? (
                <p className="mt-0.5 max-w-full truncate text-sm text-text-dim">
                  <HandleUsuario username={handle} />
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <InsigniaNivel puntos={puntos} />
                {/* La racha, al lado del nivel y solo si la hay. Aquí NO se invita cuando vale
                    cero —eso es trabajo del hero de /puntos, que es su casa—: en el perfil una
                    píldora de "empieza tu racha" sería ruido junto a la identidad. */}
                {esPropio && racha ? (
                  <span
                    data-racha={racha}
                    className="inline-flex items-center rounded-full border border-line px-2.5 py-1 text-2xs font-medium tracking-wide text-text-dim uppercase"
                  >
                    {/* El adjetivo concuerda también: con uno es "1 día seguido", no "seguidos". */}
                    {racha} {racha === 1 ? "día seguido" : "días seguidos"}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Bio + enlaces (v1). Los enlaces externos van SIEMPRE con rel="nofollow noopener" y
                target="_blank"; instagram/youtube se construyen desde el HANDLE guardado. Los campos
                vacíos no se muestran. */}
            {bio ? (
              <p className="mt-4 text-center text-sm whitespace-pre-line text-text-dim">{bio}</p>
            ) : null}
            {website || instagram || youtube ? (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm">
                {website ? (
                  <EnlaceExterno href={website}>{hostnameDe(website)}</EnlaceExterno>
                ) : null}
                {instagram ? (
                  <EnlaceExterno href={`https://instagram.com/${instagram}`}>
                    Instagram
                  </EnlaceExterno>
                ) : null}
                {youtube ? (
                  <EnlaceExterno href={`https://youtube.com/@${youtube}`}>YouTube</EnlaceExterno>
                ) : null}
              </div>
            ) : null}

            {/* stats NEUTRAS (panel recesado: profundidad por luminosidad, sin sombra) */}
            <div className="mt-6 flex divide-x divide-line rounded-sm border border-line bg-void">
              <Estadistica valor={retosGanados} etiqueta="Retos ganados" />
              <Estadistica valor={puntos} etiqueta="Puntos" />
              <Estadistica valor={totalVideos} etiqueta="Vídeos" />
            </div>

            {/* LO QUE INCLUYE EL PLAN. Son ETIQUETAS, no controles: dicen qué trae ser Mythic, y
                por eso van en `<span>` y no en botones. Un chip que parece pulsable y no lo es es
                la misma trampa que un botón mudo, y el perfil ya tuvo uno. */}
            {esVip ? <PerksVip /> : null}

            {/* Boost = acción de pago = ÚNICO acento: solo en el perfil PROPIO.
                LLEVA A /boosts, y antes no llevaba a ninguna parte: era un `<Boton>` sin `href` ni
                `onClick`, o sea el mismo botón mudo que el corazón de adorno del feed y el de
                compartir. `tests/perfil-sin-botones-muertos` lo vigila ahora. */}
            {esPropio ? (
              <>
                <Boton
                  href="/boosts"
                  variante="principal"
                  className="mt-6 w-full py-4 shadow-[var(--df-cta-lift)]"
                >
                  Destacar mi perfil (Boost)
                </Boton>
                {/* Editar perfil: SECUNDARIO (el acento es Boost). Solo tu propio perfil es editable;
                    la pantalla de edición exige sesión y actúa siempre sobre el usuario de la sesión. */}
                <Boton href="/perfil/editar" variante="secundario" className="mt-3 w-full py-3">
                  Editar perfil
                </Boton>
                {/* PUNTOS y REFERIDOS: en escritorio la entrada es la barra lateral, como cualquier
                    otra sección. En MÓVIL no hay lateral, así que esta es la vía — y por eso los
                    botones existen siempre (también en escritorio: quien llega aquí desde su perfil
                    no tiene por qué volver a la lateral a buscarlos). */}
                <Boton href="/puntos" variante="secundario" className="mt-3 w-full py-3">
                  Mis puntos y nivel
                </Boton>
                {/* EL MONEDERO. Su puerta es ESTA, y no la barra lateral: cobrar no es algo que se
                    haga a menudo, así que vive donde una persona busca la configuración de su
                    cuenta —junto a editar perfil y cambiar contraseña— y no entre los destinos de
                    uso diario. En móvil, además, esta es la única vía. */}
                <Boton href="/wallet" variante="secundario" className="mt-3 w-full py-3">
                  Mi monedero
                </Boton>
                <Boton href="/referidos" variante="secundario" className="mt-3 w-full py-3">
                  Ir a mis referidos
                </Boton>
                {/* Avisos: SOLO MÓVIL. En escritorio los da la campana de la barra; en móvil no hay
                    barra superior, y esta es la entrada (el icono de Perfil de la nav ya lleva el
                    número). Recuento NEUTRO, como todos. */}
                <Boton
                  href="/notificaciones"
                  variante="secundario"
                  className="mt-3 w-full py-3 lg:hidden"
                >
                  Notificaciones
                  {/* Del contador COMPARTIDO de avisos: el mismo número que el icono de Perfil y la
                      campana, y se refresca solo. */}
                  <BadgeAvisos className="flex h-5 min-w-5 items-center justify-center rounded-full bg-text-dim px-1.5 text-2xs font-semibold tabular-nums text-void" />
                </Boton>
                {/* Tema claro/oscuro: SOLO MÓVIL, por lo mismo que los avisos — en escritorio está en
                    la barra superior, y en móvil no hay barra donde ponerlo. */}
                <ConmutadorTemaServidor conTexto className="mt-3 lg:hidden" />
                {/* Cerrar sesión: acción de cuenta de baja jerarquía (fantasma). Aquí es la vía que
                    alcanza el MÓVIL, donde no hay barra superior con menú. */}
                <CerrarSesion className="mt-3" />
              </>
            ) : null}
          </TarjetaIdentidad>
        </aside>

        {/* VIDEOS (columna principal): rejilla multicolumna 9:16 con el póster real. */}
        <section className="df-rise mt-8 lg:mt-0" style={{ animationDelay: "80ms" }}>
          <h2 className="mb-4 text-lg font-semibold text-text">
            {esPropio ? "Mis vídeos" : "Vídeos"}
          </h2>
          {videos.length === 0 ? (
            <p className="rounded-sm border border-line bg-surface/40 p-8 text-center text-sm text-text-dim">
              {esPropio
                ? "Todavía no has publicado ningún vídeo. Cuando publiques uno, aparecerá aquí."
                : "Este perfil aún no tiene vídeos publicados."}
            </p>
          ) : (
            <div className="grid grid-cols-3 items-start gap-x-1.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-5">
              {videos.map((v) => (
                // Publicado -> tap abre el modal; en proceso/fallido -> icono + estado. En el perfil
                // PROPIO cada celda lleva su acción de borrar (con confirmación).
                <CeldaVideo key={v.id} video={v} esPropio={esPropio} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
