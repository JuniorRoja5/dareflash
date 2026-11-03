import { Esqueleto, EsqueletoTarjeta, PantallaCargando } from "@/components/ui/esqueleto";

/**
 * /retos/[codigo] — la ficha del reto y la rejilla de participaciones.
 *
 * `py-5` en MÓVIL (no `py-8`): es lo que usa la página, porque ahí la ficha y las participaciones se
 * aprietan a propósito para que las segundas no queden fuera de vista.
 *
 * `grid gap-5 lg:grid-cols-3 lg:items-start lg:gap-8`: en escritorio la ficha ocupa una columna y
 * las participaciones dos. La cabecera de la ficha reserva `aspect-[16/7] lg:aspect-video`, que es
 * la proporción exacta de su imagen — la pieza más alta de la pantalla y la que más salto daría.
 */
export default function CargandoReto() {
  return (
    <PantallaCargando aireMovil="py-5">
      {/* La migaja de vuelta a /retos. */}
      <Esqueleto className="h-4 w-24" />

      <div className="mt-4 grid gap-5 lg:grid-cols-3 lg:items-start lg:gap-8">
        {/* FICHA: imagen arriba y los datos debajo, dentro de la misma tarjeta. */}
        <div className="overflow-hidden rounded-sm border border-line bg-surface/60">
          <Esqueleto className="aspect-[16/7] w-full rounded-none lg:aspect-video" />
          <div className="space-y-3 p-4">
            <Esqueleto className="h-7 w-4/5" />
            <Esqueleto className="h-4 w-2/5" />
            {/* El premio y la cuenta atrás: dos bloques, SIN cifra dentro. */}
            <div className="flex gap-3 pt-2">
              <Esqueleto className="h-10 w-28 rounded-sm" />
              <Esqueleto className="h-10 w-28 rounded-sm" />
            </div>
            <Esqueleto className="mt-2 h-11 w-full rounded-sm" />
          </div>
        </div>

        {/* PARTICIPACIONES: vídeos en vertical, que es como se graban. */}
        <div className="lg:col-span-2">
          <Esqueleto className="h-6 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <EsqueletoTarjeta key={i} className="aspect-[9/16]" />
            ))}
          </div>
        </div>
      </div>
    </PantallaCargando>
  );
}
