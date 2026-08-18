import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";
import { mostrarHandleSecundario, nombreMostrado } from "@/lib/identidad";

import { CeldaVideo } from "./celda-video";
import type { EstadoVideo } from "./perfil-logic";

/**
 * Celda de la rejilla. `poster` firmado cuando el vídeo está PUBLICADO; "" cuando no (aún no se
 * reproduce). `estado` SOLO viaja en el perfil PROPIO: el perfil público de otro NUNCA lo incluye,
 * así que la etiqueta de estado no puede aparecer —ni filtrarse— fuera del dueño. El render de la
 * celda (póster + play + modal para publicados, icono + estado para el resto) vive en `celda-video`.
 */
export type VideoCelda = { id: string; title: string | null; poster: string; estado?: EstadoVideo };

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
      {/* cifras tabulares y NEUTRAS: los puntos NO llevan lima */}
      <p className="text-xl font-semibold tabular-nums text-text">
        {valor.toLocaleString("en-US")}
      </p>
      <p className="mt-0.5 text-2xs tracking-widest text-text-dim uppercase">{etiqueta}</p>
    </div>
  );
}

/**
 * PERFIL — vista presentacional COMPARTIDA por `/perfil` (mi perfil, con Boost) y `/u/[username]`
 * (perfil público de otro, sin Boost). Recibe SOLO datos ya resueltos (nada de `env`, nada de Bunny):
 * identidad, stats, videos con póster firmado y `esPropio`. El NIVEL se deriva de `puntos` con la misma
 * `InsigniaNivel` (medidor + nombre), coherente con el ranking. Boost = ÚNICO magenta de la pantalla y
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
  esPropio,
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
  esPropio: boolean;
}) {
  // Identidad (modelo TikTok/YouTube): el displayName manda; el @handle va debajo y solo si hay
  // displayName (si no, el @handle ES el nombre prominente). Fuente única: `nombreMostrado`.
  const nombre = nombreMostrado(displayName, handle);
  const conHandle = mostrarHandleSecundario(displayName);
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8">
        {/* IDENTIDAD (aside) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="df-rise rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md">
            <div className="flex flex-col items-center text-center">
              <Avatar nombre={nombre} tamano="xl" imagen={imagen} />
              <p className="mt-3 max-w-full truncate text-lg font-semibold text-text">
                {conHandle ? nombre : `@${nombre}`}
              </p>
              {conHandle ? (
                <p className="mt-0.5 max-w-full truncate text-sm text-text-dim">@{handle}</p>
              ) : null}
              <div className="mt-2">
                <InsigniaNivel puntos={puntos} />
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

            {/* Boost = acción de pago = ÚNICO magenta: solo en el perfil PROPIO. */}
            {esPropio ? (
              <>
                <Boton
                  variante="principal"
                  className="mt-6 w-full py-4 shadow-[var(--df-cta-lift)]"
                >
                  Destacar mi perfil (Boost)
                </Boton>
                {/* Editar perfil: SECUNDARIO (el magenta es Boost). Solo tu propio perfil es editable;
                    la pantalla de edición exige sesión y actúa siempre sobre el usuario de la sesión. */}
                <Boton href="/perfil/editar" variante="secundario" className="mt-3 w-full py-3">
                  Editar perfil
                </Boton>
              </>
            ) : null}
          </div>
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
