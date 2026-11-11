import Link from "next/link";

import { CAMINO_EMPRESA, CTA_NEGOCIO, msgSocioFundador } from "@/config/constants";
import { Boton } from "@/components/ui/boton";
import { FilaPuesto } from "@/components/ui/fila-puesto";
import { PiezaPortada } from "@/components/ui/pieza-portada";
import { TelonPortada } from "@/components/ui/telon-portada";
import { ctaPrincipal } from "@/lib/cta-principal";
import { cifrasVisibles, pintarPiezaEnPortada } from "@/lib/portada";
import { soloMirar } from "@/lib/solo-mirar";

import { BoostDestacados } from "./boost-destacados";
import { HeroDestacado } from "./hero-destacado";
import { RetosDestacados } from "./retos-destacados";
import { StatsInicio } from "./stats-inicio";

export const metadata = { title: "Inicio · DareFlash" };

/**
 * INICIO — la portada (Fase 9 · P14). La página más vista, y la que más cambia según quién mira.
 *
 * ┌─ SOLO DATOS REALES ────────────────────────────────────────────────────────────────────────────┐
 * │ Hasta P14 la mitad era MAQUETA en producción: el reto del hero, sus «247 participantes», las     │
 * │ cifras («$8.4k», «2.310») y la rejilla salían de `RETOS_SEED`. Ahora todo sale de `datosPortada`  │
 * │ (cifras, destacado, rejilla) y de los servicios de ranking, Boost y publicidad. Si algo no hay,  │
 * │ se dice —sin retos abiertos no hay cifras ni reto en el hero—, nunca se inventa. El censo        │
 * │ `portada-sin-maqueta` falla si un fichero de /inicio vuelve a importar la maqueta.               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ORDEN DE LOS BLOQUES, y por qué:
 *  1. HERO: qué es esto y la acción de quien mira (el ÚNICO acento, `ctaPrincipal`), las cifras de hoy y
 *     el reto destacado (el que eligió el admin o el de mayor premio): la razón para entrar ahora.
 *  2. PERFILES DESTACADOS (Boost): es lo que alguien PAGÓ por estar en la portada, así que va arriba,
 *     justo después del hero —bajarlo sería devaluar lo que se vendió—.
 *  3. RETOS + RANKING: la rejilla (lo que se puede hacer) con el top del mes al lado (quién gana). El
 *     Espacio 2 (publicidad LOCAL) va en el carril, bajo el ranking: es estrecho y local, como él.
 *  4. ESPACIO 1 (publicidad GLOBAL/PAÍS), a lo ancho, después del contenido: no corta el camino del hero
 *     a los retos y sigue a la vista de quien baja.
 *  5. ¿TIENES UN NEGOCIO? —solo INVITADOS—, el final: la portada es del participante, y quien viene a
 *     anunciarse lo busca como se busca un pie de «para empresas». Es la ÚNICA invitación a negocios
 *     (el anuncio de la casa no se le pinta: ver `pintarPiezaEnPortada`).
 *
 * POR QUIÉN MIRA: el INVITADO ve todo y la invitación a negocios; el PARTICIPANTE, lo mismo sin ella y con
 * su CTA («Subir vídeo»); el VIP, sin publicidad (`piezaDePortada` le devuelve null); la EMPRESA, la
 * variante de solo mirar (sin acciones de participante) con el hero diciéndoselo y su CTA a su portal.
 *
 * SIN VÍDEO DE FONDO desde P14: el telón (`TelonPortada`) es el fondo para todos.
 */
