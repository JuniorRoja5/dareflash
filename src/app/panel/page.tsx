import Link from "next/link";
import { redirect } from "next/navigation";

import { protegerPanel, requireSeccion } from "./panel-guard";
import { ICONO_SECCION } from "./panel-iconos";
import { primeraSeccionPara, seccionesPara } from "./secciones";
import { TarjetaDinero, TarjetaMetrica } from "./tarjetas";

export const metadata = { title: "Panel · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * RESUMEN del panel (portada del dashboard). TODAS las cifras salen de una consulta de verdad: no
 * queda un solo "próximamente" aquí.
 *
 * ┌─ POR QUÉ CAMBIÓ ──────────────────────────────────────────────────────────────────────────────┐
 * │ Esta pantalla era casi solo navegación: cuatro recuentos de inventario (retos y usuarios) y   │
 * │ una tarjeta "Premios pagados · Fase 7" que siguió ahí DESPUÉS de construirse el monedero —o    │
 * │ sea, diciendo "aún no se mide" sobre algo que ya se medía—. Un placeholder que sobrevive a su │
 * │ fase miente igual que una cifra inventada, y encima parece honesto.                           │
 * │                                                                                               │
 * │ El orden de los bloques es la decisión: primero LO QUE PIDE UNA DECISIÓN (retiradas por       │
 * │ revisar, denuncias sin mirar, empates sin resolver), después el DINERO, y al final el         │
 * │ inventario. Una portada de operación no se abre con el total histórico de nada.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL RESUMEN ES DEL ADMINISTRADOR (son métricas de negocio, dinero incluido), pero `/panel` es la
 * puerta por la que entra todo el mundo: un moderador que escribe la dirección no puede toparse con
 * un 404 en su propia herramienta, así que se le lleva a su primera sección ANTES de que esto se
 * renderice. Después, el guard de la sección (ADMIN) se aplica igual que en cualquier otra página.
 * Por eso aquí no hay ni un `if (role === …)`: el rol lo decide la lista de secciones, no la vista.
 */
export default async function ResumenPage() {
  const quienMira = await protegerPanel();
  const destino = primeraSeccionPara(quienMira.role);
  if (destino !== null && destino !== "/panel") redirect(destino);
  await requireSeccion("/panel");

  const { prisma } = await import("@/server/db/client");
  const { metricasDinero, metricasPanel } = await import("@/server/services/panel-metricas");
  // LAS DOS, Y POR SEPARADO. El dinero es una llamada explícita desde una pantalla que YA ha pasado
  // el guard de ADMIN (arriba): un moderador no llega aquí, lo desvía `primeraSeccionPara`.
  const [m, dinero] = await Promise.all([metricasPanel(prisma), metricasDinero(prisma)]);

  // Los accesos que se pintan son los que ese rol alcanza (aunque aquí, hoy, siempre sea el admin).
  const secciones = seccionesPara(quienMira.role).filter((s) => s.href !== "/panel");

  return (
    <div className="df-rise space-y-10">
      <div>
        <h1
          className="text-2xl leading-none text-text"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 720, "wdth" 112',
          }}
        >
          Resumen
        </h1>
        <p className="mt-2 text-sm text-text-dim">
          Vista general de la administración de DareFlash.
        </p>
      </div>

      {/* ┌─ LO QUE PIDE UNA DECISIÓN, ARRIBA ──────────────────────────────────────────────────────┐
          │ Una portada de panel que empieza por "retos en total" cuenta el inventario; esto empieza │
          │ por la COLA: retiradas que esperan una firma, denuncias sin revisar, empates sin         │
          │ resolver. Son las tres cosas que, si nadie las mira hoy, alguien nota mañana.            │
          └─────────────────────────────────────────────────────────────────────────────────────────┘ */}
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Pendiente de ti
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <TarjetaMetrica
            valor={dinero.retiradasPendientes}
            etiqueta="Retiradas por revisar"
            nota="Esperan una decisión"
          />
          <TarjetaMetrica
            valor={m.denunciasAbiertas}
            etiqueta="Denunciado sin revisar"
            nota="Objetos distintos, no denuncias"
          />
          <TarjetaMetrica
            valor={m.retosEmpatePendiente}
            etiqueta="Empates por resolver"
            nota="Retos cerrados esperando ganador"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Dinero
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* LAS DOS NO SE SUMAN y la nota lo dice: lo que está en los monederos todavía no se ha
              pedido, y lo que está en curso ya salió de ellos. Presentarlas juntas sin decirlo
              invitaría a sumar dos cifras que no son partes de la misma. */}
          <TarjetaDinero
            cents={dinero.retiradasEnCursoCents}
            etiqueta="Por transferir"
            nota={`${dinero.retiradasEnCurso.toLocaleString("es-ES")} retiradas en curso`}
          />
          <TarjetaDinero
            cents={dinero.monederosCents}
            etiqueta="En los monederos"
            nota="Saldo sin pedir todavía"
          />
          <TarjetaDinero cents={dinero.pagadoCents} etiqueta="Pagado" nota="Histórico" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Plataforma
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {/* ABIERTOS ≠ PUBLICADOS, y la nota lo dice: `status` es lo que el admin quiso, y ahí
              dentro hay retos programados y retos cuyo plazo ya venció. Pintar solo "Publicados"
              hacía creer que ese número era lo que la gente ve. */}
          <TarjetaMetrica valor={m.retosAbiertos} etiqueta="Retos abiertos" nota="Ahora mismo" />
          <TarjetaMetrica
            valor={m.retosPublicados}
            etiqueta="Publicados"
            nota="Incluye programados"
          />
          <TarjetaMetrica valor={m.retosBorradores} etiqueta="Borradores" />
          <TarjetaMetrica valor={m.retosTotal} etiqueta="Retos en total" />
          <TarjetaMetrica valor={m.usuarios} etiqueta="Usuarios registrados" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Secciones
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {secciones.map((s) => {
            const Icono = ICONO_SECCION[s.href];
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="flex h-full gap-3 rounded-sm border border-line bg-surface/60 p-4 transition-colors duration-150 ease-mechanical hover:bg-surface"
                >
                  {Icono ? <Icono className="mt-0.5 shrink-0 text-text-dim" /> : null}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text">{s.label}</span>
                      {s.fase !== null ? (
                        <span className="rounded-full border border-line px-2 py-0.5 text-2xs font-semibold tracking-widest text-text-dim uppercase">
                          Fase {s.fase}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm text-text-dim">{s.descripcion}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
