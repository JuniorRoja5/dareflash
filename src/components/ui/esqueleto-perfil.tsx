import { Esqueleto, EsqueletoTarjeta, EsqueletoTexto, PantallaCargando } from "./esqueleto";

/**
 * EL ESQUELETO DE UN PERFIL, en un solo sitio, porque hay DOS rutas con la misma forma: `/perfil`
 * (el mío) y `/u/[username]` (el de otra persona). Las dos las pinta `PerfilVista`, así que una
 * copia en cada `loading.tsx` se separaría en cuanto alguien tocara la maqueta de uno — y el que se
 * quedara atrás daría un salto al cargar, que es precisamente lo que estos ficheros evitan.
 *
 * `lg:grid-cols-[320px_1fr] lg:gap-8` y la rejilla `grid-cols-3 sm:grid-cols-4 lg:grid-cols-5` son
 * las de `perfil-vista.tsx` y `rejilla-videos.tsx`. En móvil la identidad va arriba y los vídeos
 * debajo; en escritorio, columna fija a la izquierda.
 *
 * Las miniaturas son 9:16 porque los vídeos son verticales. Nueve: tres filas de móvil.
 */
export function EsqueletoPerfil() {
  return (
    <PantallaCargando>
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8">
        {/* IDENTIDAD */}
        <aside>
          <div className="rounded-sm border border-line bg-surface/60 p-6">
            <div className="flex flex-col items-center text-center">
              {/* El avatar es redondo: el hueco también, o el salto se ve en el borde. */}
              <Esqueleto className="size-24 rounded-full" />
              <Esqueleto className="mt-4 h-6 w-40" />
              <Esqueleto className="mt-2 h-4 w-24" />
              <EsqueletoTexto className="mt-4 w-full" lineas={2} />
            </div>
            {/* Las tres cifras (puntos, retos ganados, vídeos), sin cifra. */}
            <div className="mt-6 grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Esqueleto key={i} className="h-12" />
              ))}
            </div>
          </div>
        </aside>

        {/* REJILLA DE VÍDEOS */}
        <div className="mt-6 lg:mt-0">
          <div className="grid grid-cols-3 items-start gap-x-1.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 9 }, (_, i) => (
              <EsqueletoTarjeta key={i} className="aspect-[9/16]" />
            ))}
          </div>
        </div>
      </div>
    </PantallaCargando>
  );
}
