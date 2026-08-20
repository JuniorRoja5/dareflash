import { notFound, permanentRedirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";

import { nombreCategoria } from "../retos-datos";

export const dynamic = "force-dynamic";

/**
 * DETALLE de un reto público: `/retos/{publicCode}-{slug}`. Resuelve por `publicCode` (clave
 * autoritativa): inexistente/DRAFT -> notFound() (404); si el slug de la URL no es el canónico ->
 * permanentRedirect (308, el equivalente moderno del 301) a la URL canónica. Muestra datos REALES;
 * sin participación/voto/comentarios (tramo siguiente): estado "Aún no hay participaciones" + CTA
 * "Participar" deshabilitado honesto.
 */
export default async function RetoDetallePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const { prisma } = await import("@/server/db/client");
  const { resolverRetoDetalle } = await import("@/server/services/retos-publico");

  const r = await resolverRetoDetalle(prisma, codigo);
  if (r.tipo === "noEncontrado") notFound();
  if (r.tipo === "redirect") permanentRedirect(r.a);
  const reto = r.reto;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
      <article className="df-rise overflow-hidden rounded-sm border border-line bg-surface/60 shadow-[var(--df-shadow-md)] backdrop-blur-md">
        {/* Portada real (servida por Caddy) si hay; banner apaisado. */}
        {reto.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- estático servido por Caddy en /portadas/*
          <img
            src={reto.coverImage}
            alt=""
            className="aspect-video w-full border-b border-line object-cover"
          />
        ) : null}
        <div className="p-6 lg:p-8">
          <PildoraCategoria>{nombreCategoria(reto.categoria)}</PildoraCategoria>
          <h1
            className="mt-3 text-2xl leading-tight text-text"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wght" 720, "wdth" 112',
            }}
          >
            {reto.titulo}
          </h1>

          {/* Marcador: premio (en lima) + cuenta atrás al cierre. */}
          <div className="mt-5">
            <Marcador cents={reto.premioCents} deadlineMs={reto.deadlineMs} tamano="tarjeta" />
          </div>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
                Ganadores
              </dt>
              <dd className="mt-1 text-sm text-text">
                {reto.winnersCount === 1 ? "1 ganador" : `${reto.winnersCount} ganadores`}
              </dd>
            </div>
          </dl>

          {reto.descripcion ? (
            <section className="mt-6">
              <h2 className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
                Descripción
              </h2>
              <p className="mt-2 text-sm whitespace-pre-line text-text-dim">{reto.descripcion}</p>
            </section>
          ) : null}

          {reto.reglas ? (
            <section className="mt-6">
              <h2 className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
                Reglas
              </h2>
              <p className="mt-2 text-sm whitespace-pre-line text-text-dim">{reto.reglas}</p>
            </section>
          ) : null}

          {/* Participar: acción del tramo siguiente. CTA deshabilitado HONESTO (no engaña). */}
          <div className="mt-8">
            <Boton variante="principal" disabled className="w-full py-3.5">
              Participar — próximamente
            </Boton>
          </div>
        </div>
      </article>

      {/* Participaciones: aún no hay (la subida de vídeo de usuarios llega en el tramo siguiente). */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Participaciones
        </h2>
        <p className="rounded-sm border border-line bg-surface/40 p-8 text-center text-sm text-text-dim">
          Aún no hay participaciones en este reto.
        </p>
      </section>
    </div>
  );
}
