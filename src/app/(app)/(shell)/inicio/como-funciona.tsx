import { Imagen3d, type Pieza3d } from "@/components/ui/imagen-3d";
import type { Tema } from "@/lib/tema";
import { textos, textosRicos } from "@/textos/servidor";

/**
 * «CÓMO FUNCIONA», EN 3 PASOS (rediseño de /inicio). Es el bloque que funciona con CUALQUIER cantidad de
 * contenido —hoy hay pocos retos—: dice la verdad del producto sin depender de ninguna cifra.
 *
 * Lo ven el invitado y quien aún no ha participado nunca; desaparece en cuanto alguien participa (ya lo
 * sabe) y la empresa no lo ve (no puede participar). Lo decide `bloquesPortada`.
 *
 * Cada paso, con su imagen 3D (neutra: ni acción ni dinero, ver `optimizar-recursos-3d`) y su número
 * grande en la tipografía de display, en neutro — los números de orden no son dinero ni acción.
 */
/** Los tres pasos: su dibujo y su número. Los textos salen de `inicio.paso<N>Titulo/Texto`. */
const PASOS: { pieza: Pieza3d; numero: 1 | 2 | 3 }[] = [
  { pieza: "paso-1-reto", numero: 1 },
  { pieza: "paso-2-video", numero: 2 },
  { pieza: "paso-3-voto", numero: 3 },
];

export async function ComoFunciona({ tema }: { tema: Tema }) {
  const [t, tr] = await Promise.all([textos("inicio"), textosRicos("inicio")]);
  return (
    <section aria-labelledby="como-funciona">
      <h2 id="como-funciona" className="text-xl font-semibold text-text lg:text-2xl">
        {t("comoFunciona")}
      </h2>
      <ol className="mt-5 grid gap-4 sm:grid-cols-3 lg:gap-6">
        {PASOS.map((p, i) => (
          <li
            key={p.pieza}
            className="flex items-start gap-4 rounded-sm border border-line bg-surface/60 p-4 backdrop-blur-md sm:flex-col sm:gap-3 lg:p-6"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="text-4xl leading-none text-text-dim tabular-nums lg:text-5xl"
                style={{
                  fontFamily: "var(--font-display)",
                  fontVariationSettings: '"wght" 860, "wdth" 125',
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <Imagen3d pieza={p.pieza} tema={tema} tamano={56} className="w-14 lg:w-16" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-text">
                {tr("pasoTitulo", { oculto: {} }, { n: i + 1, titulo: t(`paso${p.numero}Titulo`) })}
              </h3>
              <p className="mt-1 text-sm text-text-dim">{t(`paso${p.numero}Texto`)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
