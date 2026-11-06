import { EsqueletoTarjeta, EsqueletoTexto, PantallaCargando } from "@/components/ui/esqueleto";

/**
 * EL ESQUELETO DEL MONEDERO, con la forma de la pantalla (participante-diseno-wallet-puntos): en
 * escritorio, el saldo y los métodos a la izquierda y la información, las solicitudes y los
 * movimientos a la derecha; en móvil, apilados en ese orden. Sin él caía el del shell, con otra forma, y
 * la pantalla saltaba al llegar los datos.
 */
export default function CargandoMonedero() {
  return (
    <PantallaCargando ancho="max-w-6xl">
      <div className="xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:items-start xl:gap-10">
        <div className="space-y-8">
          <EsqueletoTarjeta className="h-56" />
          <EsqueletoTarjeta className="h-40" />
        </div>
        <div className="mt-10 space-y-6 xl:mt-0">
          <EsqueletoTarjeta className="h-24" />
          <EsqueletoTexto lineas={1} className="max-w-[12rem]" />
          <EsqueletoTarjeta className="h-40" />
          <EsqueletoTarjeta className="h-32" />
        </div>
      </div>
    </PantallaCargando>
  );
}
