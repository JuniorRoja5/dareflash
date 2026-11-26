import type { ReactNode } from "react";

import { PieLegal } from "@/components/ui/pie-legal";
import { textos, textosRicos } from "@/textos/servidor";

export async function generateMetadata() {
  return { title: (await textos("privacidad"))("titulo") };
}

/**
 * POLÍTICA DE PRIVACIDAD — página pública, estática y sin datos.
 *
 * ┌─ POR QUÉ EXISTE YA, CON HUECOS ───────────────────────────────────────────────────────────────┐
 * │ La casilla del registro la nombraba y no enlazaba a ninguna parte: pedir consentimiento sobre │
 * │ un documento que no se puede leer es peor que no pedirlo. El texto es FUNCIONAL —describe lo  │
 * │ que la plataforma recoge de verdad— pero NO es definitivo: los `[PENDIENTE]` se rellenan con  │
 * │ los datos del responsable y tiene que revisarlo un abogado antes de ser la versión publicada. │
 * │ Por eso el aviso de arriba está EN LA PÁGINA y no solo en un comentario: quien la lea tiene   │
 * │ que saber en qué estado está. El sitio sigue tras el pestillo (`noindex`), así que no es       │
 * │ pública de verdad todavía.                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTÁTICA DE VERDAD: ni `env`, ni `prisma`, ni sesión. Se prerenderiza en el build, que es lo que
 * exige una página bajo `src/app/**` (ver CLAUDE.md: leer `env` en ámbito de módulo aquí tumba el
 * despliegue). Si algún día lleva el correo de contacto, sale de `constants.ts`, no de `env`.
 *
 * NO SE PINTA DESDE MARKDOWN: no hay renderizador en el proyecto y meter uno por una página sería
 * una dependencia nueva para esto. El texto vive en el diccionario (`privacidad`, P5b2b), una frase por
 * clave con su formato dentro (`tRico`: `resaltado`, `pendiente`, `externo`), y la estructura en JSX.
 */

/** Un apartado numerado. El `id` deja enlazar a una sección concreta desde fuera. */
function Apartado({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: ReactNode;
}) {
  const id = `s${numero}`;
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-8">
      <h2
        id={id}
        className="text-lg leading-tight text-text sm:text-xl"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 700, "wdth" 110',
        }}
      >
        {numero}. {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-text-dim">{children}</div>
    </section>
  );
}

/**
 * Un hueco sin rellenar (la marca `pendiente`), VISIBLE a propósito. No se disimula con texto plausible: un documento legal
 * con un dato inventado es peor que uno con un hueco declarado.
 *
 * VA EN NEUTRO, y la primera versión no: la pinté con `--df-time`, que se ve bien y está MAL —ese
 * token es "tiempo restante no crítico" y nada más (ver MARCA.md: un token, un trabajo). Un hueco
 * pendiente no es tiempo, ni dinero, ni alarma, ni una acción: es una anotación. Lo que lo hace
 * visible es que rompe el ritmo del texto —fondo elevado y filete discontinuo—, no robarle el color
 * a otro significado.
 */
const PENDIENTE =
  "rounded-xs border border-dashed border-line bg-raised px-1.5 py-0.5 text-text-dim";

