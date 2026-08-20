import Link from "next/link";

import { SECCIONES_PANEL } from "./secciones";

export const metadata = { title: "Panel · DareFlash" };

/**
 * RESUMEN del panel (portada). Accesos a cada sección + un hueco de métricas ANUNCIADO ("próximamente"),
 * SIN cifras falsas. Hereda el guard (requireRole ADMIN) y el noindex del layout.
 */
export default function ResumenPage() {
  const secciones = SECCIONES_PANEL.filter((s) => s.href !== "/panel");
  return (
    <div className="df-rise space-y-8">
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
        <div className="rounded-sm border border-dashed border-line bg-surface/40 p-8 text-center text-sm text-text-dim">
          Aquí verás las cifras clave de la plataforma. Próximamente.
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase">
          Secciones
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {secciones.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="block rounded-sm border border-line bg-surface/60 p-4 transition-colors duration-150 ease-mechanical hover:bg-surface"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium text-text">{s.label}</span>
                  {s.fase !== null ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-2xs font-semibold tracking-widest text-text-dim uppercase">
                      Fase {s.fase}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm text-text-dim">{s.descripcion}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
