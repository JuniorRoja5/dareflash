import { nivelPorPuntos, TOTAL_TIERS } from "@/lib/niveles";

/**
 * INSIGNIA DE NIVEL — pildora NEUTRA (como `PildoraCategoria`: el nivel es metadato, no compite con
 * la cifra) con un MEDIDOR geometrico de 5 barras (cuantas encendidas = tier) + el nombre del nivel.
 * SIN emoji (el brief los prohibe como iconos; todo es geometria). El nivel sale de `nivelPorPuntos`
 * (dominio, testeado). El medidor es aria-hidden: el nombre ya comunica el nivel a lectores.
 */
export function InsigniaNivel({ puntos }: { puntos: number }) {
  const nivel = nivelPorPuntos(puntos);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line px-2.5 py-1 text-2xs font-medium tracking-wide text-text-dim uppercase">
      <span className="flex items-end gap-px" aria-hidden>
        {Array.from({ length: TOTAL_TIERS }).map((_, i) => (
          <span
            key={i}
            className={`w-[3px] shrink-0 ${i < nivel.tier ? "bg-text" : "bg-line"}`}
            style={{ height: `${4 + i * 2}px` }}
          />
        ))}
      </span>
      {nivel.nombre}
    </span>
  );
}