export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const { prisma } = await import("@/server/db/client");
  const { rankingMensual } = await import("@/server/services/ranking");
  const { portadaDestacados } = await import("@/server/services/boost-destacados");
  const { datosPortadaCacheados } = await import("@/server/services/portada");

  const [{ filas: topRanking }, destacados, portada] = await Promise.all([
    rankingMensual(prisma, { limite: 5 }),
    portadaDestacados(prisma),
    datosPortadaCacheados(prisma),
  ]);

  // CTA del hero POR ROL, de la misma fuente que el de la barra. `getCurrentUser` está memoizado por
  // petición: el layout del shell ya lo resolvió.
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  const cta = ctaPrincipal(sesion?.role ?? null, sesion?.esCuentaEmpresa ?? false);
  const esEmpresa = soloMirar(sesion);

  // LOS DOS HUECOS DE PUBLICIDAD (P7): en serie y no a la vez —el tope de frecuencia tiene que ver la
  // primera elección antes de la segunda—. El reparto no se toca; lo que decide la portada es si pinta
  // la pieza (`pintarPiezaEnPortada`: la casa, solo a una empresa).
  const { piezaDePortada } = await import("@/server/services/publicidad-entrega");
  const { headers } = await import("next/headers");
  const ip = sesion ? null : (await headers()).get("x-real-ip");
  const pieza1 = await piezaDePortada(prisma, { sesion, ip, espacio: "GLOBAL" });
  const pieza2 = await piezaDePortada(prisma, { sesion, ip, espacio: "LOCAL" });
  const espacio1 = pieza1 && pintarPiezaEnPortada(pieza1, esEmpresa) ? pieza1 : null;
  const espacio2 = pieza2 && pintarPiezaEnPortada(pieza2, esEmpresa) ? pieza2 : null;
  const denunciaPortada = esEmpresa
    ? null
    : { haySesion: sesion !== null, emailVerificado: sesion?.emailVerified != null };

  return (
    <>
      {/* EL TELÓN: hermano del contenedor de página, nunca dentro (es `fixed`: ver su docblock). */}
      <TelonPortada />
      <div className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-8 lg:px-8 lg:py-12">
        {/* 1 · HERO */}
        <section className="df-rise grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
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
              {esEmpresa
                ? "Estás viendo DareFlash como empresa: aquí los retos se miran, no se participa. Desde tu portal propones retos y lanzas tu publicidad."
                : "Sube tu reto, la comunidad vota y los mejores se llevan premios de verdad. Aquí gana lo que haces, no a quién conoces."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {/* ÚNICO acento de acción — PLANO, realzado con --df-cta-lift */}
              <Boton href={cta.href} variante="principal" className="shadow-[var(--df-cta-lift)]">
                {cta.crea ? <span className="text-lg font-bold leading-none">+</span> : null}
                <span>{cta.texto}</span>
              </Boton>
              <Boton href="/retos" variante="secundario">
                Explorar retos
              </Boton>
            </div>
            <StatsInicio cifras={cifrasVisibles(portada.cifras)} />
          </div>

          <HeroDestacado destacado={portada.destacado} />
        </section>

        {/* 2 · PERFILES DESTACADOS (Boost) */}
        <div className="df-rise mt-12 lg:mt-16" style={{ animationDelay: "60ms" }}>
          <BoostDestacados perfiles={destacados} soloMirar={soloMirar(sesion)} />
        </div>

        {/* 3 · RETOS + RANKING (con el Espacio 2 en el carril) */}
        <div
          className="df-rise mt-12 grid gap-8 lg:mt-16 lg:grid-cols-3"
          style={{ animationDelay: "100ms" }}
        >
          <section className="lg:col-span-2">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold text-text">Retos abiertos</h2>
              <Link
                href="/retos"
                className="shrink-0 text-sm font-medium text-text-dim hover:text-text"
              >
                Ver todos →
              </Link>
            </div>
            <div className="mt-4">
              <RetosDestacados retos={portada.rejilla} hayDestacado={portada.destacado !== null} />
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
                // VACÍO HONESTO: nadie ha ganado todavía este mes.
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
            {/* ESPACIO 2 — publicidad de su ciudad o región, en el carril. */}
            {espacio2 ? (
              <div className="mt-6">
                <PiezaPortada pieza={espacio2} compacta denuncia={denunciaPortada} />
              </div>
            ) : null}
          </aside>
        </div>

        {/* 4 · ESPACIO 1 — publicidad global o de su país, a lo ancho, después del contenido. */}
        {espacio1 ? (
          <div className="df-rise mt-12 lg:mt-16" style={{ animationDelay: "140ms" }}>
            <PiezaPortada pieza={espacio1} denuncia={denunciaPortada} />
          </div>
        ) : null}

        {/* 5 · ¿TIENES UN NEGOCIO? — SOLO INVITADOS, la única invitación a negocios de la portada. */}
        {sesion ? null : (
          <section
            aria-labelledby="para-negocios"
            className="df-rise mt-12 rounded-sm border border-line bg-surface/80 p-6 backdrop-blur-sm lg:mt-16 lg:flex lg:items-center lg:gap-8"
            style={{ animationDelay: "180ms" }}
          >
            <div className="min-w-0 flex-1">
              <h2 id="para-negocios" className="text-xl text-text">
                ¿Tienes un negocio?
              </h2>
              <p className="mt-2 max-w-prose text-sm text-text-dim">{CAMINO_EMPRESA.cuerpo}</p>
              <p className="mt-2 max-w-prose text-sm text-text">{msgSocioFundador()}</p>
            </div>
            <Boton href={CTA_NEGOCIO.href} variante="secundario" className="mt-4 shrink-0 lg:mt-0">
              Registrar mi empresa
            </Boton>
          </section>
        )}
      </div>
    </>
  );
}
