import { redirect } from "next/navigation";

import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { TarjetaMetrica } from "@/components/ui/tarjeta-metrica";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";
import { progresoNivel } from "@/lib/progreso-nivel";

import { EscaleraNiveles } from "./escalera-niveles";
import { HeroNivel } from "./hero-nivel";
import { HistorialMisPuntos } from "./historial-mis-puntos";
import { TablaPuntos } from "./tabla-puntos";

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
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  if (!sesion) redirect("/entrar?siguiente=%2Fpuntos");

  const sp = await searchParams;
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 300) : null,
    pila: leerPila(sp["pila"]),
  };

  const { prisma } = await import("@/server/db/client");
  // SOLO el servicio propio: `historialPuntos` a pelo traería la nota interna del ajuste y el handle
  // del admin que lo firmó. Ver `server/services/puntos.ts`.
  const { miHistorialPuntos } = await import("@/server/services/puntos");

  const [yo, pagina] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sesion.userId },
      select: { pointsBalance: true },
    }),
    miHistorialPuntos(prisma, sesion.userId, { cursor: aqui.cursor }),
  ]);

  const puntos = yo?.pointsBalance ?? 0;
  const { nivel, siguiente, faltan, porcentaje, esMaximo } = progresoNivel(puntos);

  return (
    <div className="df-rise mx-auto w-full max-w-5xl px-4 py-8 lg:px-8 lg:py-12">
      <HeroNivel puntos={puntos} />

      {/* LAS CIFRAS EXACTAS, debajo del hero. El hero dice quién eres; estas dicen cuánto. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <TarjetaMetrica etiqueta="Puntos totales" valor={puntos.toLocaleString("es-ES")} />
        <TarjetaMetrica
          etiqueta="Nivel actual"
          valor={nivel.nombre}
          destacado={nivel.tokenColor}
          pie={
            nivel.minimo === 0
              ? "El punto de partida"
              : `Desde ${nivel.minimo.toLocaleString("es-ES")} puntos`
          }
        />
        <TarjetaMetrica
          etiqueta="Progreso al siguiente"
          valor={esMaximo ? "—" : `${porcentaje}%`}
          pie={
            esMaximo
              ? "Ya estás en el nivel más alto"
              : `Faltan ${faltan.toLocaleString("es-ES")} para ${siguiente?.nombre}`
          }
        />
      </div>

      {/* DOS COLUMNAS EN ESCRITORIO para aprovechar el ancho: la escalera (corta, cinco filas) al
          lado de la tabla (nueve). En móvil se apilan en este mismo orden. */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10">
        <EscaleraNiveles puntos={puntos} />
        <TablaPuntos />
      </div>

      <section aria-labelledby="historial" className="mt-10">
        <h2
          id="historial"
          className="text-sm font-semibold tracking-widest text-text-dim uppercase"
        >
          Tu historial de puntos
        </h2>
        <HistorialMisPuntos items={pagina.items} />
        <PasosKeyset base="/puntos" aqui={aqui} proximoCursor={pagina.nextCursor} />
      </section>
    </div>
  );
}
