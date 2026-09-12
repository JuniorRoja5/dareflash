import Link from "next/link";
import { notFound } from "next/navigation";

import { CATEGORIES } from "@/config/constants";
import { centimosAImporte } from "@/lib/dinero";

import { RanuraProximamente, TarjetaMetrica, TarjetaProximamente } from "../../tarjetas";
import { TarjetaInteraccion } from "./interaccion-participacion";
import { ParticipacionesPanel, type ParticipacionPanelUI } from "./participaciones-panel";
import { ResolverEmpate } from "./resolver-empate";

export const metadata = { title: "Gestionar reto · Panel" };
export const dynamic = "force-dynamic";

const ETIQUETA_ESTADO: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  CLOSED: "Cerrado",
};

const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

/** Fecha en UTC (el proyecto trabaja en UTC de punta a punta; ver RESET_TIMEZONE). */
function fecha(d: Date): string {
  return d.toLocaleString("es-ES", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });
}

/**
 * GESTIÓN DE UN RETO en el panel: `/panel/retos/[id]`. Aquí el admin MODERA (retirar participaciones)
 * y ve las ESTADÍSTICAS del reto.
 *
 * SEGURIDAD heredada, no repetida: cuelga de `/panel`, cuyo layout llama a `protegerPanel()`
 * (requireRole ADMIN) y declara noindex. Aquí NO se comprueba el rol a mano (`role === "ADMIN"` sería
 * una comprobación por convención, la clase de guard que este proyecto no usa). El endpoint que ESCRIBE
 * y el que pagina se reprotegen ellos mismos, porque el layout no cubre endpoints.
 *
 * VISTA COMPLETA YA: lo que tiene backend se pinta con su dato REAL; lo que llega en fases posteriores
 * ocupa su sitio como ranura honesta ("próximamente · Fase N"), NUNCA con una cifra inventada ni con un
 * 0 que se leería como "no hay". Cuando llegue el dato se enchufa en la ranura y la pantalla no se
 * rediseña (por eso las ranuras ya tienen el tamaño que tendrán con datos).
 */
