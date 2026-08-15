import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";

import type { EstadoVideo } from "./perfil-logic";

/**
 * Celda de la rejilla. `poster` firmado cuando el vídeo está PUBLICADO; "" cuando no (aún no se
 * reproduce). `estado` SOLO viaja en el perfil PROPIO: el perfil público de otro NUNCA lo incluye,
 * así que la etiqueta de estado no puede aparecer —ni filtrarse— fuera del dueño.
 */
export type VideoCelda = { id: string; title: string | null; poster: string; estado?: EstadoVideo };

/**
 * Copy HUMANO de cada estado (el usuario nunca ve PENDING/FAILED/TOO_LONG). `tono` elige el color
 * semántico: menta SOLO para la confirmación (Publicado), rojo para lo que no saldrá; "Procesando"
 * es neutro (el ámbar está reservado a tiempo restante, no se toca aquí).
 */
const COPY_ESTADO: Record<EstadoVideo, { texto: string; tono: "neutro" | "ok" | "alarma" }> = {
  procesando: { texto: "Procesando", tono: "neutro" },
  publicado: { texto: "Publicado", tono: "ok" },
  "demasiado-largo": { texto: "No publicado: supera los 90 segundos", tono: "alarma" },
  error: { texto: "No se pudo procesar", tono: "alarma" },
};

const TONO_TEXTO: Record<"neutro" | "ok" | "alarma", string> = {
  neutro: "text-text-dim",
  ok: "text-ok",
  alarma: "text-alarm",
};

/** Triangulo de "play" sutil sobre el póster de cada celda. */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/85" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/** Reloj: vídeo aún en proceso (sin póster todavía). */
function IconoReloj() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7 text-text-dim"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2" />
    </svg>
  );
}

/** Aviso: vídeo que no llegó a publicarse. */
function IconoAviso() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7 text-alarm"
      aria-hidden
    >
      <path d="M12 4l9 15H3z" />
      <path d="M12 10v4" />
      <path d="M12 17.5v.5" />
    </svg>
  );
}

/**
 * Una celda de "Mis vídeos"/"Vídeos". El PUBLICADO muestra su póster y "play"; el que aún no se
 * publica muestra un marcador neutro con icono. La etiqueta de estado se pinta SOLO si el dueño la
 * pasó (`estado`): en el perfil público de otro no existe ese dato y por tanto no se pinta nada.
 */
function CeldaVideo({ video }: { video: VideoCelda }) {
  const info = video.estado ? COPY_ESTADO[video.estado] : null;
  const publicado = video.poster !== "";
  return (
    <div className="flex flex-col">
      <div
        title={video.title ?? undefined}
        className={`relative flex aspect-[9/16] items-center justify-center overflow-hidden rounded-sm border border-line bg-raised bg-cover bg-center ${
          publicado
            ? "transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-shadow-md)]"
            : ""
        }`}
        style={publicado ? { backgroundImage: `url("${video.poster}")` } : undefined}
      >
        {publicado ? (
          <>
            <span className="absolute inset-0 bg-void/25" aria-hidden />
            <span className="relative">
              <IconoPlay />
            </span>
          </>
        ) : video.estado === "procesando" ? (
          <IconoReloj />
        ) : (
          <IconoAviso />
        )}
      </div>
      {info ? (
        <p className={`mt-1.5 text-2xs leading-tight ${TONO_TEXTO[info.tono]}`}>{info.texto}</p>
      ) : null}
    </div>
  );
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
  nombre,
  handle,
  puntos,
  retosGanados,
  totalVideos,
  videos,
  esPropio,
}: {
  nombre: string;
  handle: string | null;
  puntos: number;
  retosGanados: number;
  totalVideos: number;
  videos: VideoCelda[];
  esPropio: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8">
        {/* IDENTIDAD (aside) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="df-rise rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md">
            <div className="flex flex-col items-center text-center">
              <Avatar nombre={handle ?? nombre} tamano="xl" />
              <p className="mt-3 max-w-full truncate text-lg font-semibold text-text">
                {handle ? `@${handle}` : nombre}
              </p>
              <div className="mt-2">
                <InsigniaNivel puntos={puntos} />
              </div>
            </div>

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
                <CeldaVideo key={v.id} video={v} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
