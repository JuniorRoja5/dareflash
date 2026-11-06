"use client";

import { Boton } from "./boton";
import { Tarjeta } from "./tarjeta";

/**
 * EL ESTADO DE ERROR DE UNA PANTALLA DEL PARTICIPANTE (participante-diseno-wallet-puntos), para su
 * `error.tsx`. Vive dentro del shell, así que la barra y la navegación siguen ahí y se puede ir a otra
 * parte. Sin él, un fallo subía hasta la pantalla de error genérica de Next.
 *
 * NO ENSEÑA `error.message`: en producción Next lo sustituye por un texto genérico, y aunque no lo
 * hiciera, un mensaje interno no le dice nada útil a quien lo lee. Dice qué ha pasado, que no es culpa
 * suya, y qué puede hacer: reintentar (`retry`, el nombre del prop en esta versión de Next). Es la
 * misma forma que el del portal de empresa.
 */
export function ErrorPantalla({ titulo, retry }: { titulo: string; retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-12">
      <Tarjeta className="max-w-prose p-5 lg:p-6" role="alert">
        <h1 className="text-base font-semibold text-text">{titulo}</h1>
        <p className="mt-2 text-sm text-text-dim">
          Ha fallado algo de nuestro lado, no de lo que has hecho. Vuelve a intentarlo en un
          momento; si sigue igual, escríbenos.
        </p>
        <Boton variante="secundario" className="mt-4" onClick={() => retry()}>
          Reintentar
        </Boton>
      </Tarjeta>
    </div>
  );
}
