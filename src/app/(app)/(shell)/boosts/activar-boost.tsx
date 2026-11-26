"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { useFormato } from "@/components/formato-provider";
import { Boton } from "@/components/ui/boton";
import { BOOST_DAILY_LIMIT, BOOST_DURACION_MIN, BOOST_MIN_PORTADA } from "@/config/constants";
import { useTextos } from "@/components/textos-provider";
import { palabrasDuracion } from "@/textos/duracion";
import { fraseReinicioDiario } from "@/textos/reinicio-diario";
import { duracionBoostHumana } from "@/lib/boost-duracion";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { formatearNumero } from "@/lib/formato";

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
 * ESTE ES EL ÚNICO ACENTO DE LA PANTALLA CUANDO HAY SALDO. El sistema reserva `--df-action` para
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
  cupo,
}: {
  saldo: number;
  usadasHoy: number;
  /** `null` si no hay ninguna aparición mía vigente ahora mismo. */
  vigenteHastaMs: number | null;
  /**
   * El estado del cupo GLOBAL, leído en el servidor al pintar.
   *
   * Se enseña ANTES de pulsar porque enterarse de que está lleno DESPUÉS de haber pulsado es la
   * peor versión: la persona cree que ha gastado un Boost (no lo ha gastado) y no sabe cuándo
   * volver. El botón deshabilitado con el minutaje dice las dos cosas sin que nadie arriesgue nada.
   *
   * No autoriza: quien decide es `activarBoost` con su cerrojo. Esto solo pinta.
   */
  cupo: { lleno: boolean; minutosParaHueco: number | null };
}) {
  const router = useRouter();
  const { idioma, zona } = useFormato();
  const t = useTextos("boostCliente");
  const tdur = useTextos("duracion");
  const trein = useTextos("reinicioDiario");
  const duracion = duracionBoostHumana(BOOST_DURACION_MIN, palabrasDuracion(tdur, idioma));
  const [token, setToken] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const sinSaldo = saldo <= 0;
  const limiteGastado = usadasHoy >= BOOST_DAILY_LIMIT;
  const puedeActivar = !sinSaldo && !limiteGastado && !cupo.lleno;

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
          texto: t("listo", { duracion }),
        });
        // Intención cumplida: la siguiente es otra. Y se repinta desde el servidor, que es quien
        // sabe el saldo y las apariciones de hoy de verdad.
        setToken(crypto.randomUUID());
        router.refresh();
        return;
      }
      if (r.ok && r.data.estado === "repetida") {
        // No es un error: ya estaba hecho. Se repinta para que se vea el estado real.
        setAviso({ tipo: "ok", texto: t("repetida") });
        setToken(crypto.randomUUID());
        router.refresh();
        return;
      }
      // `sin-saldo` y `limite` llegan con 200 y su copy: son respuestas, no fallos del sistema.
      setAviso({
        tipo: "error",
        texto: r.data.mensaje || mensajeDe(r.data) || t("errorActivar"),
      });
    } catch {
      setAviso({
        tipo: "error",
        // Lo importante: reintentar es seguro. El token es el mismo, así que no puede gastar dos.
        texto: t("sinConexionActivar"),
      });
    } finally {
      setEnviando(false);
    }
  }, [router, token, t, duracion]);

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
        {enviando ? t("destacando") : t("destacar")}
      </Boton>

      {/* EL CUPO MANDA SOBRE LOS DEMÁS AVISOS: si no hay sitio, da igual cuántas te queden hoy. */}
      {cupo.lleno ? (
        <div id="boost-cupo" className="mt-2.5">
          {/* El titular dice QUÉ pasa y el texto QUÉ hacer. No sale el máximo ni por qué existe:
              para quien quiere destacarse ahora eso es información nuestra, no suya. */}
          <p className="text-xs font-semibold text-text">{t("agotadoTitulo")}</p>
          <p className="mt-1 text-2xs text-text-dim">
            {t("agotado", { minutos: String(cupo.minutosParaHueco ?? 1) })}
          </p>
        </div>
      ) : limiteGastado ? (
        <p id="boost-limite" className="mt-2.5 text-2xs text-text-dim">
          {/* La misma frase que devuelve la ruta: la cifra de la constante y la hora del reinicio en
              la de quien mira (Fase 11), con la zona que el layout comparte con el servidor. */}
          {t("limiteDiario", {
            veces: String(BOOST_DAILY_LIMIT),
            reinicio: fraseReinicioDiario(trein, new Date(), idioma, zona),
          })}
        </p>
      ) : vigenteHastaMs !== null ? (
        <p className="mt-2.5 text-2xs text-text-dim">{t("yaDestacado")}</p>
      ) : (
        // QUÉ RECIBES, con las dos cifras: la hora en la sección y los minutos en portada. Las dos
        // salen de `constants`, nunca escritas aquí — prometer en la pantalla una cifra distinta de
        // la que aplica el servicio es el fallo que esas constantes existen para no poder cometer.
        <p className="mt-2.5 text-2xs text-text-dim">
          {t("queRecibes", { duracion, minutos: formatearNumero(BOOST_MIN_PORTADA, idioma) })}
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
