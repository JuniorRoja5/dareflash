"use client";

import { useCallback, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { ImportePremio } from "@/components/ui/importe-premio";
import { DEFAULT_CURRENCY, MSG_BOOST_PAGO_NO_DISPONIBLE } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { paquetesEnVenta } from "@/lib/boost-precio";

/**
 * LOS TRES PAQUETES, Y EL BOTÓN QUE ABRE EL PAGO.
 *
 * ┌─ EL NAVEGADOR SOLO MANDA LA CLAVE DEL PAQUETE ─────────────────────────────────────────────────┐
 * │ Ni el importe ni el número de boosts viajan en el cuerpo: `{ packageId }` y nada más. El       │
 * │ precio lo resuelve el servidor contra el catálogo (ver la ruta de checkout), así que "el pack  │
 * │ de 10 por un dólar" no es algo que esta pantalla tenga que impedir — es algo que no puede      │
 * │ expresar. Lo que se pinta aquí sale del MISMO catálogo, derivado en `lib/boost-precio`.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * UN SOLO MAGENTA, el del paquete de mejor precio por Boost. El sistema reserva `--df-action` para
 * UNA acción por pantalla; tres botones de relleno serían tres acciones principales, o sea ninguna.
 * Los otros dos van en secundario, que es exactamente lo que son: la misma compra, peor precio.
 * Cuál es el recomendado NO se escribe aquí, lo dice `mejorPrecio` — mover un precio en constants
 * mueve la etiqueta, el porcentaje y el magenta de golpe.
 *
 * Y CON SALDO, EL MAGENTA NO ES DE AQUÍ. Si el usuario ya tiene Boosts, la acción de la pantalla es
 * GASTARLOS (el botón del hero), no comprar más: entonces `cedeElAcento` pone los tres paquetes en
 * secundario. Sigue habiendo exactamente un magenta, lo que cambia es cuál — y es la diferencia
 * entre guiar y adornar.
 *
 * UNA SOLA REGIÓN DE ESTADO para los tres botones, y no una por tarjeta. Solo puede haber una compra
 * en vuelo (los otros botones se deshabilitan), así que tres regiones serían tres sitios donde
 * buscar el mismo mensaje — y, en los tests, tres `role="alert"` colisionando.
 *
 * SALIR A STRIPE ES `window.location.assign`, no el router: el destino es OTRO ORIGEN. `router.push`
 * no puede salir del sitio, y `navegarDuro` existe para los cambios de identidad (entrar/salir), que
 * no es esto. Es la única navegación de la pantalla que se va de la app.
 */
export function PaquetesBoost({
  puedeComprar,
  motivoBloqueo,
  cedeElAcento = false,
}: {
  /** Falso cuando el pago no se puede intentar: sin Stripe configurado o sin correo verificado. */
  puedeComprar: boolean;
  /** Por qué no se puede, en copy de producto. El servidor lo decide; aquí solo se enseña. */
  motivoBloqueo?: string | null;
  /** Cierto cuando el magenta de la pantalla lo lleva otro botón (destacar). Ver la cabecera. */
  cedeElAcento?: boolean;
}) {
  const paquetes = paquetesEnVenta();
  /** El recomendado solo se pinta en magenta si esta sección tiene el acento de la pantalla. */
  const conAcento = (mejorPrecio: boolean) => mejorPrecio && !cedeElAcento;
  const [comprando, setComprando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const comprar = useCallback(async (packageId: string) => {
    setError(null);
    setComprando(packageId);
    try {
      const r = await postJsonCsrf<{ url?: string }>("/api/boost/checkout", { packageId });
      if (r.ok && typeof r.data.url === "string") {
        // A Stripe. No se limpia `comprando`: la pestaña se va, y dejar el botón "despierto" medio
        // segundo invita a un segundo clic que abriría una segunda sesión de pago.
        window.location.assign(r.data.url);
        return;
      }
      // El copy humano lo manda el servidor (`{ error: { code, message } }`); el fallback es para un
      // fallo sin cuerpo (una red que se cae a medias). Cero códigos y cero jerga de Stripe aquí.
      setError(mensajeDe(r.data) || MSG_BOOST_PAGO_NO_DISPONIBLE);
      setComprando(null);
    } catch {
      // Excepción de red, o `postJsonCsrf` lanzando SIN_SESION: el mismo mensaje, que es lo que el
      // usuario puede hacer algo con. El detalle no le sirve de nada.
      setError("No hemos podido conectar. Inténtalo otra vez.");
      setComprando(null);
    }
  }, []);

  return (
    <section aria-labelledby="paquetes">
      <h2 id="paquetes" className="text-sm font-semibold tracking-widest text-text-dim uppercase">
        Comprar Boosts
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {paquetes.map((p) => (
          <div
            key={p.clave}
            data-paquete={p.clave}
            data-mejor={p.mejorPrecio ? "si" : undefined}
            className="relative flex flex-col overflow-hidden rounded-sm border border-line bg-surface/60 p-5 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
            style={
              p.mejorPrecio
                ? {
                    // El recomendado lleva aro del acento en vez de filete neutro: se distingue sin
                    // crecer ni cambiar de sitio, así que la fila sigue siendo una fila.
                    borderColor: "color-mix(in srgb, var(--df-action) 45%, transparent)",
                    boxShadow:
                      "0 0 0 1px color-mix(in srgb, var(--df-action) 25%, transparent), var(--df-shadow-sm)",
                  }
                : undefined
            }
          >
            {p.mejorPrecio ? (
              <p
                className="self-start rounded-full px-2.5 py-1 text-2xs font-semibold tracking-widest uppercase"
                style={{
                  color: "var(--df-action)",
                  backgroundColor: "color-mix(in srgb, var(--df-action) 12%, transparent)",
                }}
              >
                Mejor precio
              </p>
            ) : (
              // Hueco de la MISMA altura que la etiqueta: sin él, la tarjeta recomendada empuja su
              // contenido hacia abajo y las tres dejan de leerse como una fila.
              <p className="self-start px-2.5 py-1 text-2xs" aria-hidden>
                &nbsp;
              </p>
            )}

            <p
              className="mt-3 text-3xl leading-none text-text"
              style={{
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"wght" 800, "wdth" 110',
              }}
            >
              {p.boosts}
              <span className="ml-1.5 text-base font-semibold">
                {p.boosts === 1 ? "Boost" : "Boosts"}
              </span>
            </p>

            {/* EL IMPORTE, con el tratamiento del dinero del producto: el mismo componente que el
                premio de un reto, y por tanto `--df-money`. Es el único color de dinero de la
                pantalla. */}
            <p className="mt-4">
              <ImportePremio cents={p.precioCents} currency={DEFAULT_CURRENCY} tamano="tarjeta" />
            </p>

            <p className="mt-2 text-2xs text-text-dim">
              <ImportePremio
                cents={p.porBoostCents}
                currency={DEFAULT_CURRENCY}
                tamano="lista"
                className="align-baseline"
              />{" "}
              por Boost
              {p.ahorroPct > 0 ? (
                <span className="ml-1.5 text-text">· ahorras un {p.ahorroPct}%</span>
              ) : null}
            </p>

            {/* EL ARO Y LA ETIQUETA se quedan aunque el acento se ceda: dicen un HECHO del paquete
                (es el que sale más barato por Boost), no una acción. Lo que cede es el BOTÓN, que es
                lo que la regla de `--df-action` gobierna: una acción principal por pantalla. */}
            <Boton
              variante={conAcento(p.mejorPrecio) ? "principal" : "secundario"}
              className={`mt-5 w-full py-3 ${conAcento(p.mejorPrecio) ? "shadow-[var(--df-cta-lift)]" : ""}`}
              onClick={() => void comprar(p.clave)}
              disabled={!puedeComprar || comprando !== null}
              aria-describedby={puedeComprar ? undefined : "boost-bloqueo"}
            >
              {comprando === p.clave ? "Abriendo el pago…" : "Comprar"}
            </Boton>
          </div>
        ))}
      </div>

      {/* EL MOTIVO DEL BLOQUEO, dicho una vez y debajo de los tres. Los botones deshabilitados ya no
          prometen nada; esto es lo que falta para poder usarlos. */}
      {!puedeComprar && motivoBloqueo ? (
        <p
          id="boost-bloqueo"
          className="mt-4 rounded-sm border border-line bg-raised p-4 text-sm text-text-dim"
        >
          {motivoBloqueo}
        </p>
      ) : null}

      {/* `role="alert"` y no `status`: un pago que no se ha podido abrir hay que oírlo, no leerlo si
          pasas por ahí. Y solo existe cuando hay algo que decir (ver la cabecera). */}
      {error ? (
        <p
          role="alert"
          data-error-compra
          className="mt-4 rounded-sm border p-4 text-sm"
          style={{
            color: "var(--df-alarm)",
            borderColor: "color-mix(in srgb, var(--df-alarm) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--df-alarm) 8%, transparent)",
          }}
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
