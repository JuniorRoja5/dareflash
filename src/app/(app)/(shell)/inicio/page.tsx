import Link from "next/link";

import {
  CAMINO_EMPRESA,
  CTA_NEGOCIO,
  VIDEO_FONDO_HOME,
  msgSocioFundador,
} from "@/config/constants";
import { Boton } from "@/components/ui/boton";
import { FilaPuesto } from "@/components/ui/fila-puesto";
import { FondoVideo } from "@/components/ui/fondo-video";
import { ctaPrincipal } from "@/lib/cta-principal";
import { soloMirar } from "@/lib/solo-mirar";

import { BoostDestacados } from "./boost-destacados";
import { HeroDestacado } from "./hero-destacado";
import { RetosDestacados } from "./retos-destacados";
import { StatsInicio } from "./stats-inicio";

export const metadata = { title: "Inicio · DareFlash" };

/**
 * INICIO — portada real con el BRIEF v2 (dirección aprobada, mockup E2). Impacto con NUESTRA paleta
 * (acción/dinero/oscuros): glow, sombras suaves, glass y movimiento vía los tokens `--df-*` de v2 en
 * globals.css. CTA principal PLANO (relleno de acción sólido) = el ÚNICO acento de la pantalla, por ROL (ver
 * `ctaPrincipal`); semántica intacta (dinero en --df-money, puntos neutro, oro/plata/bronce solo podio). Sin foto
 * de stock, sin monigotes (vídeo real con Bunny). Copy en voz de usuario. Respeta prefers-reduced-motion.
 *
 * Coherencia de modelos: hero y muro = Challenge (+ Submission para el vídeo, 14 categorías válidas);
 * "Destacados" = BoostActivation (perfiles pagados, ≠ ranking); stats = agregados; nivel derivado.
 */
export const dynamic = "force-dynamic";

export default async function InicioPage() {
  // RAIL DEL TOP: datos REALES del MISMO servicio que la pagina de Ranking. Antes salian de
  // `ranking-datos.ts` —usuarios y cifras inventados— en produccion. Leer de dos sitios distintos
  // garantizaria que el rail y la pagina se contradigan en cuanto uno de los dos cambie.
  const { prisma } = await import("@/server/db/client");
  const { rankingMensual } = await import("@/server/services/ranking");
  // DESTACADOS REALES: `BoostActivation` vigentes, del último en activar al primero. Antes esta fila
  // la pintaba `PERFILES_BOOST`, cinco usuarios inventados, en producción.
  // LA PORTADA ROTA: `portadaDestacados` elige los 5 de ESTA ventana de reloj, no los 5 más
  // recientes. Ver su docblock — con más de 5 vigentes, "los más recientes" era una pila que
  // desplazaba para siempre a quien había comprado antes.
  const { portadaDestacados } = await import("@/server/services/boost-destacados");

  const [{ filas: topRanking }, destacados] = await Promise.all([
    rankingMensual(prisma, { limite: 5 }),
    portadaDestacados(prisma),
  ]);

  // CTA del hero POR ROL, de la misma fuente que el de la barra: "Crear reto" es del admin; el resto
  // sube un vídeo; una empresa va a su portal. `getCurrentUser` está memoizado por petición: el
  // layout del shell ya lo resolvió.
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  const cta = ctaPrincipal(sesion?.role ?? null, sesion?.esCuentaEmpresa ?? false);

  return (
    <>
      {/* FONDO: hermano del contenedor de pagina, NUNCA dentro. Ese contenedor lleva `overflow-x-clip`
          y el hero `df-rise` (anima transform): cualquiera de los dos le crearia bloque contenedor a un
          `position: fixed` y el fondo dejaria de cubrir el viewport. */}
      <FondoVideo src={VIDEO_FONDO_HOME} />
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
              Sube tu reto, la comunidad vota y los mejores se llevan premios de verdad. Aquí gana
              lo que haces, no a quién conoces.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {/* UNICO acento de accion — PLANO (sin degradado), realzado con --df-cta-lift */}
              <Boton href={cta.href} variante="principal" className="shadow-[var(--df-cta-lift)]">
                {cta.crea ? <span className="text-lg font-bold leading-none">+</span> : null}
                <span>{cta.texto}</span>
              </Boton>
              <Boton href="/retos" variante="secundario">
                Explorar retos
              </Boton>
            </div>
            <StatsInicio />
          </div>

          <HeroDestacado />
        </section>

        {/* ┌─ ¿TIENES UN NEGOCIO? — SOLO PARA INVITADOS ──────────────────────────────────────────┐
            │ Antes era una línea de texto pequeño dentro del hero, y el alta de empresa seguía     │
            │ escondida. Ahora es un bloque propio, con el aviso de Socios Fundadores y su botón,   │
            │ DEBAJO del hero: la portada sigue siendo del participante (el hero lleva el único     │
            │ acento) y quien viene a anunciarse lo encuentra sin tener que adivinarlo.             │
            │                                                                                        │
            │ Solo para INVITADOS: quien ya tiene cuenta de participante no puede convertirla, y    │
            │ una cuenta de empresa aterriza en su portal. A ninguno de los dos le sirve.           │
            └────────────────────────────────────────────────────────────────────────────────────────┘ */}
        {sesion ? null : (
          <section
            aria-labelledby="para-negocios"
            className="df-rise mt-10 rounded-sm border border-line bg-surface/80 p-6 backdrop-blur-sm lg:mt-12 lg:flex lg:items-center lg:gap-8"
            style={{ animationDelay: "40ms" }}
          >
            <div className="min-w-0 flex-1">
              <h2 id="para-negocios" className="text-xl text-text">
                ¿Tienes un negocio?
              </h2>
              <p className="mt-2 max-w-prose text-sm text-text-dim">{CAMINO_EMPRESA.cuerpo}</p>
              {/* Construido con sus constantes: si la fecha o la cifra se mueven, esto se mueve. */}
              <p className="mt-2 max-w-prose text-sm text-text">{msgSocioFundador()}</p>
            </div>
            <Boton href={CTA_NEGOCIO.href} variante="secundario" className="mt-4 shrink-0 lg:mt-0">
              Registrar mi empresa
            </Boton>
          </section>
        )}

        {/* PERFILES DESTACADOS (Boost) */}
        <div className="df-rise mt-12 lg:mt-16" style={{ animationDelay: "80ms" }}>
          <BoostDestacados perfiles={destacados} soloMirar={soloMirar(sesion)} />
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
              {topRanking.length === 0 ? (
                // VACÍO HONESTO: nadie ha ganado todavía. Rellenar el rail con gente inventada para
                // que "no se vea vacío" es justo lo que había antes.
                <p className="px-4 py-6 text-center text-sm text-text-dim">
                  Todavía no ha ganado nadie este mes. Sé el primero.
                </p>
              ) : (
                topRanking.map((fila, i) => (
                  <FilaPuesto
                    key={fila.userId}
                    puesto={i + 1}
                    username={fila.username}
                    imagen={fila.image}
                    cifra={fila.victorias}
                    unidad={fila.victorias === 1 ? "victoria" : "victorias"}
                    puntos={fila.puntos}
                    esVip={fila.esVip}
                    colorNombre={fila.colorNombre}
                  />
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
