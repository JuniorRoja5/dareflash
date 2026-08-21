import Link from "next/link";

import { ICONO_SECCION } from "./panel-iconos";
import { SECCIONES_PANEL } from "./secciones";

export const metadata = { title: "Panel · DareFlash" };
export const dynamic = "force-dynamic";

const ESTILO_CIFRA = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 780, "wdth" 118',
} as const;

/** Tarjeta de métrica REAL: número grande (tabular) + etiqueta. `acento` la resalta (dinero -> lima). */
function TarjetaMetrica({
  valor,
  etiqueta,
  acento = false,
}: {
  valor: number;
  etiqueta: string;
  acento?: boolean;
}) {
  return (
    <div className="rounded-sm border border-line bg-surface/60 p-5 shadow-[var(--df-shadow-md)]">
      <p
        className={`text-3xl leading-none tabular-nums ${acento ? "text-money" : "text-text"}`}
        style={ESTILO_CIFRA}
      >
        {valor.toLocaleString("es-ES")}
      </p>
      <p className="mt-2 text-2xs font-semibold tracking-widest text-text-dim uppercase">
        {etiqueta}
      </p>
    </div>
  );
}

/** Tarjeta de métrica SIN backend todavía: honesta ("próximamente"), nunca un 0 inventado. */
function TarjetaProximamente({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="rounded-sm border border-dashed border-line bg-surface/30 p-5">
      <p className="text-3xl leading-none text-text-dim" style={ESTILO_CIFRA}>
        —
      </p>
      <p className="mt-2 text-2xs font-semibold tracking-widest text-text-dim uppercase">
        {etiqueta}
      </p>
      <p className="mt-1 text-2xs tracking-widest text-text-dim uppercase">Próximamente</p>
    </div>
  );
}

/**
 * RESUMEN del panel (portada del dashboard). Métricas REALES de la BD (conteos de retos y usuarios) +
 * huecos honestos ("próximamente") donde aún no hay backend (dinero llega en Fase 7). CERO cifras
 * falsas. Debajo, accesos a cada sección con su icono. Hereda el guard (requireRole ADMIN) y el noindex
 * del layout.
 */
export default async function ResumenPage() {
  const { prisma } = await import("@/server/db/client");
  const { metricasPanel } = await import("@/server/services/panel-metricas");
  const m = await metricasPanel(prisma);

  const secciones = SECCIONES_PANEL.filter((s) => s.href !== "/panel");

  return (
    <div className="df-rise space-y-10">
      <div>
        <h1 className="text-2xl leading-none text-text" style={ESTILO_CIFRA}>
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
