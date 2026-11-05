import {
  Esqueleto,
  EsqueletoTarjeta,
  EsqueletoTexto,
  EsqueletoTitulo,
  PantallaCargando,
} from "@/components/ui/esqueleto";

/**
 * EL ESQUELETO DE UNA COLA DEL PANEL (fase9-diseno): `/panel/empresas` y `/panel/propuestas` tienen
 * la misma forma —título, descripción, el filtro y la tabla— y por eso comparten esqueleto.
 *
 * `sinContenedor`: el ancho y el aire los pone el `<main>` del layout del panel. Sin cifras ni nombres:
 * ninguna fila inventada, solo bloques (lo vigila `tests/render/pantallas-de-carga`).
 */
export function EsqueletoColaPanel() {
  return (
    <PantallaCargando sinContenedor>
      <EsqueletoTitulo />
      <EsqueletoTexto className="mt-3 max-w-prose" lineas={2} />
      <div className="mt-8 flex items-end gap-2">
        <Esqueleto className="h-11 w-36" />
        <Esqueleto className="h-11 w-20" />
      </div>
      <EsqueletoTarjeta className="mt-8 h-72" />
    </PantallaCargando>
  );
}
