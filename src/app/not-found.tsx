import { Boton } from "@/components/ui/boton";
import { Logo } from "@/components/ui/logo";
import { textos } from "@/textos/servidor";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("noEncontrada") };
}

/**
 * LA PÁGINA 404 PROPIA (Fase 11 · P5b2b, aprobada por Junior el 25 nov). Antes salía la de Next: en
 * inglés, sin la marca y sin camino de vuelta.
 *
 * LA RECOGE TODO LO QUE NO EXISTE: una ruta sin página (con un solo layout raíz, este `not-found` es
 * también el de las rutas que no casan con nada) y lo que el proxy manda a `/_no-existe` —un idioma
 * no publicado, `/es/…` no, ese redirige; `/en/panel|api|ir`—. El estado sigue siendo 404: Next lo
 * pone al no encontrar la ruta, y aquí no se lee nada que lo cambie.
 *
 * LA MARCA Y UNA SOLA ACCIÓN: el logo, una frase humana (sin cifras ni datos inventados) y un botón,
 * el principal (`--df-action`), que vuelve al inicio con el idioma de la página (`Boton` → `Enlace`).
 */
export default async function NoEncontrada() {
  const t = await textos("noEncontrada");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center px-5 py-16 sm:px-6">
      <Logo className="text-text" />
      <h1
        className="mt-8 text-[clamp(1.75rem,5vw,2.5rem)] leading-tight text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 800, "wdth" 115',
        }}
      >
        {t("titulo")}
      </h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-text-dim">{t("texto")}</p>
      {/* SIN PRECARGA (aprobado por Junior el 26 nov): precargar la portada eran +22 KB en reposo para
          un botón que casi nadie pulsa desde aquí. */}
      <Boton href="/" variante="principal" className="mt-8" prefetch={false}>
        {t("volver")}
      </Boton>
    </main>
  );
}
