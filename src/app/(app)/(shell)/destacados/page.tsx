import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { TarjetaDestacado } from "@/components/ui/tarjeta-destacado";
import { BOOST_DESTACADOS_TOPE, BOOST_DURACION_MIN } from "@/config/constants";
import { duracionBoostHumana } from "@/lib/boost-duracion";

import { FondoRescoldo } from "./fondo-rescoldo";

export const metadata = { title: "Perfiles Boost · DareFlash" };
// Depende del RELOJ: quién está destacado cambia minuto a minuto. Nunca cacheada.
export const dynamic = "force-dynamic";

/**
 * PERFILES BOOST — la vitrina completa de quien está destacado ahora mismo.
 *
 * ES PÚBLICA, sin sesión: es un escaparate, no "lo mío". Quien paga por aparecer quiere que lo vea
 * cualquiera, incluido quien todavía no tiene cuenta — y el enlace de la portada, que también es
 * público, lleva aquí.
 *
 * ┌─ REUSA LA CONSULTA DE LA PORTADA, NO UNA PROPIA ──────────────────────────────────────────────┐
 * │ `destacadosVigentes` con un límite alto. Escribir aquí un SELECT parecido habría duplicado    │
 * │ tres decisiones que cuestan caro y que no se ven desde fuera:                                 │
 * │   - el DEDUP por persona (una plaza cada uno, con su aparición más reciente);                  │
 * │   - los filtros de vigencia y de cuenta suspendida DENTRO del subquery — si salen, una fila    │
 * │     expirada gana el `rn = 1` y tira al usuario entero de la lista, aunque siga destacado;     │
 * │   - el orden por `startsAt` descendente, que es lo que hace que pagar ahora se note ahora.     │
 * │ Una copia habría salido verde el primer día y habría divergido en el primer arreglo.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIN PAGINACIÓN, Y CON TOPE. Hoy no puede haber tantos a la vez —una aparición dura lo que dura y
 * cada persona ocupa una plaza—, así que caben de sobra en una pantalla. El día que `BOOST_DESTACADOS_TOPE`
 * se quede corto, lo que toca es keyset (como el resto del producto), no subir el número.
 *
 * SIN NUMERAR. En la fila de cinco de la portada la posición dice algo; aquí, numerar hasta el
 * cuarenta sugeriría un ranking que no existe: el orden es cronológico, no de mérito.
 *
 * VACÍO HONESTO: si no hay nadie destacado se dice y se invita. Cero relleno.
 */
export default async function DestacadosPage() {
  const { prisma } = await import("@/server/db/client");
  const { destacadosVigentes } = await import("@/server/services/boost-destacados");

  const perfiles = await destacadosVigentes(prisma, { limite: BOOST_DESTACADOS_TOPE });

  return (
    <>
      {/* HERMANO del contenedor, NUNCA dentro: la capa es `fixed` y el contenedor anima `transform`
          (`df-rise`), lo que le crearía bloque contenedor y la dejaría recortada ahí dentro. Misma
          regla que el fondo de vídeo de la portada (ver `FondoRescoldo`). */}
      <FondoRescoldo />
      <div className="df-rise mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-[clamp(1.75rem,5vw,2.75rem)] leading-[1.05] text-text"
              style={{
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"wght" 800, "wdth" 110',
              }}
            >
              Perfiles Boost
            </h1>
            <p className="mt-3 max-w-prose text-sm text-text-dim">
              Quien ha destacado su perfil aparece aquí {duracionBoostHumana(BOOST_DURACION_MIN)}.
              El último en activar sale primero.
            </p>
          </div>

          {/* EL ÚNICO ACENTO DE LA PANTALLA: la acción es destacarse. Mirar la lista no es una
            acción, así que las tarjetas no compiten con esto. */}
          <Boton href="/boosts" variante="principal" className="shadow-[var(--df-cta-lift)]">
            Destacar mi perfil
          </Boton>
        </header>

        {perfiles.length === 0 ? (
          <div className="mt-10 rounded-sm border border-line bg-surface/40 p-10 text-center">
            <p className="text-base font-medium text-text">
              Ahora mismo no hay ningún perfil destacado.
            </p>
            <p className="mx-auto mt-2 max-w-prose text-sm text-text-dim">
              Cuando alguien gaste un Boost, aparecerá aquí y en la portada. Puedes ser el primero.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {perfiles.map((perfil) => (
              <TarjetaDestacado
                key={perfil.activacionId}
                username={perfil.username}
                displayName={perfil.displayName}
                imagen={perfil.imagen}
                puntos={perfil.puntos}
                tamano="vitrina"
              />
            ))}
          </div>
        )}

        <p className="mt-10 text-2xs text-text-dim">
          Esto no es el ranking: aquí se aparece por haber gastado un Boost, no por ganar retos.{" "}
          <Link href="/ranking" className="underline underline-offset-2 hover:text-text">
            Ver el ranking del mes
          </Link>
          .
        </p>
      </div>
    </>
  );
}
