import Link from "next/link";

import { nombreMostrado } from "@/lib/identidad";

import { Avatar } from "./avatar";
import { InsigniaNivel } from "./insignia-nivel";
import { MarcaBoost } from "./marca-boost";

/**
 * TARJETA DE UN PERFIL DESTACADO (Boost) — la misma cara en los dos sitios donde se enseña.
 *
 * ┌─ UNA SOLA FUENTE, DOS TAMAÑOS ────────────────────────────────────────────────────────────────┐
 * │ Esto se pinta en la FILA de la portada (cinco, compactas) y en la VITRINA de /destacados       │
 * │ (todas, con aire). Son dos escalas del mismo objeto, no dos componentes: con dos copias, la    │
 * │ segunda se queda atrás en cuanto se toque una —exactamente lo que le pasó al hero de           │
 * │ /referidos frente al de /puntos—. Lo que cambia es el tamaño; lo que NO cambia es qué se       │
 * │ enseña de alguien: su cara, su nombre y su nivel.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LLEVA AL PERFIL, y por eso tiene el glow del acento al pasar por encima: el sistema reserva ese
 * realce para las tarjetas en las que se puede pulsar. Aquí está ganado.
 *
 * LA POSICIÓN ES EL SITIO EN LA FILA, no un dato de la aparición: nadie compra "el puesto 1". Se
 * pasa desde fuera porque solo quien pinta la lista sabe en qué orden la está pintando, y es
 * OPCIONAL: en la vitrina larga numerar hasta el cuarenta no dice nada.
 *
 * EL NIVEL SE DERIVA de los puntos con `InsigniaNivel`, como en todo el producto. Si viniera como
 * dato, dos pantallas podrían decir niveles distintos del mismo saldo.
 */
export function TarjetaDestacado({
  username,
  displayName,
  imagen,
  puntos,
  posicion,
  tamano = "fila",
}: {
  username: string;
  displayName: string | null;
  imagen: string | null;
  puntos: number;
  /** 1-based. Si no se pasa, no se numera. */
  posicion?: number;
  tamano?: "fila" | "vitrina";
}) {
  const vitrina = tamano === "vitrina";
  return (
    <Link
      href={`/u/${username}`}
      data-destacado={username}
      className={`relative flex flex-col items-center gap-2 rounded-sm border border-line bg-surface/60 text-center shadow-[var(--df-shadow-sm)] backdrop-blur-md transition-[transform,box-shadow] duration-[var(--df-dur-fast)] ease-mechanical hover:-translate-y-0.5 hover:shadow-[var(--df-glow-hover)] ${
        vitrina ? "p-6" : "p-4"
      }`}
    >
      {posicion !== undefined ? (
        <span
          className="absolute top-2.5 left-3 text-sm font-bold tabular-nums text-text-dim"
          style={{ fontFamily: "var(--font-display)" }}
          aria-hidden
        >
          {posicion}
        </span>
      ) : null}
      {/* LA MISMA MARCA que lleva el feed: una sola fuente para la palabra y el tono (ver
          `MarcaBoost`). Antes era un `<span>` suelto con su propio estilo, o sea una copia esperando
          a divergir de las otras tres superficies. */}
      <MarcaBoost className="absolute top-3 right-3" />

      <Avatar
        nombre={username}
        imagen={imagen}
        tamano={vitrina ? "xl" : "lg"}
        perezosa
        puntos={puntos}
      />
      <p
        className={`mt-1 max-w-full truncate font-medium text-text ${vitrina ? "text-base" : "text-sm"}`}
      >
        {nombreMostrado(displayName, username)}
      </p>
      <InsigniaNivel puntos={puntos} />
    </Link>
  );
}
