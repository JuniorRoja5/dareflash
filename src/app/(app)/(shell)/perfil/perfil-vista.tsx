import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";

/** Celda de la rejilla: un video PUBLISHED con su póster firmado. */
export type VideoCelda = { id: string; title: string | null; poster: string };

/** Triangulo de "play" sutil sobre el póster de cada celda. */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/85" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
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
              <Boton variante="principal" className="mt-6 w-full py-4 shadow-[var(--df-cta-lift)]">
                Destacar mi perfil (Boost)
              </Boton>
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
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
              {videos.map((v) => (
                // Póster real como fondo (blurred-fill lo pone el reproductor; aquí es miniatura).
                <div
                  key={v.id}
                  title={v.title ?? undefined}
                  className="relative flex aspect-[9/16] items-center justify-center overflow-hidden rounded-sm border border-line bg-raised bg-cover bg-center transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-shadow-md)]"
                  style={{ backgroundImage: `url("${v.poster}")` }}
                >
                  <span className="absolute inset-0 bg-void/25" aria-hidden />
                  <span className="relative">
                    <IconoPlay />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
