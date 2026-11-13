import { apartarCuentaEmpresa } from "@/server/auth/solo-participante";
import { redirect } from "next/navigation";

import { EmblemaDeNivel } from "@/components/ui/emblema-nivel";
import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { TarjetaMetrica } from "@/components/ui/tarjeta-metrica";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";
import { progresoNivel } from "@/lib/progreso-nivel";

import { EscaleraNiveles } from "./escalera-niveles";
import { HeroNivel } from "./hero-nivel";
import { HistorialMisPuntos } from "./historial-mis-puntos";
import { TablaPuntos } from "./tabla-puntos";
import { formatearNumero } from "@/lib/formato";

export const metadata = { title: "Mis puntos · DareFlash" };
// Lee la sesión y consulta por cursor: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/**
 * PUNTOS Y NIVEL — cuántos tengo, qué nivel soy, cómo gano más.
 *
 * POR QUÉ SE SEPARÓ DE /referidos: aquella pantalla contestaba dos preguntas distintas —"cómo invito"
 * y "cómo funcionan los puntos"— y la segunda es de todo el producto, no de los referidos. Invitar es
 * UNA de las nueve formas de ganar puntos; tener la tabla entera colgando de ella hacía que el resto
 * del sistema pareciera un apéndice del enlace de invitación.
 *
 * PUNTOS, NUNCA DINERO. Aquí no hay importes, ni catálogo de canje, ni `--df-money`: los puntos suben
 * de nivel y dan fama, y no se convierten en nada (Términos, punto 8). El monedero es otra cosa y
 * llega en su fase.
 *
 * EXIGE SESIÓN, resuelta en el SERVIDOR: "mis puntos" no significa nada sin un "mí".
 */
export default async function PuntosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await apartarCuentaEmpresa();
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  if (!sesion) redirect("/entrar?siguiente=%2Fpuntos");
  // El idioma y la zona de quien mira (Fase 11): cifras y fechas salen de `lib/formato`.
  const { idiomaDeLaPeticion, zonaDeLaPeticion } = await import("@/server/formato-peticion");
  const [idioma, zona] = await Promise.all([idiomaDeLaPeticion(), zonaDeLaPeticion()]);

  const sp = await searchParams;
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 300) : null,
    pila: leerPila(sp["pila"]),
  };

  const { prisma } = await import("@/server/db/client");
  // SOLO el servicio propio: `historialPuntos` a pelo traería la nota interna del ajuste y el handle
  // del admin que lo firmó. Ver `server/services/puntos.ts`.
  const { miHistorialPuntos } = await import("@/server/services/puntos");

  // La racha se CALCULA al mirarla (ver `lib/racha`): no se lee un número guardado, se deriva de
  // las dos fechas y de hoy. Va en el mismo `Promise.all`, así que no añade una ida y vuelta.
  const { rachaDe } = await import("@/server/services/racha");

  const [yo, pagina, racha] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sesion.userId },
      select: { pointsBalance: true },
    }),
    miHistorialPuntos(prisma, sesion.userId, { cursor: aqui.cursor }),
    rachaDe(prisma, sesion.userId),
  ]);

  const puntos = yo?.pointsBalance ?? 0;
  const { nivel, siguiente, faltan, porcentaje, esMaximo } = progresoNivel(puntos);

  return (
    <div className="df-rise mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-12">
      <HeroNivel puntos={puntos} racha={racha} idioma={idioma} />

      {/* LAS CIFRAS EXACTAS, debajo del hero. El hero dice quién eres; estas dicen cuánto. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <TarjetaMetrica etiqueta="Puntos totales" valor={formatearNumero(puntos, idioma)} />
        <TarjetaMetrica
          etiqueta="Nivel actual"
          valor={nivel.nombre}
          destacado={nivel.tokenColor}
          // El emblema geométrico del nivel, el mismo que lleva el avatar. Rookie no tiene y aquí
          // tampoco se le inventa uno: la tarjeta se queda sin icono, que es lo que significa.
          icono={nivel.emblema ? <EmblemaDeNivel nivel={nivel} clase="h-8 w-8" /> : undefined}
          pie={
            nivel.minimo === 0
              ? "El punto de partida"
              : `Desde ${formatearNumero(nivel.minimo, idioma)} puntos`
          }
        />
        <TarjetaMetrica
          etiqueta="Progreso al siguiente"
          valor={esMaximo ? "—" : `${porcentaje}%`}
          destacado={esMaximo ? null : nivel.tokenColor}
          pie={
            esMaximo
              ? "Ya estás en el nivel más alto"
              : `Faltan ${formatearNumero(faltan, idioma)} para ${siguiente?.nombre}`
          }
        />
      </div>

      {/* DOS COLUMNAS EN ESCRITORIO para aprovechar el ancho: la escalera (cinco filas) al lado de
          la tabla (nueve). Pesos 5:7 y no 320 px fijos: con la columna fija, a 1440 la tabla se
          llevaba casi todo el ancho y la escalera quedaba como una tira. Las dos arriba
          (`items-start`), cada una con su alto. En móvil se apilan en este mismo orden. */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-10">
        <EscaleraNiveles puntos={puntos} idioma={idioma} />
        <TablaPuntos />
      </div>

      <section aria-labelledby="historial" className="mt-10">
        <h2
          id="historial"
          className="text-sm font-semibold tracking-widest text-text-dim uppercase"
        >
          Tu historial de puntos
        </h2>
        <HistorialMisPuntos items={pagina.items} idioma={idioma} zona={zona} />
        <PasosKeyset base="/puntos" aqui={aqui} proximoCursor={pagina.nextCursor} />
      </section>
    </div>
  );
}
