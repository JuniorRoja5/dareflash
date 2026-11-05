"use client";

import { Boton } from "@/components/ui/boton";
import { Tarjeta } from "@/components/ui/tarjeta";

/**
 * EL ESTADO DE ERROR DEL PORTAL DE EMPRESA (fase9-diseno).
 *
 * Vive DENTRO del layout del portal (un `error.tsx` no envuelve el layout de su mismo segmento), así
 * que si una sección falla al cargar la navegación sigue ahí y se puede ir a otra. Sin él, el fallo
 * subía hasta la pantalla de error genérica y la empresa perdía el portal entero.
 *
 * NO ENSEÑA `error.message`: en producción Next lo sustituye por un texto genérico, y aunque no lo
 * hiciera, un mensaje interno no le dice nada útil a quien lo lee. Dice qué ha pasado, que no es culpa
 * suya, y qué puede hacer: reintentar (`retry`, el nombre del prop en esta versión de Next).
 */
export default function ErrorPortal({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <Tarjeta className="max-w-prose p-5 lg:p-6" role="alert">
      <h1 className="text-base font-semibold text-text">No hemos podido cargar esta sección</h1>
      <p className="mt-2 text-sm text-text-dim">
        Ha fallado algo de nuestro lado, no de lo que has hecho. Vuelve a intentarlo en un momento;
        si sigue igual, escríbenos.
      </p>
      <Boton variante="secundario" className="mt-4" onClick={() => retry()}>
        Reintentar
      </Boton>
    </Tarjeta>
  );
}
