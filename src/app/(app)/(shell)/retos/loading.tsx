import { Esqueleto, EsqueletoTarjeta, PantallaCargando } from "@/components/ui/esqueleto";

/**
 * /retos — título, la fila de filtros por categoría y la rejilla de DOS columnas.
 *
 * `grid-cols-2 gap-3 sm:gap-4` y `aspect-[4/3] lg:aspect-video` salen de `feed-retos.tsx` y
 * `tarjeta-reto.tsx`: son la rejilla y la proporción de verdad. Copiarlas es lo que hace que al
 * llegar los datos las tarjetas aparezcan DONDE estaba el hueco, sin empujar la página.
 *
 * Seis tarjetas, que es lo que cabe sin inventar: el número real no se sabe hasta que responde la
 * consulta, y pintar veinte huecos para que luego haya tres asusta más de lo que ayuda.
 */
export default function CargandoRetos() {
  return (
    <PantallaCargando>
      {/* El `h1` de /retos es `text-2xl leading-none mb-5`. */}
      <Esqueleto className="mb-5 h-7 w-48" />

      {/* Las píldoras de categoría: una fila que no se envuelve en móvil. */}
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <Esqueleto key={i} className="h-8 w-20 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <EsqueletoTarjeta key={i} className="aspect-[4/3] lg:aspect-video" />
        ))}
      </div>
    </PantallaCargando>
  );
}