export default async function PrivacidadPage() {
  const [t, tr] = await Promise.all([textos("privacidad"), textosRicos("privacidad")]);
  const marcas = {
    resaltado: { className: "text-text" },
    pendiente: { className: PENDIENTE },
  };
  const FILAS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  return (
    <main className="mx-auto w-full max-w-[72ch] px-5 py-12 sm:px-6 lg:py-16">
      <h1
        className="text-[clamp(1.75rem,5vw,2.5rem)] leading-tight text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 800, "wdth" 115',
        }}
      >
        {t("titulo")}
      </h1>

      {/* EL ESTADO DEL DOCUMENTO, VISIBLE. Quien lo lee tiene que saber que todavía no es la versión
          definitiva; esconderlo sería dejarle creer que ya lo es. */}
      <p
        role="note"
        className="mt-5 rounded-sm border border-line bg-surface/60 p-4 text-sm leading-relaxed text-text-dim"
      >
        {tr("enPreparacion", {
          resaltado: { className: "font-medium text-text", como: "strong" },
          pendiente: { className: PENDIENTE },
        })}
      </p>

      <p className="mt-4 text-xs text-text-dim">
        {tr("actualizacion", { pendiente: { className: PENDIENTE } })}
      </p>

      <Apartado numero={1} titulo={t("s1")}>
        <p>{t("s1_intro")}</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{tr("s1_entidad", marcas)}</li>
          <li>{tr("s1_domicilio", marcas)}</li>
          <li>{tr("s1_contacto", marcas)}</li>
        </ul>
        <p>{t("s1_rgpd")}</p>
      </Apartado>

      <Apartado numero={2} titulo={t("s2")}>
        <ul className="list-disc space-y-2 pl-5">
          <li>{tr("s2_cuenta", marcas)}</li>
          <li>{tr("s2_contenido", marcas)}</li>
          <li>{tr("s2_uso", marcas)}</li>
          <li>{tr("s2_ubicacion", marcas)}</li>
          <li>{tr("s2_pago", marcas)}</li>
          <li>{tr("s2_referidos", marcas)}</li>
          <li>{tr("s2_comunicaciones", marcas)}</li>
        </ul>
      </Apartado>

      <Apartado numero={3} titulo={t("s3")}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-4 font-medium text-text">
                  {t("s3_finalidad")}
                </th>
                <th scope="col" className="py-2 font-medium text-text">
                  {t("s3_base")}
                </th>
              </tr>
            </thead>
            <tbody>
              {FILAS.map((n) => (
                <tr key={n} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-4 align-top">{t(`s3_f${n}`)}</td>
                  <td className="py-2.5 align-top">{t(`s3_b${n}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Apartado>

      <Apartado numero={4} titulo={t("s4")}>
        <p>{tr("s4_texto", marcas)}</p>
      </Apartado>

      <Apartado numero={5} titulo={t("s5")}>
        <p>{t("s5_intro")}</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{tr("s5_bunny", marcas)}</li>
          <li>{tr("s5_stripe", marcas)}</li>
          <li>{tr("s5_correo", marcas)}</li>
          <li>{tr("s5_alojamiento", marcas)}</li>
        </ul>
        <p>{t("s5_ley")}</p>
        <p>
          {tr("s5_fuentes", {
            ...marcas,
            externo: {
              hrefs: [
                "https://db-ip.com",
                "https://www.geonames.org",
                "https://creativecommons.org/licenses/by/4.0/",
              ],
              className: "underline underline-offset-2",
            },
          })}
        </p>
        <p>{tr("s5_transferencias", marcas)}</p>
      </Apartado>

      <Apartado numero={6} titulo={t("s6")}>
        <p>{t("s6_texto")}</p>
      </Apartado>

      <Apartado numero={7} titulo={t("s7")}>
        <p>{tr("s7_texto", marcas)}</p>
        <p>{t("s7_reclamar")}</p>
      </Apartado>

      <Apartado numero={8} titulo={t("s8")}>
        <p>{tr("s8_texto", marcas)}</p>
      </Apartado>

      <Apartado numero={9} titulo={t("s9")}>
        <p>{t("s9_texto")}</p>
      </Apartado>

      <Apartado numero={10} titulo={t("s10")}>
        <p>{t("s10_texto")}</p>
      </Apartado>

      <Apartado numero={11} titulo={t("s11")}>
        <p>{tr("s11_texto", marcas)}</p>
      </Apartado>

      {/* EL MISMO PIE QUE EL RESTO, también aquí: una página legal sin camino de vuelta deja a quien
          la abre en un callejón. Sin barra inferior —esta ruta está fuera del grupo `(app)`—. */}
      <PieLegal />
    </main>
  );
}
