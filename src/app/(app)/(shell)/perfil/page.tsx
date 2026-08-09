import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";
import { USUARIO_DEMO } from "@/lib/usuario-demo";

export const metadata = { title: "Perfil · DareFlash" };

/** Triangulo de "play" sutil para las celdas de la cuadricula de videos. */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-text-dim" fill="currentColor" aria-hidden>
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
 * PERFIL — re-maquetado a lo ancho (Rama D). Dentro del (shell), mismo contenedor que portada y
 * ranking (`max-w-7xl` + padding). En escritorio: columna de IDENTIDAD al lado (~320px: avatar,
 * @usuario, insignia de nivel, stats y Boost) + "Mis vídeos" como columna PRINCIPAL (rejilla
 * multicolumna: el contenido primario del perfil son los vídeos). En movil: una sola columna.
 *
 * Coherencia: los datos salen de la FUENTE UNICA `USUARIO_DEMO` (la misma que consume el ranking) y
 * el NIVEL se DERIVA con la MISMA `InsigniaNivel` (medidor + nombre, sin emoji), no hardcodeado ->
 * /perfil y /ranking muestran el mismo nivel/puntos para usuario_demo. Boost = UNICO magenta de
 * contenido de la pantalla. Maqueta, sin backend.
 */
export default function PerfilPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8">
        {/* IDENTIDAD (aside) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-sm border border-line bg-surface p-6">
            <div className="flex flex-col items-center text-center">
              <Avatar nombre={USUARIO_DEMO.username} tamano="xl" />
              <p className="mt-3 max-w-full truncate text-lg font-semibold text-text">
                @{USUARIO_DEMO.username}
              </p>
              <div className="mt-2">
                <InsigniaNivel puntos={USUARIO_DEMO.puntos} />
              </div>
            </div>

            {/* stats NEUTRAS (panel recesado: profundidad por luminosidad, sin sombra) */}
            <div className="mt-6 flex divide-x divide-line rounded-sm border border-line bg-void">
              <Estadistica valor={USUARIO_DEMO.retosGanados} etiqueta="Retos ganados" />
              <Estadistica valor={USUARIO_DEMO.puntos} etiqueta="Puntos" />
              <Estadistica valor={USUARIO_DEMO.videos} etiqueta="Vídeos" />
            </div>

            {/* Boost = accion de pago = UNICO magenta de contenido (relleno + texto negro) */}
            <Boton variante="principal" className="mt-6 w-full py-4">
              Destacar mi perfil (Boost)
            </Boton>
          </div>
        </aside>

        {/* MIS VIDEOS (columna principal): rejilla multicolumna de placeholders 9:16 */}
        <section className="mt-8 lg:mt-0">
          <h2 className="mb-4 text-lg font-semibold text-text">Mis vídeos</h2>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 15 }).map((_, i) => (
              <div
                key={i}
                className="flex aspect-[9/16] items-center justify-center rounded-sm border border-line bg-raised"
              >
                <IconoPlay />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
