import Link from "next/link";
import { redirect } from "next/navigation";

import { protegerPanel, requireSeccion } from "./panel-guard";
import { ICONO_SECCION } from "./panel-iconos";
import { primeraSeccionPara, seccionesPara } from "./secciones";
import { TarjetaMetrica, TarjetaProximamente } from "./tarjetas";

export const metadata = { title: "Panel · DareFlash" };
export const dynamic = "force-dynamic";

/**
 * RESUMEN del panel (portada del dashboard). Métricas REALES de la BD (conteos de retos y usuarios) +
 * huecos honestos ("próximamente") donde aún no hay backend (dinero llega en Fase 7). CERO cifras
 * falsas. Debajo, accesos a cada sección con su icono.
 *
 * EL RESUMEN ES DEL ADMINISTRADOR (son métricas de negocio), pero `/panel` es la puerta por la que
 * entra todo el mundo: un moderador que escribe la dirección no puede toparse con un 404 en su propia
 * herramienta, así que se le lleva a su primera sección. Después de eso, el guard de la sección
 * (ADMIN) se aplica igual que en cualquier otra página.
 */
export default async function ResumenPage() {
  const quienMira = await protegerPanel();
  const destino = primeraSeccionPara(quienMira.role);
  if (destino !== null && destino !== "/panel") redirect(destino);
  await requireSeccion("/panel");

  const { prisma } = await import("@/server/db/client");
  const { metricasPanel } = await import("@/server/services/panel-metricas");
  const m = await metricasPanel(prisma);

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

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Métricas
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <TarjetaMetrica valor={m.retosTotal} etiqueta="Retos en total" />
          <TarjetaMetrica valor={m.retosPublicados} etiqueta="Publicados" />
          <TarjetaMetrica valor={m.retosBorradores} etiqueta="Borradores" />
          <TarjetaMetrica valor={m.usuarios} etiqueta="Usuarios registrados" />
          {/* Dinero: sin backend de monedero hasta Fase 7 -> honesto, no un 0 engañoso. */}
          <TarjetaProximamente etiqueta="Premios pagados" />
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
