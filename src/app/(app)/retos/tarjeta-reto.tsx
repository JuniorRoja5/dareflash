import Link from "next/link";

import { Boton } from "@/components/ui/boton";
import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";

import { nombreCategoria, type RetoSemilla } from "./retos-datos";

/** Triangulo de "play" del placeholder de video (SVG inline; nada de emojis como iconos). */
function IconoPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-text-dim" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l9-5.5z" />
    </svg>
  );
}

/**
 * TARJETA DE RETO (feed) — composicion del boceto 2 con el tratamiento del brief encima.
 *
 * JERARQUIA: el MARCADOR (premio en lima + tiempo) manda. A tamaño "tarjeta" el marcador es
 * demasiado ancho (nowrap) para caber en una columna junto a la miniatura en moviles de 360-390 px,
 * asi que va en su PROPIA fila a lo ancho, ARRIBA: domina la tarjeta sin desbordar. Debajo, el
 * cuerpo horizontal del boceto: miniatura (placeholder de video) a la izquierda; titulo, categoria
 * y "Participar" a la derecha.
 *
 * A11Y: sin interactivos anidados. Miniatura y titulo enlazan a /retos/[id] (abrir el reto);
 * "Participar" es una accion aparte (secundaria, NUNCA magenta: el unico magenta de la pantalla es
 * el [+] de la nav). La miniatura es un enlace redundante oculto a lectores (el titulo es el enlace
 * accesible). `deadlineMs` puede ser null mientras el feed calcula los plazos en cliente.
 */
export function TarjetaReto({
  reto,
  deadlineMs,
}: {
  reto: RetoSemilla;
  deadlineMs: number | null;
}) {
  const href = `/retos/${reto.id}`;
  return (
    <article className="rounded-sm border border-line bg-surface p-3">
      {/* Jerarquia 1+2: premio > tiempo. A lo ancho y arriba: lo mas fuerte de la tarjeta. */}
      <Marcador cents={reto.premioCents} deadlineMs={deadlineMs} tamano="tarjeta" />

      <div className="mt-3 flex gap-4">
        {/* Miniatura = placeholder de video (superficie elevada + filete, sin sombra). Cuadrada:
            recorte sensato del video vertical 9:16 en una tarjeta horizontal (anotado). */}
        <Link
          href={href}
          aria-hidden
          tabIndex={-1}
          className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-sm border border-line bg-raised sm:h-28 sm:w-28"
        >
          <IconoPlay />
          <span className="line-clamp-1 px-2 text-center text-2xs text-text-dim">
            {reto.miniaturaPlaceholder}
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Jerarquia 4: titulo (enlace accesible al reto). */}
          <h2 className="min-w-0">
            <Link
              href={href}
              className="line-clamp-2 rounded-xs font-semibold leading-snug text-text hover:text-text-dim"
            >
              {reto.titulo}
            </Link>
          </h2>

          {/* Jerarquia 3 (accion) + 6 (categoria). Participar = secundario, aparte del enlace.
              flex-wrap: en pantallas muy estrechas Participar cae debajo sin desbordar. */}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2">
            <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
            <Boton variante="secundario" className="ml-auto px-4">
              Participar
            </Boton>
          </div>
        </div>
      </div>
    </article>
  );
}
