import {
  EsqueletoTarjeta,
  EsqueletoTexto,
  EsqueletoTitulo,
  PantallaCargando,
} from "@/components/ui/esqueleto";

/**
 * /destacados — cabecera y la vitrina de perfiles con Boost.
 *
 * La rejilla (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` con `mt-10`) sale de la
 * página. Las tarjetas son casi cuadradas porque la de verdad es una columna centrada —avatar,
 * nombre, puntos— no una miniatura apaisada.
 *
 * DIEZ huecos: dos filas llenas en móvil. Es la pantalla donde más se nota la espera, porque
 * `destacadosVigentes` era la consulta que recorría la tabla entera (ver el índice de `expiresAt`).
 */
export default function CargandoDestacados() {
  return (
    <PantallaCargando>
      <EsqueletoTitulo className="h-9 w-64" />
      <EsqueletoTexto className="mt-4 max-w-[52ch]" lineas={2} />

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <EsqueletoTarjeta key={i} className="aspect-[4/5]" />
        ))}
      </div>
    </PantallaCargando>
  );
}