export default async function GestionRetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { prisma } = await import("@/server/db/client");
  const { retoAdminPorId } = await import("@/server/services/retos-admin");
  const { interaccionPorParticipacion, metricasReto } =
    await import("@/server/services/panel-metricas");
  const { listarParticipacionesAdmin } = await import("@/server/services/participaciones-lista");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  const reto = await retoAdminPorId(prisma, id);
  if (!reto) notFound();

  const [metricas, interaccion, pagina] = await Promise.all([
    metricasReto(prisma, reto.id),
    interaccionPorParticipacion(prisma, reto.id),
    listarParticipacionesAdmin(prisma, reto.id),
  ]);

  const participaciones: ParticipacionPanelUI[] = pagina.items.map((p) => ({
    submissionId: p.submissionId,
    videoId: p.videoId,
    title: p.title,
    poster: p.reproducible ? firmarReproduccion(p.bunnyVideoId, p.thumbnailFileName).poster : "",
    username: p.username,
    displayName: p.displayName,
    votos: p.votos,
    estado: p.estado,
    creadaEnMs: p.creadaEn.getTime(),
    reproducible: p.reproducible,
    bloqueadaPorModeracion: p.bloqueadaPorModeracion,
  }));

  const categoria = CATEGORIES.find((c) => c.key === reto.category);
  const publicado = reto.status !== "DRAFT";

  // EMPATE PENDIENTE: el grupo en disputa se calcula en el servidor (no se guarda: la entrada está
  // congelada tras el deadline, así que es función del dato). Solo se pinta el bloque si de verdad
  // hay algo que decidir; un reto marcado en empate cuyo empate ya no existe no ofrece una acción
  // vacía. Las participaciones se cruzan con la página ya cargada para reutilizar su póster firmado.
  const { empatePendienteDe } = await import("@/server/services/cierre-reto");
  const empate =
    reto.motivoCierre === "EMPATE_PENDIENTE" ? await empatePendienteDe(prisma, reto.id) : null;
  const empatadas = empate
    ? empate.empatados.flatMap((id) => {
        const p = participaciones.find((x) => x.submissionId === id);
        return p
          ? [
              {
                submissionId: p.submissionId,
                username: p.username,
                displayName: p.displayName,
                votos: p.votos,
                poster: p.poster,
              },
            ]
          : [];
      })
    : [];

  return (
    <div className="df-rise space-y-10">
      {/* CABECERA — datos reales del reto. */}
      <div>
        <Link
          href="/panel/retos"
          className="text-2xs font-semibold tracking-widest text-text-dim uppercase hover:text-text"
        >
          ← Retos
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl leading-none text-text" style={ESTILO_TITULO}>
            {reto.title}
          </h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-2xs font-semibold tracking-widest uppercase ${
              reto.status === "PUBLISHED" ? "bg-ok/15 text-ok" : "bg-raised text-text-dim"
            }`}
          >
            {ETIQUETA_ESTADO[reto.status] ?? reto.status}
          </span>
          {/* Solo hay página pública si NO es borrador: un DRAFT daría 404 y el enlace sería mentira.
              Se enlaza SOLO por publicCode (sin slug) a propósito: el detalle resuelve por code y hace
              308 al canónico, así que el enlace nunca se queda obsoleto si cambia el título. */}
          {publicado ? (
            <Link
              href={`/retos/${reto.publicCode}`}
              className="text-2xs font-semibold tracking-widest text-text-dim uppercase hover:text-text"
            >
              Ver página pública ↗
            </Link>
          ) : null}
        </div>

        <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <Dato etiqueta="Premio">
            <span className="font-semibold tabular-nums text-money">
              {centimosAImporte(reto.prizeAmountCents)} {reto.prizeCurrency}
            </span>
          </Dato>
          <Dato etiqueta="Categoría">
            {categoria ? `${categoria.emoji} ${categoria.es}` : reto.category}
          </Dato>
          <Dato etiqueta="Ganadores">
            {reto.winnersCount === 1 ? "1 ganador" : `${reto.winnersCount} ganadores`}
          </Dato>
          <Dato etiqueta="Código público">
            <span className="font-mono tracking-wider">{reto.publicCode}</span>
          </Dato>
          <Dato etiqueta="Apertura">
            <span className="tabular-nums">{fecha(reto.startsAt)}</span>
          </Dato>
          <Dato etiqueta="Cierre">
            <span className="tabular-nums">{fecha(reto.deadline)}</span>
          </Dato>
        </dl>

        {reto.rules ? (
          <section className="mt-6">
            <h2 className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
              Reglas
            </h2>
            <p className="mt-2 max-w-prose text-sm whitespace-pre-line text-text-dim">
              {reto.rules}
            </p>
          </section>
        ) : null}
      </div>

      {/* EMPATE — arriba del todo a propósito: es una TAREA pendiente, no una estadística. Mientras
          esté aquí, el reto no ha repartido ni premio ni puntos. */}
      {empate && empatadas.length > 0 ? (
        <ResolverEmpate
          challengeId={reto.id}
          empatadas={empatadas}
          plazas={empate.plazas}
          limpios={empate.limpios}
        />
      ) : null}

      {/* ESTADÍSTICAS — reales donde hay dato, ranuras honestas donde aún no. */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Estadísticas
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <TarjetaMetrica
            valor={metricas.participaciones}
            etiqueta="Participaciones"
            nota="Todas, en cualquier estado"
          />
          <TarjetaMetrica
            valor={metricas.participantes}
            etiqueta="Participantes"
            nota="Personas distintas"
          />
          <TarjetaMetrica
            valor={metricas.visibles}
            etiqueta="Visibles ahora"
            nota="Las que ve el público"
          />
          <TarjetaMetrica valor={metricas.votos} etiqueta="Votos" nota="En las visibles" />
          <TarjetaMetrica
            valor={metricas.enProceso}
            etiqueta="En proceso"
            nota="Vídeo aún sin publicar"
          />
          <TarjetaMetrica valor={metricas.retiradas} etiqueta="Retiradas" nota="Por moderación" />
          {/* GANADORES: sale de ChallengeResult, la misma fuente del palmarés y del ranking. Un 0 aquí
              no es "sin datos" — es que el reto sigue abierto, cerró sin mínimo, o espera al admin por
              un empate; cuál de los tres lo dice el bloque de arriba. */}
          <TarjetaMetrica
            valor={metricas.ganadores}
            etiqueta="Ganadores"
            nota="Declarados al cerrar"
          />
          {/* INTERACCIÓN (Fase 3), en el hueco que ocupaba su "próximamente": los votos de cada
              participación visible, del servicio. Es una lista, no una cifra: ocupa dos columnas. */}
          <TarjetaInteraccion filas={interaccion} visibles={metricas.visibles} />
          {/* Sin backend todavía: RAYA, nunca un número. Se sustituye en su fase, en este hueco. */}
          <TarjetaProximamente etiqueta="Reportes de spam" fase={5} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <RanuraProximamente
            titulo="Rendimiento en el tiempo"
            descripcion="Votos y participaciones día a día desde la apertura hasta el cierre."
            fase={4}
          />
          <RanuraProximamente
            titulo="Reportes y moderación"
            descripcion="Denuncias de la comunidad sobre las participaciones de este reto, para revisarlas aquí mismo."
            fase={5}
          />
        </div>
      </section>

      {/* MODERACIÓN — la lista con Retirar. */}
      <section>
        <h2 className="mb-1 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Participaciones
        </h2>
        <p className="mb-3 text-sm text-text-dim">
          Retirar una participación la quita del reto, del feed y del perfil de su autor. El vídeo
          se conserva.
        </p>
        <ParticipacionesPanel
          challengeId={reto.id}
          participaciones={participaciones}
          cursorInicial={pagina.nextCursor}
        />
      </section>
    </div>
  );
}

/** Par etiqueta/valor de la cabecera. */
function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs font-semibold tracking-widest text-text-dim uppercase">{etiqueta}</dt>
      <dd className="mt-1 text-sm text-text">{children}</dd>
    </div>
  );
}
