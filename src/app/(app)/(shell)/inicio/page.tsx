import Link from "next/link";

import { CAMINO_EMPRESA, CTA_NEGOCIO, msgSocioFundador } from "@/config/constants";
import { Boton } from "@/components/ui/boton";
import { FilaPuesto } from "@/components/ui/fila-puesto";
import { Imagen3d } from "@/components/ui/imagen-3d";
import { PiezaPortada } from "@/components/ui/pieza-portada";
import { TelonPortada } from "@/components/ui/telon-portada";
import { ctaPrincipal } from "@/lib/cta-principal";
import { bloquesPortada, cifrasVisibles, pintarPiezaEnPortada } from "@/lib/portada";
import { soloMirar } from "@/lib/solo-mirar";
import { TEMA_COOKIE, temaDesdeCookie } from "@/lib/tema";

import { BoostDestacados } from "./boost-destacados";
import { CategoriasPortada } from "./categorias-portada";
import { CierrePortada } from "./cierre-portada";
import { ComoFunciona } from "./como-funciona";
import { HeroDestacado } from "./hero-destacado";
import { ProximosRetos } from "./proximos-retos";
import { RetosDestacados } from "./retos-destacados";
import { StatsInicio } from "./stats-inicio";
import { UltimosGanadores } from "./ultimos-ganadores";

export const metadata = { title: "Inicio · DareFlash" };

/**
 * INICIO — la portada. La página más vista, y la que más cambia según quién mira.
 *
 * ┌─ SOLO DATOS REALES (P14) ───────────────────────────────────────────────────────────────────────┐
 * │ Todo sale de `datosPortada` (cifras, destacado, rejilla, categorías, próximos, ganadores) y de los │
 * │ servicios de ranking, Boost y publicidad. Si algo no hay, se dice —o el bloque no se pinta—,       │
 * │ nunca se inventa. El censo `portada-sin-maqueta` falla si vuelve la maqueta, una cifra escrita a   │
 * │ mano o un `<video>`.                                                                               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL ORDEN DE LOS BLOQUES (rediseño, propuesta aprobada), y por qué:
 *  1. HERO: qué es esto, la acción de quien mira (la ÚNICA de la pantalla, `ctaPrincipal`), las cifras de
 *     hoy con la moneda junto al dinero, el rayo de la marca y el reto destacado (el del admin o el de
 *     mayor premio). Es la razón para entrar ahora.
 *  2. CÓMO FUNCIONA, en 3 pasos: funciona con cualquier cantidad de contenido (hoy hay poco) y explica
 *     el producto a quien llega. Solo para quien no ha participado nunca (ver `bloquesPortada`).
 *  3. PERFILES DESTACADOS (Boost): lo que alguien PAGÓ por estar en la portada, arriba.
 *  4. RETOS + carril: la rejilla (lo que se puede hacer) con el Top del mes al lado (quién gana) y el
 *     Espacio 2 de publicidad (LOCAL) bajo él.
 *  5. CATEGORÍAS: las catorce como puertas a /retos, con sus abiertos si los hay.
 *  6. PRÓXIMOS RETOS: lo que abre pronto. Es lo que más llena cuando hay pocos abiertos.
 *  7. ÚLTIMOS GANADORES: la prueba de que aquí se gana de verdad (solo reales y visibles).
 *  8. ESPACIO 1 (publicidad GLOBAL/PAÍS), a lo ancho, después del contenido.
 *  9. CIERRE: una franja con una acción —participar o, la empresa, su portal— y, solo al invitado, la
 *     invitación a negocios (la única de la portada: ver `pintarPiezaEnPortada`).
 * Un bloque sin nada que enseñar (próximos, ganadores) no se pinta; los que siempre están tienen su
 * vacío diseñado con su acción (el hero, la rejilla, el Top).
 *
 * POR QUIÉN MIRA (`bloquesPortada`): el INVITADO ve todo; el PARTICIPANTE, lo mismo sin la invitación a
 * negocios y sin «Cómo funciona» en cuanto ha participado; el VIP, como él y sin publicidad (eso lo decide
 * el reparto: `piezaDePortada` no le da pieza); la EMPRESA solo mira — sin «Cómo funciona» y el cierre
 * lleva a su portal.
 *
 * MOVIMIENTO: dos cosas por vista como mucho (el rayo y el recuento de las cifras en el hero), y la
 * inclinación de las tarjetas solo al pasar con un puntero fino. `prefers-reduced-motion` y Save-Data
 * (`data-ahorro`) lo apagan todo. Sin vídeo de fondo desde P14.
 */
