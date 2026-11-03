import {
  Esqueleto,
  EsqueletoTarjeta,
  EsqueletoTexto,
  EsqueletoTitulo,
  PantallaCargando,
} from "@/components/ui/esqueleto";

/**
 * /boosts — cabecera, las tres métricas y las dos columnas (compra + historial).
 *
 * ANCHO `max-w-5xl`, no `max-w-7xl`: esta pantalla es más estrecha que el resto del shell y usar el
 * ancho general dejaría el esqueleto más ancho que el contenido, que es un salto hacia dentro en
 * cuanto cargan los datos.
 *
 * La rejilla de abajo (`lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]`) es la de la página: en
 * escritorio una columna fija a la izquierda y el resto a la derecha; en móvil, apiladas.
 */
export default function CargandoBoosts() {
  return (
    <PantallaCargando ancho="max-w-5xl">
      <div className="mb-6">
        <EsqueletoTitulo />
        <EsqueletoTexto className="mt-4 max-w-prose" lineas={2} />
      </div>

      {/* Las tres tarjetas de estado (saldo, usados hoy, vigencia). */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <EsqueletoTarjeta key={i} className="h-24" />
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10">
        <EsqueletoTarjeta className="h-64" />
        <div>
          <Esqueleto className="h-6 w-44" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <EsqueletoTarjeta key={i} className="h-14" />
            ))}
          </div>
        </div>
      </div>
    </PantallaCargando>
  );
}
