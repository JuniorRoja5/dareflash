import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { PildoraCategoria } from "@/components/ui/pildora";

export const metadata = { title: "Perfil · DareFlash" };

/** Datos de PRUEBA del perfil. `usuario_demo` casa con su fila resaltada en el TopRanking. */
const PERFIL = {
  username: "usuario_demo",
  nivel: "Pro",
  retosGanados: 12,
  puntos: 24680, // mismos puntos que en el TopRanking mensual
  videos: 34,
};

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
      <p className="mt-0.5 text-2xs uppercase tracking-widest text-text-dim">{etiqueta}</p>
    </div>
  );
}

/**
 * PERFIL (Paso C · unidad 5) — boceto 6 + tratamiento del brief. Reemplaza el stub. Cabecera
 * (Avatar + @username + insignia de nivel NEUTRA) + estadisticas neutras + boton Boost (unica accion
 * magenta de contenido) + cuadricula "Mis vídeos" (placeholders 9:16). Maqueta sin backend.
 */
export default function PerfilPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      {/* Cabecera */}
      <div className="flex items-center gap-4">
        <Avatar nombre={PERFIL.username} tamano="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-text">@{PERFIL.username}</p>
          <div className="mt-1.5">
            {/* insignia de nivel: pildora NEUTRA (no magenta) */}
            <PildoraCategoria>Nivel: {PERFIL.nivel}</PildoraCategoria>
          </div>
        </div>
      </div>

      {/* Estadisticas */}
      <div className="mt-6 flex divide-x divide-line rounded-sm border border-line bg-surface">
        <Estadistica valor={PERFIL.retosGanados} etiqueta="Retos ganados" />
        <Estadistica valor={PERFIL.puntos} etiqueta="Puntos" />
        <Estadistica valor={PERFIL.videos} etiqueta="Vídeos" />
      </div>

      {/* Boost = accion de pago = UNICO magenta de contenido (relleno + texto negro) */}
      <Boton variante="principal" className="mt-6 w-full py-4">
        Destacar mi perfil (Boost)
      </Boton>

      {/* Mis vídeos: cuadricula de placeholders 9:16 (composicion; superficie + filete, sin sombra) */}
      <h2 className="mt-8 mb-3 text-lg font-semibold text-text">Mis vídeos</h2>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex aspect-[9/16] items-center justify-center rounded-sm border border-line bg-raised"
          >
            <IconoPlay />
          </div>
        ))}
      </div>
    </div>
  );
}
