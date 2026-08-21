import { notFound, permanentRedirect } from "next/navigation";

import { Marcador } from "@/components/ui/marcador";
import { PildoraCategoria } from "@/components/ui/pildora";

import { nombreCategoria } from "../retos-datos";
import { BotonParticipar } from "./participar";
import { ParticipacionesReto, type ParticipacionUI } from "./participaciones-reto";

export const dynamic = "force-dynamic";

const COPY_MI_ESTADO: Record<string, { texto: string; tono: "neutro" | "alarma" }> = {
  procesando: {
    texto: "Tu vídeo se está procesando; aparecerá cuando esté listo.",
    tono: "neutro",
  },
  fallida: {
    texto: "Tu vídeo no se pudo procesar. Pulsa Reemplazar para volver a intentarlo.",
    tono: "alarma",
  },
};

/**
 * DETALLE de un reto público: `/retos/{publicCode}-{slug}`. Resuelve por `publicCode` (clave
 * autoritativa): inexistente/DRAFT -> notFound() (404); si el slug de la URL no es el canónico ->
 * permanentRedirect (308) a la URL canónica. Muestra datos REALES + las participaciones VISIBLES
 * (Submission+Video PUBLISHED), más votadas primero, con el reproductor firmado. El dueño ve su propia
 * participación marcada y su estado (procesando/fallida) + Reemplazar.
 */
export default async function RetoDetallePage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const { prisma } = await import("@/server/db/client");
  const { resolverRetoDetalle } = await import("@/server/services/retos-publico");
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const { listarParticipacionesVisibles, miParticipacion } =
    await import("@/server/services/participaciones-lista");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  const r = await resolverRetoDetalle(prisma, codigo);
  if (r.tipo === "noEncontrado") notFound();
  if (r.tipo === "redirect") permanentRedirect(r.a);
  const reto = r.reto;

  const usuario = await getCurrentUser();
  // Reto abierto = PUBLISHED con cierre futuro. Solo entonces se admite participar.
  const ahora = new Date();
  const activo = reto.status === "PUBLISHED" && reto.deadlineMs > ahora.getTime();

  const [participaciones, mi] = await Promise.all([
    listarParticipacionesVisibles(prisma, reto.id),
    usuario ? miParticipacion(prisma, reto.id, usuario.userId) : Promise.resolve(null),
  ]);

  // Firma el póster de cada participación (el player firma su propia URL vía el endpoint) y marca la mía.
  const participacionesUI: ParticipacionUI[] = participaciones.map((p) => ({
    submissionId: p.submissionId,
    videoId: p.videoId,
    title: p.title,
    poster: firmarReproduccion(p.bunnyVideoId).poster,
    username: p.username,
    displayName: p.displayName,
    votos: p.votos,
    esMio: mi?.submissionId === p.submissionId,
  }));
  const miEstado = mi ? COPY_MI_ESTADO[mi.estado] : undefined;

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

          {/* Participar: invitado -> login; logueado -> modal de subida con el challengeId. Si ya
              participó (publicada), el CTA pasa a "Reemplazar". */}
          <div className="mt-8">
            <BotonParticipar
              challengeId={reto.id}
              publicCode={reto.publicCode}
              slug={reto.slug}
              autenticado={usuario !== null}
              activo={activo}
              yaParticipa={mi?.estado === "publicada"}
            />
            {miEstado ? (
              <p
                role="status"
                className={`mt-2 text-sm ${miEstado.tono === "alarma" ? "text-alarm" : "text-text-dim"}`}
              >
                {miEstado.texto}
              </p>
            ) : null}
          </div>
        </div>
      </article>

      {/* Participaciones REALES (Submission+Video PUBLISHED), más votadas primero. */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Participaciones
        </h2>
        <ParticipacionesReto participaciones={participacionesUI} />
      </section>
    </div>
  );
}
