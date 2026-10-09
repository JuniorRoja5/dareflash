import { redirect } from "next/navigation";

import { PasosKeyset } from "@/components/ui/pasos-keyset";
import { TarjetaMetrica } from "@/components/ui/tarjeta-metrica";
import {
  BOOST_DAILY_LIMIT,
  MSG_BOOST_PAGO_NO_DISPONIBLE,
  MSG_BOOST_SIN_VERIFICAR,
} from "@/config/constants";
import { leerPila, type Paginacion } from "@/lib/paginacion-pila";

import { AvisoCompra, type EstadoVuelta } from "./aviso-compra";
import { ComoFunciona } from "./como-funciona";
import { HeroBoosts } from "./hero-boosts";
import { HistorialBoosts } from "./historial-boosts";
import { PaquetesBoost } from "./paquetes-boost";

export const metadata = { title: "Mis Boosts · DareFlash" };
// Lee la sesión y consulta por cursor: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/**
 * BOOSTS — cuántos tengo, cuánto cuestan y qué me llevo.
 *
 * MISMA ESTRUCTURA QUE /puntos Y /referidos, y a propósito: hero con el cuerpo de la familia, las
 * cifras exactas debajo, el contenido en dos columnas en escritorio y el historial propio con su
 * paginación por keyset. La tercera pantalla de "mi cuenta" no puede parecer de otra app — fue lo
 * que le pasó a /referidos cuando heredó las primitivas y no el cuerpo.
 *
 * ┌─ LAS DOS PUERTAS SE RESUELVEN EN EL SERVIDOR, Y NO SUSTITUYEN A LA RUTA ──────────────────────┐
 * │ Comprar exige CORREO VERIFICADO (la barrera antifraude de cualquier acción con efectos) y que │
 * │ los pagos estén configurados. Las dos se comprueban aquí para no pintar un botón que va a     │
 * │ fallar, y las dos las vuelve a comprobar `/api/boost/checkout`: esto es UX, la barrera de      │
 * │ verdad es la ruta. Deshabilitar un botón no protege nada — quien quiera salta la pantalla.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `env` SE LEE DENTRO DE LA FUNCIÓN, nunca en ámbito de módulo: en el build no hay variables, y
 * leerlo arriba tiraría el despliegue (ver CLAUDE.md). Y se lee solo para saber SI hay pagos; la
 * clave no sale de aquí ni en un `console.log`.
 *
 * EXIGE SESIÓN, resuelta en el SERVIDOR: "mis Boosts" no significa nada sin un "mí".
 */