export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const { prisma } = await import("@/server/db/client");
  const { rankingMensual } = await import("@/server/services/ranking");
  const { portadaDestacados } = await import("@/server/services/boost-destacados");
  const { datosPortadaCacheados } = await import("@/server/services/portada");
  const { cookies, headers } = await import("next/headers");

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
  const cabeceras = await headers();
  // El TEMA, para servir la imagen 3D de SU tema (ver `Imagen3d`). Y SAVE-DATA: si el navegador pide
  // ahorrar datos, nada se anima (`data-ahorro`).
  const tema = temaDesdeCookie((await cookies()).get(TEMA_COOKIE)?.value);
  const ahorro = cabeceras.get("save-data")?.toLowerCase() === "on";

  // ¿HA PARTICIPADO ALGUNA VEZ? Solo para un participante (el invitado no tiene, y a la empresa no le
  // sale «Cómo funciona»): una consulta corta, que se para en la primera fila.
  const haParticipado =
    sesion && !esEmpresa
      ? (await prisma.submission.findFirst({
          where: { userId: sesion.userId },
          select: { id: true },
        })) !== null
      : false;
  const bloques = bloquesPortada(
    esEmpresa ? "empresa" : sesion ? "participante" : "invitado",
    haParticipado,
  );

  // LOS DOS HUECOS DE PUBLICIDAD (P7): en serie y no a la vez —el tope de frecuencia tiene que ver la
  // primera elección antes de la segunda—. El reparto no se toca; lo que decide la portada es si pinta
  // la pieza (`pintarPiezaEnPortada`: la casa, solo a una empresa).
  const { piezaDePortada } = await import("@/server/services/publicidad-entrega");
  const ip = sesion ? null : cabeceras.get("x-real-ip");
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
      <div
        data-ahorro={ahorro ? "1" : undefined}
        data-portada
        className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-8 lg:px-8 lg:py-12"
      >
        {/* 1 · HERO */}
        {/* SIN `df-rise` en el hero, a propósito: la entrada parte de opacidad 0, y un elemento a
            opacidad 0 no cuenta para el LCP — medido, retrasaba el LCP en móvil. El hero se pinta ya;
            los bloques de abajo sí entran escalonados. */}
        <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h1
                className="min-w-0 text-[2.6rem] leading-[1.02] text-balance text-text sm:text-6xl lg:text-hero"
                style={{
                  fontFamily: "var(--font-display)",
                  fontVariationSettings: '"wght" 860, "wdth" 130',
                }}
              >
                Reta al mundo. Gana de verdad.
              </h1>
              {/* EL RAYO de la marca: decorativo (el titular ya dice lo que hay que decir), con el glow
                  de la acción y su movimiento con el scroll (`.df-rayo`). Nunca más de 176 px CSS: el
                  original es de 512. */}
              {/* CON PRIORIDAD, y es la ÚNICA de la página: medido, el rayo ES el elemento LCP en
                  escritorio (y a veces en móvil). Perezoso, retrasaba el LCP de 100 a 132 ms. */}
              <Imagen3d
                pieza="rayo"
                tema={tema}
                tamano={176}
                prioridad
                className="df-rayo pointer-events-none w-20 sm:w-28 lg:w-44"
              />
            </div>
            <p className="mt-4 max-w-prose text-base text-text-dim lg:text-lg">
              {esEmpresa
                ? "Estás viendo DareFlash como empresa: aquí los retos se miran, no se participa. Desde tu portal propones retos y lanzas tu publicidad."
                : "Sube tu reto, la comunidad vota y los mejores se llevan premios de verdad. Aquí gana lo que haces, no a quién conoces."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {/* ÚNICO acento de acción de la pantalla — PLANO, realzado con --df-cta-lift */}
              <Boton href={cta.href} variante="principal" className="shadow-[var(--df-cta-lift)]">
                {cta.crea ? <span className="text-lg leading-none font-bold">+</span> : null}
                <span>{cta.texto}</span>
              </Boton>
              <Boton href="/retos" variante="secundario">
                Explorar retos
              </Boton>
            </div>
            <StatsInicio cifras={cifrasVisibles(portada.cifras)} tema={tema} quieto={ahorro} />
          </div>

          <HeroDestacado destacado={portada.destacado} />
        </section>

        {/* 2 · CÓMO FUNCIONA */}
        {bloques.comoFunciona ? (
          <div className="df-rise mt-14 lg:mt-20" style={{ animationDelay: "40ms" }}>
            <ComoFunciona tema={tema} />
          </div>
        ) : null}

        {/* 3 · PERFILES DESTACADOS (Boost) */}
        <div className="df-rise mt-14 lg:mt-20" style={{ animationDelay: "60ms" }}>
          <BoostDestacados perfiles={destacados} soloMirar={soloMirar(sesion)} />
        </div>

        {/* 4 · RETOS + RANKING (con el Espacio 2 en el carril) */}
        <div
          className="df-rise mt-14 grid gap-8 lg:mt-20 lg:grid-cols-3"
          style={{ animationDelay: "100ms" }}
        >
          <section className="min-w-0 lg:col-span-2">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold text-text lg:text-2xl">Retos abiertos</h2>
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

          <aside className="min-w-0 lg:col-span-1">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-semibold text-text lg:text-2xl">Top del mes</h2>
              <Link
                href="/ranking"
                className="shrink-0 text-sm font-medium text-text-dim hover:text-text"
              >
                Ver todo
              </Link>
            </div>
            <div className="mt-4 overflow-hidden rounded-sm border border-line bg-surface/60 backdrop-blur-md">
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

        {/* 5 · CATEGORÍAS */}
        <div className="mt-14 lg:mt-20">
          <CategoriasPortada porCategoria={portada.porCategoria} />
        </div>

        {/* 6 · PRÓXIMOS RETOS (si hay alguno) */}
        {portada.proximos.length > 0 ? (
          <div className="mt-14 lg:mt-20">
            <ProximosRetos retos={portada.proximos} />
          </div>
        ) : null}

        {/* 7 · ÚLTIMOS GANADORES (si hay alguno) */}
        {portada.ganadores.length > 0 ? (
          <div className="mt-14 lg:mt-20">
            <UltimosGanadores ganadores={portada.ganadores} tema={tema} />
          </div>
        ) : null}

        {/* 8 · ESPACIO 1 — publicidad global o de su país, a lo ancho, después del contenido. */}
        {espacio1 ? (
          <div className="mt-14 lg:mt-20">
            <PiezaPortada pieza={espacio1} denuncia={denunciaPortada} />
          </div>
        ) : null}

        {/* 9 · CIERRE: una acción para quien ha llegado hasta aquí. */}
        {bloques.cierre ? (
          <div className="mt-14 lg:mt-20">
            <CierrePortada tipo={bloques.cierre} cta={cta} />
          </div>
        ) : null}

        {/* ¿TIENES UN NEGOCIO? — SOLO INVITADOS, la única invitación a negocios de la portada. */}
        {bloques.invitacionNegocio ? (
          <section
            aria-labelledby="para-negocios"
            className="mt-6 rounded-sm border border-line bg-surface/80 p-6 backdrop-blur-sm lg:flex lg:items-center lg:gap-8"
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
        ) : null}
      </div>
    </>
  );
}
