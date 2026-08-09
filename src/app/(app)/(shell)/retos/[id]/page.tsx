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
 *  llegan en una fase posterior. Son BASTANTES a proposito, para que el scroll interno del panel de
 *  escritorio (70svh) se vea funcionando; el contenido da igual (maqueta). */
const COMENTARIOS_MOCK = [
  { usuario: "sara_p", texto: "Qué nivel, el aterrizaje limpísimo. Mi voto." },
  { usuario: "entrenador_dani", texto: "La técnica del salto es de manual. Bien ahí." },
  { usuario: "leo", texto: "¿Repetible en casa? Explica el calentamiento porfa." },
  { usuario: "laia10", texto: "El control en el aire es una locura, enhorabuena." },
  { usuario: "maxi_y_rocky", texto: "Lo intenté y casi me abro la cabeza, respeto máximo." },
  { usuario: "carlos_fit", texto: "Progresión brutal desde tu último vídeo, se nota el curro." },
  { usuario: "rae", texto: "El corte del montaje ayuda mucho, muy limpio todo." },
  { usuario: "dario", texto: "¿Qué altura tiene la caja? Parece más de lo que dices." },
  { usuario: "nico_skate", texto: "Esto merece estar en el podio del mes, fácil." },
  { usuario: "bea", texto: "Me has motivado a probarlo esta semana. Guardado." },
  { usuario: "cocina_express_maria", texto: "Nada que ver con lo mío pero aplaudo el nivel jaja." },
  { usuario: "viajera_incansable_2025", texto: "Vengo del feed solo para votar esto. Crack." },
];

/**
 * RETO POR DENTRO (Paso C · unidad 3; tratamiento desktop en la Rama G) — la pantalla mas importante.
 * SERVER: resuelve params (await), busca el reto por id y hace notFound() (404) si no existe. Lo VIVO
 * (marcador con cuenta atras, bloque de votar) son islas cliente (`detalle-vivo.tsx`, intacto).
 *
 * LAYOUT: en escritorio (lg) la region ancha se reparte en dos columnas -> el VIDEO 9:16 (pieza
 * focal, 70svh, tratamiento intacto) a la IZQUIERDA, y a la DERECHA un panel a 70svh con el CONTEXTO
 * (cabecera + marcador) y el VOTO arriba y los COMENTARIOS (1fr) que SCROLLEAN dentro del panel. El
 * orden del DOM es el de MOVIL (cabecera, video, voto, comentarios); en `lg` el grid los recoloca por
 * lineas (sin agrupar) para no romper el movil, que queda EXACTAMENTE como hoy (una columna). Solo
 * cambia la maquetacion (este page.tsx); las tripas del placeholder de video no se tocan (Bunny las
 * reemplaza). Datos de PRUEBA. Un solo magenta de contenido: "Votar este vídeo".
 */
export default async function RetoPorDentroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reto = buscarReto(id);
  if (!reto) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 lg:px-8 lg:py-12">
      <div className="lg:grid lg:h-[70svh] lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-x-8">
        {/* CONTEXTO (cabecera): "Reto: {titulo}", categoria y marcador vivo. Col 2 · fila 1 en desktop. */}
        <header className="lg:col-start-2 lg:row-start-1">
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
        </header>

        {/* VIDEO del participante: placeholder VERTICAL 9:16, tratamiento INTACTO (70svh centrado en
            sm+). Col 1 (pieza focal) en desktop. Bunny montara aqui el player; no toco las tripas. */}
        <div className="mt-6 lg:col-start-1 lg:row-span-3 lg:mt-0 lg:self-start">
          <div className="mx-auto flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-sm border border-line bg-raised sm:h-[70svh] sm:w-auto">
            <IconoPlay />
            <span className="text-sm text-text-dim">Vídeo del participante</span>
            <span className="text-2xs uppercase tracking-widest text-text-dim">máx. 90 s</span>
          </div>
        </div>

        {/* VOTO (isla cliente). Col 2 · fila 2 en desktop. `BloqueVoto` no se toca; se coloca via el
            wrapper del grid (su mt-6 propio da el hueco, igual en movil y desktop). */}
        <div className="lg:col-start-2 lg:row-start-2">
          <BloqueVoto autorUsername={reto.autorUsername} votosIniciales={reto.votos} />
        </div>

        {/* COMENTARIOS: placeholder. Col 2 · fila 3 (1fr) en desktop; la lista SCROLLEA dentro del
            panel (cabecera y nota fijas). En movil, flujo normal con su separador superior (como hoy). */}
        <section className="mt-10 border-t border-line pt-6 lg:col-start-2 lg:row-start-3 lg:mt-6 lg:flex lg:min-h-0 lg:flex-col lg:border-t-0 lg:pt-0">
          <h2 className="mb-4 text-lg font-semibold text-text lg:shrink-0">Comentarios</h2>
          <ul className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
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
          <p className="mt-5 text-2xs text-text-dim lg:shrink-0">
            Los comentarios llegan en una fase posterior.
          </p>
        </section>
      </div>
    </div>
  );
}
