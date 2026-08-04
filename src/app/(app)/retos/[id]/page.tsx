import { notFound } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { PildoraCategoria } from "@/components/ui/pildora";

import { buscarReto, nombreCategoria } from "../retos-datos";
import { BloqueVoto, MarcadorVivo } from "./detalle-vivo";

/** Triangulo de "play" del placeholder de video (SVG inline; nada de emojis como iconos). */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9 text-text-dim" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/** Comentarios de MAQUETA (placeholder visual). Sin backend, sin publicar: los comentarios reales
 *  llegan en una fase posterior. */
const COMENTARIOS_MOCK = [
  { usuario: "sara_p", texto: "Qué nivel, el aterrizaje limpísimo. Mi voto." },
  { usuario: "entrenador_dani", texto: "La técnica del salto es de manual. Bien ahí." },
  { usuario: "leo", texto: "Repetible en casa? Explica el calentamiento porfa." },
];

/**
 * RETO POR DENTRO (Paso C · unidad 3) — la pantalla mas importante. Estructura del boceto 3 +
 * tratamiento del brief. SERVER: resuelve params (await), busca el reto por id y hace notFound()
 * (404) si no existe; el contenido estatico va aqui. Lo VIVO (marcador con cuenta atras, bloque de
 * votar) son islas cliente. `params` es un Promise en Next 16. Datos de PRUEBA (RETOS_SEED).
 */
export default async function RetoPorDentroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reto = buscarReto(id);
  if (!reto) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      {/* Cabecera: "Reto: {titulo}", categoria y marcador compacto como distintivo. */}
      <p className="text-sm text-text-dim">Reto</p>
      <h1
        className="mt-1 text-2xl leading-tight text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        {reto.titulo}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
        <MarcadorVivo cents={reto.premioCents} restanteMs={reto.restanteMs} />
      </div>

      {/* Video del participante: placeholder VERTICAL 9:16, centrado, sin estirar. Responsive sin
          limite fijo: en movil ocupa el ancho disponible (aspect 9:16 -> alto derivado); en pantallas
          grandes (sm+) manda la ALTURA, acotada a 70svh (svh = viewport estable, no salta con las
          barras del navegador) y el ancho se deriva del 9:16, centrado. Detalle, NO inmersivo:
          "Votar" y el participante quedan alcanzables. Bunny despues. */}
      <div className="mt-6">
        <div className="mx-auto flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-sm border border-line bg-raised sm:h-[70svh] sm:w-auto">
          <IconoPlay />
          <span className="text-sm text-text-dim">Vídeo del participante</span>
          <span className="text-2xs uppercase tracking-widest text-text-dim">máx. 90 s</span>
        </div>
      </div>

      {/* Participante + recuento + boton PRINCIPAL de votar (isla cliente). */}
      <BloqueVoto autorUsername={reto.autorUsername} votosIniciales={reto.votos} />

      {/* Comentarios: placeholder visual (sin backend). */}
      <section className="mt-10 border-t border-line pt-6">
        <h2 className="mb-4 text-lg font-semibold text-text">Comentarios</h2>
        <ul className="space-y-4">
          {COMENTARIOS_MOCK.map((c) => (
            <li key={c.usuario} className="flex gap-3">
              <Avatar nombre={c.usuario} tamano="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">@{c.usuario}</p>
                <p className="text-sm text-text-dim">{c.texto}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-2xs text-text-dim">Los comentarios llegan en una fase posterior.</p>
      </section>
    </div>
  );
}