export default async function BoostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  if (!sesion) redirect("/entrar?siguiente=%2Fboosts");

  const sp = await searchParams;
  const aqui: Paginacion = {
    cursor: typeof sp["cursor"] === "string" ? sp["cursor"].slice(0, 80) : null,
    pila: leerPila(sp["pila"]),
  };
  // Solo los dos valores que escribe la ruta de checkout. Cualquier otra cosa en `?compra=` no
  // pinta nada: es un parámetro de la URL, o sea entrada del usuario.
  const vuelta: EstadoVuelta | null =
    sp["compra"] === "ok" ? "ok" : sp["compra"] === "cancelada" ? "cancelada" : null;

  const { prisma } = await import("@/server/db/client");
  const { env } = await import("@/config/env");
  const { boostsComprados, miHistorialBoosts } = await import("@/server/services/boost-historial");
  const { miEstadoBoost } = await import("@/server/services/boost-activacion");

  const [yo, pagina, comprados, estado] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sesion.userId },
      select: { boostBalance: true },
    }),
    miHistorialBoosts(prisma, sesion.userId, { cursor: aqui.cursor }),
    boostsComprados(prisma, sesion.userId),
    miEstadoBoost(prisma, sesion.userId),
  ]);

  const saldo = yo?.boostBalance ?? 0;
  const pagosConfigurados = Boolean(env.STRIPE_SECRET_KEY);
  const correoVerificado = sesion.emailVerified !== null;
  const puedeComprar = pagosConfigurados && correoVerificado;
  // EL ORDEN IMPORTA: si los pagos no están puestos, da igual el correo — no hay nada que intentar.
  const motivoBloqueo = !pagosConfigurados
    ? MSG_BOOST_PAGO_NO_DISPONIBLE
    : !correoVerificado
      ? MSG_BOOST_SIN_VERIFICAR
      : null;

  /**
   * DÓNDE VA EL ÚNICO ACENTO DE LA PANTALLA.
   *
   * Ahora hay DOS acciones posibles —gastar un Boost y comprar más—, y el sistema reserva
   * `--df-action` para UNA por pantalla. La regla: si ya tienes Boosts, la acción es gastarlos (el
   * botón del hero); si no tienes, la acción es comprar. Así el acento señala siempre el siguiente
   * paso real de quien está mirando, en vez de quedarse clavado en el que la maqueta eligió.
   */
  const destacarEsLaAccion = saldo > 0;

  return (
    <div className="df-rise mx-auto w-full max-w-5xl px-4 py-8 lg:px-8 lg:py-12">
      {/* LA VUELTA DE STRIPE, ARRIBA DE TODO: es la respuesta a "¿se ha cobrado?", y esa pregunta va
          antes que cualquier otra cosa de la pantalla. */}
      {vuelta ? (
        <div className="mb-6">
          <AvisoCompra estado={vuelta} />
        </div>
      ) : null}

      <HeroBoosts
        saldo={saldo}
        usadasHoy={estado.usadasHoy}
        vigenteHastaMs={estado.vigenteHastaMs}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <TarjetaMetrica
          etiqueta="Boosts disponibles"
          valor={saldo.toLocaleString("es-ES")}
          pie={saldo === 0 ? "Compra uno para destacar" : "No caducan"}
        />
        {/* LA TARJETA DEL LÍMITE ENSEÑA LO QUE QUEDA, no el tope: el tope ya lo dice el hero, y lo
            que alguien necesita saber aquí es si puede destacar otra vez hoy. */}
        <TarjetaMetrica
          etiqueta="Te quedan hoy"
          valor={Math.max(BOOST_DAILY_LIMIT - estado.usadasHoy, 0).toLocaleString("es-ES")}
          pie={`De ${BOOST_DAILY_LIMIT} apariciones al día`}
        />
        {/* COMPRADOS EN TOTAL, no "movimientos": el número sale de un `SUM` sobre las filas de
            compra (ver `boostsComprados`), así que es una cifra de verdad y no el largo de la
            página que se está viendo — que habría cambiado al pulsar "Siguiente". */}
        <TarjetaMetrica
          etiqueta="Comprados en total"
          valor={comprados > 0 ? comprados.toLocaleString("es-ES") : "—"}
          pie={comprados > 0 ? "Desde que tienes la cuenta" : "Todavía ninguno"}
        />
      </div>

      <div className="mt-10">
        <PaquetesBoost
          puedeComprar={puedeComprar}
          motivoBloqueo={motivoBloqueo}
          cedeElAcento={destacarEsLaAccion}
        />
      </div>

      {/* DOS COLUMNAS EN ESCRITORIO, el mismo reparto que /puntos: el panel corto (tres pasos) al
          lado de la lista larga. En móvil se apilan en este orden — primero se entiende qué compras
          y luego se mira lo que ya compraste. */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10">
        <ComoFunciona />

        <section aria-labelledby="historial">
          <h2
            id="historial"
            className="text-sm font-semibold tracking-widest text-text-dim uppercase"
          >
            Tus movimientos de Boosts
          </h2>
          <HistorialBoosts items={pagina.items} />
          {/* FUERA del `if` de la lista: si una página posterior se queda vacía, "Anterior" tiene
              que seguir ahí o el usuario se queda encerrado. */}
          <PasosKeyset base="/boosts" aqui={aqui} proximoCursor={pagina.proximoCursor} />
        </section>
      </div>
    </div>
  );
}
