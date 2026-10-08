"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { BOOST_DAILY_LIMIT, BOOST_DURACION_MIN } from "@/config/constants";
import { duracionBoostHumana } from "@/lib/boost-duracion";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";

/**
 * DESTACAR MI PERFIL — el botón que gasta un Boost.
 *
 * ┌─ UN TOKEN POR INTENCIÓN, NO POR ENVÍO ────────────────────────────────────────────────────────┐
 * │ La clave de idempotencia se genera AQUÍ y viaja en el cuerpo. Un reintento de la misma         │
 * │ intención —doble clic, red que se cae a mitad, el usuario que pulsa otra vez porque no vio     │
 * │ nada— llega con el MISMO token y el servidor lo trata como no-op. Solo después de un éxito se  │
 * │ renueva: destacar otra vez es otra intención.                                                 │
 * │                                                                                               │
 * │ Generarlo en el servidor haría que cada reintento fuera una activación nueva, y entonces un    │
 * │ doble clic cuesta dos Boosts. Es el mismo patrón que el ajuste de puntos del panel.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE ES EL ÚNICO MAGENTA DE LA PANTALLA CUANDO HAY SALDO. El sistema reserva `--df-action` para
 * una acción por pantalla, y si tienes Boosts la acción es gastarlos, no comprar más: por eso los
 * botones de los paquetes pasan a secundario (lo decide la página, ver su docblock).
 *
 * REACTIVAR ESTANDO DESTACADO SIRVE PARA ALGO, y por eso no se prohíbe: vuelves a encabezar la fila
 * y alargas tu presencia. Lo que NO hace es darte dos tarjetas — la vitrina enseña una por persona
 * (ver `destacadosVigentes`). Antes de ese dedup esto SÍ era un problema: la misma persona ocupaba
 * dos de las cinco plazas y desplazaba a los demás, y el aviso de esta pantalla no lo cubría porque
 * no era un desperdicio del que paga, era acaparar el escaparate.
 */
export function ActivarBoost({
  saldo,
  usadasHoy,
  vigenteHastaMs,
}: {
  saldo: number;
  usadasHoy: number;
  /** `null` si no hay ninguna aparición mía vigente ahora mismo. */
  vigenteHastaMs: number | null;
}) {
  const router = useRouter();
  const [token, setToken] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const sinSaldo = saldo <= 0;
  const limiteGastado = usadasHoy >= BOOST_DAILY_LIMIT;
  const puedeActivar = !sinSaldo && !limiteGastado;

  const activar = useCallback(async () => {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await postJsonCsrf<{ estado?: string; mensaje?: string }>("/api/boost/activar", {
        token,
      });
      if (r.ok && r.data.estado === "activado") {
        setAviso({
          tipo: "ok",
          texto: `Listo: tu perfil está destacado ${duracionBoostHumana(BOOST_DURACION_MIN)}.`,
        });
        // Intención cumplida: la siguiente es otra. Y se repinta desde el servidor, que es quien
        // sabe el saldo y las apariciones de hoy de verdad.
        setToken(crypto.randomUUID());
        router.refresh();
        return;
      }
      if (r.ok && r.data.estado === "repetida") {
        // No es un error: ya estaba hecho. Se repinta para que se vea el estado real.
        setAviso({ tipo: "ok", texto: "Ya estaba hecho: no se ha gastado otro Boost." });
        setToken(crypto.randomUUID());
        router.refresh();
        return;
      }
      // `sin-saldo` y `limite` llegan con 200 y su copy: son respuestas, no fallos del sistema.
      setAviso({
        tipo: "error",
        texto: r.data.mensaje || mensajeDe(r.data) || "No se ha podido destacar tu perfil.",
      });
    } catch {
      setAviso({
        tipo: "error",
        // Lo importante: reintentar es seguro. El token es el mismo, así que no puede gastar dos.
        texto: "No hemos podido conectar. Reinténtalo: si ya se activó, no se repetirá.",
      });
    } finally {
      setEnviando(false);
    }
  }, [router, token]);

  // SIN SALDO NO HAY BOTÓN. Un botón deshabilitado permanente junto a un saldo de cero no añade
  // nada: lo que hay que hacer es comprar, y eso está justo debajo con su propio acento.
  if (sinSaldo) return null;

  return (
    <div className="mt-5">
      <Boton
        variante="principal"
        className="w-full shadow-[var(--df-cta-lift)] sm:w-auto"
        onClick={() => void activar()}
        disabled={!puedeActivar || enviando}
        aria-describedby={limiteGastado ? "boost-limite" : undefined}
      >
        {enviando ? "Destacando…" : "Destacar mi perfil ahora"}
      </Boton>

      {limiteGastado ? (
        <p id="boost-limite" className="mt-2.5 text-2xs text-text-dim">
          {/* La cifra sale de la constante, como en todas partes. */}
          Ya has destacado tu perfil {BOOST_DAILY_LIMIT} veces hoy. El contador se reinicia a
          medianoche UTC.
        </p>
      ) : vigenteHastaMs !== null ? (
        <p className="mt-2.5 text-2xs text-text-dim">
          Ya estás destacado ahora mismo. Si activas otro, se gasta un Boost, vuelves al primer
          puesto y alargas tu presencia. Sigues ocupando un solo sitio.
        </p>
      ) : (
        <p className="mt-2.5 text-2xs text-text-dim">
          Gasta 1 Boost y tu perfil sale en el espacio destacado{" "}
          {duracionBoostHumana(BOOST_DURACION_MIN)}.
        </p>
      )}

      {/* Una sola región, y solo cuando hay algo que decir: un `role` permanente por cada estado es
          lo que colisionó en el botón de compartir. */}
      {aviso ? (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          data-aviso-activar={aviso.tipo}
          className="mt-3 text-sm"
          style={aviso.tipo === "error" ? { color: "var(--df-alarm)" } : { color: "var(--df-ok)" }}
        >
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
