import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { FilaPuesto } from "@/components/ui/fila-puesto";

import { RANKING_MENSUAL } from "../ranking/ranking-datos";
import { HeroDestacado } from "./hero-destacado";
import { RetosDestacados } from "./retos-destacados";

export const metadata = { title: "Inicio · DareFlash" };

/**
 * INICIO — portada de escritorio (Rama B). Aprovecha la region ancha del shell:
 *   - HERO a dos columnas: izquierda (titular + subtitulo + 2 CTAs), derecha (reto destacado con
 *     marcador GRANDE = la firma; ocupa el sitio de la ilustracion de la plantilla).
 *   - CONTENIDO: columna principal (retos destacados, tarjetas apaisadas, 2/3) + rail lateral con un
 *     VISTAZO del Top Ranking (1/3).
 *
 * MAGENTA: el UNICO magenta de CONTENIDO es el CTA "Crear reto" del hero; la barra superior atenua su
 * "Crear reto" en esta ruta (ver CtaCrear) para no duplicar dos magenta gemelos. "Explorar retos",
 * "Participar" de las tarjetas y los enlaces "Ver todo(s)" son secundarios/neutros. Cero sombras.
 *
 * RESPONSIVE: la portada es concepto de escritorio (movil entra por el Feed y no tiene Inicio en la
 * barra inferior), pero se ve DECENTE en movil: una sola columna (hero apilado, destacados 1 col,
 * rail al final). En lg, hero 2 columnas + principal (2/3) con rail (1/3).
 *
 * RANKING (rail): solo un VISTAZO del top 5 (puesto + avatar + nombre + puntos, via FilaPuesto). Reusa
 * los datos maqueta TAL CUAL y NO cierra decisiones de producto del ranking (semanal/mensual, niveles
 * con nombre): sin la fila "Tu", sin niveles, y sin etiquetarlo como "mensual" — eso es la rama C.
 */
export default function InicioPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      {/* HERO */}
      <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <h1
            className="text-4xl leading-[1.05] text-text lg:text-5xl"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wght" 780, "wdth" 125',
            }}
          >
            Reta al mundo. Gana de verdad.
          </h1>
          <p className="mt-4 max-w-prose text-base text-text-dim">
            Graba tu reto, la comunidad vota y los mejores se llevan premios reales. Sin trucos: la
            cifra y el plazo mandan.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {/* UNICO magenta de contenido de la portada */}
            <Boton href="/crear" variante="principal">
              <span className="text-lg font-bold leading-none">+</span>
              <span>Crear reto</span>
            </Boton>
            <Boton href="/retos" variante="secundario">
              Explorar retos
            </Boton>
          </div>
        </div>

        <HeroDestacado />
      </section>

      {/* CONTENIDO: principal (2/3) + rail (1/3) */}
      <div className="mt-12 grid gap-8 lg:mt-16 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold text-text">Retos destacados</h2>
            <Link
              href="/retos"
              className="shrink-0 text-sm font-medium text-text-dim hover:text-text"
            >
              Ver todos
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
          <div className="mt-4 overflow-hidden rounded-sm border border-line bg-surface">
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
