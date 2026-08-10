import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { FilaPuesto } from "@/components/ui/fila-puesto";

import { RANKING_MENSUAL } from "../ranking/ranking-datos";
import { BoostDestacados } from "./boost-destacados";
import { HeroDestacado } from "./hero-destacado";
import { RetosDestacados } from "./retos-destacados";
import { StatsInicio } from "./stats-inicio";

export const metadata = { title: "Inicio · DareFlash" };

/**
 * INICIO — portada real con el BRIEF v2 (dirección aprobada, mockup E2). Impacto con NUESTRA paleta
 * (magenta/lima/oscuros): glow, sombras suaves, glass y movimiento vía los tokens `--df-*` de v2 en
 * globals.css. CTA "Crear reto" PLANO (magenta sólido) = el ÚNICO magenta de acción; semántica intacta
 * (dinero lima, puntos neutro, oro/plata/bronce solo podio). Sin foto de stock, sin monigotes (vídeo
 * real con Bunny). Copy en voz de usuario. Respeta prefers-reduced-motion (regla global).
 *
 * Coherencia de modelos: hero y muro = Challenge (+ Submission para el vídeo, 14 categorías válidas);
 * "Destacados" = BoostActivation (perfiles pagados, ≠ ranking); stats = agregados; nivel derivado.
 */
export default function InicioPage() {
  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-8 lg:px-8 lg:py-12">
      {/* HERO */}
      <section className="df-rise grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          {/* Titular hero: display Archivo Expanded pesado = impacto, pero por TOKENS de la escala
              (NADA de rem arbitrario ni pasarse del tope deliberado): text-3xl (36px) en movil,
              text-hero (64px) en escritorio. Peso/ancho por font-variation-settings. */}
          <h1
            className="text-3xl text-balance text-text lg:text-hero"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wght" 860, "wdth" 130',
            }}
          >
            Reta al mundo. Gana de verdad.
          </h1>
          <p className="mt-4 max-w-prose text-base text-text-dim">
            Sube tu reto, la comunidad vota y los mejores se llevan premios de verdad. Aquí gana lo
            que haces, no a quién conoces.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {/* UNICO magenta de accion — PLANO (sin degradado), realzado con --df-cta-lift */}
            <Boton href="/crear" variante="principal" className="shadow-[var(--df-cta-lift)]">
              <span className="text-lg font-bold leading-none">+</span>
              <span>Crear reto</span>
            </Boton>
            <Boton href="/retos" variante="secundario">
              Explorar retos
            </Boton>
          </div>
          <StatsInicio />
        </div>

        <HeroDestacado />
      </section>

      {/* PERFILES DESTACADOS (Boost) */}
      <div className="df-rise mt-12 lg:mt-16" style={{ animationDelay: "80ms" }}>
        <BoostDestacados />
      </div>

      {/* MURO de retos + rail de ranking */}
      <div
        className="df-rise mt-12 grid gap-8 lg:mt-16 lg:grid-cols-3"
        style={{ animationDelay: "140ms" }}
      >
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold text-text">Retos destacados</h2>
            <Link
              href="/retos"
              className="shrink-0 text-sm font-medium text-text-dim hover:text-text"
            >
              Ver todos →
            </Link>
          </div>
          <div className="mt-4">
            <RetosDestacados />
          </div>
        </section>

        <aside className="lg:col-span-1">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold text-text">Top Ranking</h2>
            <Link
              href="/ranking"
              className="shrink-0 text-sm font-medium text-text-dim hover:text-text"
            >
              Ver todo
            </Link>
          </div>
          <div className="mt-4 overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md">
            {RANKING_MENSUAL.slice(0, 5).map((fila, i) => (
              <FilaPuesto
                key={fila.username}
                puesto={i + 1}
                username={fila.username}
                puntos={fila.puntos}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
