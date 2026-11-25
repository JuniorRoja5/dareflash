import { Boton } from "@/components/ui/boton";
import { Tarjeta } from "@/components/ui/tarjeta";
import { CAMINO_EMPRESA, CAMINO_PARTICIPANTE } from "@/config/constants";
import { socioFundador } from "@/textos/empresa";
import { textos } from "@/textos/servidor";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("empezar") };
}

/**
 * /empezar — ¿CÓMO QUIERES USAR REVOLFLASH?
 *
 * Existe porque hay DOS cuentas que no se pueden mezclar: la de participante (sube, vota, gana) y
 * la de empresa (mira, patrocina, se anuncia). Sin esta pantalla, un negocio se registraba como
 * participante —el único registro que había— y después pedía por soporte que le convirtieran la
 * cuenta, que es justo lo que no se puede hacer.
 *
 * UN SOLO ACENTO. El sistema reserva `--df-action` para una acción por pantalla, y aquí la
 * principal es participar: es el producto. El camino del negocio va en secundario, que lo hace
 * igual de visible sin competir por el mismo color.
 *
 * ESTÁTICA a propósito: no lee sesión ni base de datos, así que no necesita `force-dynamic`.
 */
export default async function PaginaEmpezar() {
  // El idioma de quien mira (Fase 11): la fecha del aviso sale de `lib/formato`.
  const { idiomaDeLaPeticion } = await import("@/server/formato-peticion");
  const idioma = await idiomaDeLaPeticion();
  const [t, tn] = await Promise.all([textos("empezar"), textos("negocio")]);
  return (
    <div className="df-rise mx-auto w-full max-w-5xl px-4 py-10 lg:px-8 lg:py-16">
      <h1 className="text-3xl text-text lg:text-4xl">{t("titulo")}</h1>
      <p className="mt-2 max-w-prose text-sm text-text-dim lg:text-base">{t("subtitulo")}</p>

      {/* LADO A LADO desde tableta, apiladas en móvil (participar primero: es el producto). Las dos
          miden lo mismo y alinean el botón abajo, para que se comparen como dos opciones y no como
          una tarjeta y su nota al pie. */}
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:mt-10 lg:gap-6">
        <Tarjeta className="flex flex-col p-6 lg:p-8">
          <p className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
            {t("participante")}
          </p>
          <h2 className="mt-2 text-xl text-text lg:text-2xl">{t("participarTitulo")}</h2>
          <p className="mt-2 flex-1 text-sm text-text-dim">{t("participarCuerpo")}</p>
          <Boton href={CAMINO_PARTICIPANTE.href} className="mt-6 w-full sm:w-auto sm:self-start">
            {t("participarCta")}
          </Boton>
        </Tarjeta>

        <Tarjeta className="flex flex-col p-6 lg:p-8">
          <p className="text-2xs font-semibold tracking-widest text-text-dim uppercase">
            {t("negocio")}
          </p>
          <h2 className="mt-2 text-xl text-text lg:text-2xl">{tn("caminoTitulo")}</h2>
          <p className="mt-2 text-sm text-text-dim">{tn("caminoCuerpo")}</p>
          {/* El aviso se construye con las constantes (fecha y cifra), nunca escrito a mano: si se
              mueven, la promesa se mueve con ellas. En su recuadro, para que no se pierda como una
              línea más del cuerpo: es la razón para registrarse AHORA. */}
          <p className="mt-4 rounded-sm border border-text/40 px-3 py-2 text-sm text-text">
            {socioFundador(tn, idioma)}
          </p>
          <span className="flex-1" aria-hidden />
          <Boton
            href={CAMINO_EMPRESA.href}
            variante="secundario"
            className="mt-6 w-full sm:w-auto sm:self-start"
          >
            {tn("caminoCta")}
          </Boton>
        </Tarjeta>
      </div>
    </div>
  );
}
