import {
  EsqueletoTarjeta,
  EsqueletoTexto,
  EsqueletoTitulo,
  PantallaCargando,
} from "@/components/ui/esqueleto";

/**
 * EL ESQUELETO DE /puntos, con la forma de la pantalla (participante-diseno-wallet-puntos): el hero del
 * nivel, las tres cifras, la escalera junto a la tabla (5:7 en escritorio) y el historial. Sin él caía
 * el del shell, con otra forma, y la pantalla saltaba al llegar los datos.
 */
export default function CargandoPuntos() {
  return (
    <PantallaCargando ancho="max-w-6xl">
      <EsqueletoTarjeta className="h-48" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <EsqueletoTarjeta key={i} className="h-24" />
        ))}
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <EsqueletoTarjeta className="h-72" />
        <EsqueletoTarjeta className="h-96" />
      </div>
      <div className="mt-10">
        <EsqueletoTitulo />
        <EsqueletoTexto className="mt-3" lineas={1} />
        <EsqueletoTarjeta className="mt-4 h-64" />
      </div>
    </PantallaCargando>
  );
}
