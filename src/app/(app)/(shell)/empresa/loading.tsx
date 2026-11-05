import {
  EsqueletoTarjeta,
  EsqueletoTexto,
  EsqueletoTitulo,
  PantallaCargando,
} from "@/components/ui/esqueleto";

/**
 * EL ESQUELETO DEL PORTAL DE EMPRESA (fase9-diseno).
 *
 * Vive DENTRO del layout del portal, así que la navegación (Resumen, Retos, Créditos, Cuenta) se
 * queda donde está y solo la columna de contenido se convierte en esqueleto. Sin él, cambiar de
 * sección caía al de reserva del shell, que está POR ENCIMA de este layout: la navegación desaparecía
 * y el ancho saltaba al del shell durante la espera.
 *
 * `sinContenedor`: el ancho y el aire los pone el layout. La forma es la que comparten las secciones:
 * título, una línea, tres tarjetas en fila (en columna en móvil) y un bloque grande.
 */
export default function CargandoPortal() {
  return (
    <PantallaCargando sinContenedor>
      <EsqueletoTitulo />
      <EsqueletoTexto className="mt-3 max-w-prose" lineas={1} />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <EsqueletoTarjeta key={i} className="h-28" />
        ))}
      </div>
      <EsqueletoTarjeta className="mt-6 h-64" />
    </PantallaCargando>
  );
}
