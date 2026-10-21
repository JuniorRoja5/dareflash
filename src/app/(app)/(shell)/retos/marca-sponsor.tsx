import { ETIQUETA_PATROCINADO } from "@/config/constants";
import type { SponsorVista } from "@/server/services/retos-publico";

/**
 * "PATROCINADO POR [marca]" — la firma de un reto patrocinado.
 *
 * ┌─ POR QUÉ NO ES OTRA CHAPA DORADA ───────────────────────────────────────────────────────────┐
 * │ La chapa del reto exclusivo dice "esto es de Mythic" y va en ORO porque el oro es la marca   │
 * │ del VIP. Un patrocinio no es premium: es TRANSPARENCIA —quién paga este reto—, y un reto     │
 * │ puede ser las dos cosas a la vez. Con dos chapas doradas en la misma esquina, ninguna de las │
 * │ dos se lee y además el oro pasaría a significar dos cosas, que es justo lo que la paleta de  │
 * │ este producto no permite.                                                                    │
 * │                                                                                               │
 * │ Así que esta va en NEUTRO (superficie + filete de línea), con el logo si lo hay. Reusa la     │
 * │ FORMA de la chapa del exclusivo —misma píldora, mismo tamaño, misma esquina— y cambia el     │
 * │ color, que es lo que distingue "quién paga" de "quién puede participar".                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE VE PARA TODO EL MUNDO, siempre: un patrocinio que solo ve parte del público no es
 * transparencia. No hay candado por rol aquí; el candado es que solo se monta si hay sponsor.
 */
export function MarcaSponsor({
  sponsor,
  compacta = false,
  clase = "",
}: {
  sponsor: SponsorVista;
  /** En la rejilla estrecha se pinta solo la marca; "Patrocinado por" aparece a partir de `sm`. */
  compacta?: boolean;
  clase?: string;
}) {
  return (
    <span
      data-reto-sponsor
      className={`pointer-events-none inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-void/70 px-2 py-1 text-2xs font-medium text-text ${clase}`}
    >
      {sponsor.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- estático servido por Caddy en /portadas/*
        <img
          src={sponsor.logo}
          alt=""
          /* `object-contain` y no `cover`: un logo recortado es el logo de otra marca. Y sin `alt`
             porque el nombre va escrito al lado — leerlo dos veces no añade nada. */
          className="h-4 w-4 shrink-0 object-contain"
        />
      ) : null}
      <span className={compacta ? "hidden sm:inline" : undefined}>{ETIQUETA_PATROCINADO}</span>
      <span className="truncate font-semibold">{sponsor.nombre}</span>
    </span>
  );
}
