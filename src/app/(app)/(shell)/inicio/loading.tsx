import {
  Esqueleto,
  EsqueletoTarjeta,
  EsqueletoTexto,
  PantallaCargando,
} from "@/components/ui/esqueleto";

/**
 * /inicio — el hero a dos columnas y las tres columnas de abajo.
 *
 * `grid gap-8 lg:grid-cols-2 lg:items-center` para el hero y `mt-12 lg:mt-16 lg:grid-cols-3` para
 * los bloques: las dos salen de la página. En móvil las dos rejillas son UNA columna, así que el
 * esqueleto se apila igual que el contenido.
 *
 * El hueco de la derecha del hero es la pieza visual grande (16/9): se reserva con su proporción
 * para que al montarse no empuje el titular hacia arriba.
 */
export default function CargandoInicio() {
  return (
    <PantallaCargando>
      <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          {/* El titular es de dos líneas y pesa: dos barras altas, no una. */}
          <Esqueleto className="h-10 w-full max-w-md" />
          <Esqueleto className="mt-3 h-10 w-3/4 max-w-sm" />
          <EsqueletoTexto className="mt-4 max-w-prose" lineas={2} />
          {/* Los dos botones de llamada. */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Esqueleto className="h-11 w-36 rounded-sm" />
            <Esqueleto className="h-11 w-28 rounded-sm" />
          </div>
        </div>
        <EsqueletoTarjeta className="aspect-video w-full" />
      </section>

      <div className="mt-12 grid gap-8 lg:mt-16 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i}>
            <Esqueleto className="h-6 w-40" />
            <EsqueletoTarjeta className="mt-4 h-48" />
          </div>
        ))}
      </div>
    </PantallaCargando>
  );
}
