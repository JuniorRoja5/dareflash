"use client";

import { useCallback, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { ImportePremio } from "@/components/ui/importe-premio";
import {
  DEFAULT_CURRENCY,
  MSG_CREDITOS_CONDICIONES,
  MSG_CREDITOS_PAGO_NO_DISPONIBLE,
} from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { useFormato } from "@/components/formato-provider";
import { formatearNumero } from "@/lib/formato";

export interface PaqueteEnVenta {
  clave: string;
  creditos: number;
  precioCents: number;
  /** Lo que sale cada crédito, ya escrito en el servidor («0,30 $»). */
  porCredito: string;
  /** El de mejor precio por crédito: el único con el acento. Lo decide el servidor, del catálogo. */
  mejorPrecio: boolean;
}

/**
 * COMPRAR CRÉDITOS DE PUBLICIDAD (Fase 9 · P11): los tres paquetes del catálogo y el botón que abre el
 * pago en Stripe.
 *
 *  - EL NAVEGADOR SOLO MANDA LA CLAVE DEL PAQUETE (`{ packageId }`): el importe y los créditos los pone
 *    el servidor desde `PAQUETES_CREDITOS`, la misma fuente que pinta estas tarjetas.
 *  - SIN CLAVES (o sin verificar), LA COMPRA NO SE OFRECE: los paquetes se ven —es lo que costará—,
 *    pero no hay botón que prometa lo que no puede hacer, y se dice por qué.
 *  - UN SOLO ACENTO, el del mejor precio por crédito; los otros dos en secundario.
 *  - SALIR A STRIPE ES `window.location.assign`: otro origen, el router no puede.
 */
export function ComprarCreditos({
  paquetes,
  puedeComprar,
  motivoBloqueo,
}: {
  paquetes: PaqueteEnVenta[];
  puedeComprar: boolean;
  motivoBloqueo: string | null;
}) {
  const { idioma } = useFormato();
  const [comprando, setComprando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const comprar = useCallback(async (packageId: string) => {
    setError(null);
    setComprando(packageId);
    try {
      const r = await postJsonCsrf<{ url?: string }>("/api/empresa/creditos/checkout", {
        packageId,
      });
      if (r.ok && typeof r.data.url === "string") {
        // Sin limpiar `comprando`: la pestaña se va, y un segundo clic abriría un segundo pago.
        window.location.assign(r.data.url);
        return;
      }
      setError(mensajeDe(r.data) || MSG_CREDITOS_PAGO_NO_DISPONIBLE);
      setComprando(null);
    } catch {
      setError("No hemos podido conectar. Inténtalo otra vez.");
      setComprando(null);
    }
  }, []);

  return (
    <section aria-labelledby="comprar" className="space-y-4">
      <h2 id="comprar" className="text-base font-semibold text-text">
        Comprar créditos
      </h2>

      <div className="grid gap-3 sm:grid-cols-3">
        {paquetes.map((p) => (
          <div
            key={p.clave}
            data-paquete-creditos={p.clave}
            className="flex flex-col rounded-sm border border-line bg-surface p-5"
            style={
              p.mejorPrecio
                ? // El aro del token entero: el portal no escribe un «%» en su código, ni de una mezcla
                  // de color (`empresa-sin-comisiones` lo lee todo, y es mejor así que con excepciones).
                  { borderColor: "var(--df-action)" }
                : undefined
            }
          >
            {/* La etiqueta solo en el recomendado. Los otros llevan un hueco de su altura SOLO en fila
                (sm+), para que las tres se lean como una fila; apiladas en móvil, sobraría. */}
            {p.mejorPrecio ? (
              <p className="mb-2 text-2xs font-semibold tracking-widest text-text-dim uppercase">
                Mejor precio
              </p>
            ) : (
              <p aria-hidden className="mb-2 hidden text-2xs sm:block">
                &nbsp;
              </p>
            )}
            <p className="text-2xl font-semibold text-text tabular-nums">
              {formatearNumero(p.creditos, idioma)}
              <span className="ml-1.5 text-sm font-medium text-text-dim">créditos</span>
            </p>
            <p className="mt-3">
              <ImportePremio
                idioma={idioma}
                cents={p.precioCents}
                currency={DEFAULT_CURRENCY}
                tamano="tarjeta"
              />
            </p>
            <p className="mt-1 text-2xs text-text-dim">{p.porCredito} por crédito</p>
            {puedeComprar ? (
              <Boton
                type="button"
                variante={p.mejorPrecio ? "principal" : "secundario"}
                className="mt-4 w-full"
                disabled={comprando !== null}
                onClick={() => void comprar(p.clave)}
              >
                {comprando === p.clave ? "Abriendo el pago…" : "Comprar"}
              </Boton>
            ) : null}
          </div>
        ))}
      </div>

      {motivoBloqueo ? (
        <p
          role="status"
          className="max-w-prose rounded-sm border border-line p-3 text-sm text-text"
        >
          {motivoBloqueo}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      ) : null}
      <p className="max-w-prose text-2xs text-text-dim">{MSG_CREDITOS_CONDICIONES}</p>
    </section>
  );
}
