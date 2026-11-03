import { Esqueleto } from "@/components/ui/esqueleto";

/**
 * /feed — LA PANTALLA DE MÁS TRÁFICO, y la que se quedaba fuera.
 *
 * ┌─ POR QUÉ NO LE VALE EL DE RESERVA ─────────────────────────────────────────────────────────────┐
 * │ `/feed` vive FUERA del grupo `(shell)` —eso es lo que lo deja ser inmersivo: sin barra, sin    │
 * │ pie— así que el `loading.tsx` del shell no le llega. Es `force-dynamic` como el resto, con lo  │
 * │ que sin este fichero era justo la pantalla más usada la que se quedaba congelada al navegar.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Tampoco usa `PantallaCargando`: ese envoltorio pone el contenedor centrado del shell
 * (`mx-auto max-w-7xl px-4 py-8`) y aquí el vídeo va A SANGRE, ocupando la pantalla entera. Lo que
 * sí se repite es el contrato de accesibilidad —un solo `role="status"` y los bloques
 * `aria-hidden`—, porque eso no depende de la maqueta.
 *
 * La forma sale de `feed-vertical.tsx`:
 *  - `lg:grid lg:h-[100svh] lg:grid-cols-[minmax(0,1fr)_380px]`: vídeo y panel de comentarios.
 *  - el vídeo es `h-[100svh]` a sangre en móvil y `aspect-[9/16]` centrado en escritorio.
 *  - el raíl de acciones va sobre el vídeo en móvil (`absolute right-2 bottom-24`) y al lado en
 *    escritorio; son círculos, así que los huecos también.
 *  - el texto del autor y el pie, abajo a la izquierda, sobre el degradado.
 */
export default function CargandoFeed() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="lg:grid lg:h-[100svh] lg:grid-cols-[minmax(0,1fr)_380px]"
    >
      <span className="sr-only">Cargando…</span>

      {/* COLUMNA DEL VÍDEO */}
      <div className="relative min-w-0">
        <div className="flex h-[100svh] items-center justify-center">
          {/* El vídeo: a sangre en móvil, tarjeta 9:16 centrada en escritorio. Es el bloque que
              ocupa toda la pantalla, así que es el que de verdad quita la sensación de congelado.
              Va en `surface` —un escalón por DEBAJO— para que el raíl y el pie, que se pintan
              encima en `raised`, se vean: con los dos en `raised` la pantalla salía lisa. */}
          <Esqueleto
            tono="surface"
            className="h-full w-full rounded-none lg:h-[calc(100svh-2rem)] lg:aspect-[9/16] lg:w-auto lg:rounded-sm lg:border lg:border-line"
          />
        </div>

        {/* EL DEGRADADO de abajo, el mismo que el feed de verdad: es lo que hace legible lo que se
            pinta sobre el vídeo, y sin él el pie flotaría sobre nada. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-56 bg-gradient-to-t from-black/75 to-transparent lg:hidden"
        />

        {/* RAÍL DE ACCIONES: sobre el vídeo en móvil. Círculos, como los botones de verdad, y en el
            tono de encima del vídeo: con un gris de la escala no se veían. */}
        <div className="absolute right-2 bottom-24 z-10 flex flex-col items-center gap-5 lg:hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Esqueleto key={i} tono="sobreVideo" className="size-11 rounded-full" />
          ))}
        </div>

        {/* AUTOR Y PIE: abajo a la izquierda, en el ancho que ocupa el texto de verdad (3/4). */}
        <div className="absolute bottom-0 left-0 z-10 w-3/4 p-4 pb-24 lg:hidden">
          <div className="flex items-center gap-2">
            <Esqueleto tono="sobreVideo" className="size-9 rounded-full" />
            <Esqueleto tono="sobreVideo" className="h-4 w-28" />
          </div>
          <Esqueleto tono="sobreVideo" className="mt-3 h-3.5 w-full" />
          <Esqueleto tono="sobreVideo" className="mt-2 h-3.5 w-2/3" />
        </div>
      </div>

      {/* PANEL DE COMENTARIOS: solo escritorio, 380 px fijos. En móvil es una hoja que se abre al
          pulsar, así que no hay nada que reservar. */}
      <aside className="hidden border-l border-line bg-surface lg:flex lg:h-[100svh] lg:flex-col">
        <div className="border-b border-line p-4">
          <Esqueleto className="h-5 w-32" />
        </div>
        <div className="space-y-4 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Esqueleto className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Esqueleto className="h-3.5 w-24" />
                <Esqueleto className="mt-2 h-3.5 w-full" />
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
