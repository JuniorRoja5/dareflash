import { importeConMoneda } from "@/lib/dinero";
import { type Idioma } from "@/lib/formato";
import { textos } from "@/textos/servidor";

/**
 * INFORMACIÓN — lo que hay que saber antes de pedir un cobro: cómo funciona y quién paga las
 * comisiones.
 *
 * RECOGIDA EN UN DESPLEGABLE, y es una decisión de jerarquía: esto se lee UNA vez, y el histórico y
 * los métodos se miran cada vez. Los bloques de prosa abiertos debajo del acordeón competían con él
 * y empujaban lo accionable fuera de la pantalla. Cerrado sigue estando —y se anuncia— sin pelear
 * por el sitio.
 *
 * Hubo un tercer bloque, SIEMPRE visible y en `--df-alarm`: el aviso de la red de la cripto, el
 * único que costaba dinero irrecuperable si no se leía. Se fue con la cripto (Fase 11 · PC): un
 * IBAN que no existe lo rechaza el banco y el dinero vuelve, así que ya no hay nada que merezca
 * una alarma permanente.
 *
 * `<details>` NATIVO: abre y cierra sin JavaScript, y por tanto funciona en el primer pintado y con
 * el teclado sin que nadie tenga que implementarlo. Es un bloque de texto, no un widget.
 */
export async function InformacionCobro({ idioma }: { idioma: Idioma }) {
  const t = await textos("monedero");
  return (
    <section aria-labelledby="info-cobro">
      <h2 id="info-cobro" className="sr-only">
        {t("infoAria")}
      </h2>

      <details className="group rounded-sm border border-line bg-surface/60 backdrop-blur-md">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
          {t("infoResumen")}
          <span
            className="text-text-dim transition-transform duration-[var(--df-dur-fast)] ease-mechanical group-open:rotate-90"
            aria-hidden
          >
            ›
          </span>
        </summary>
        <div className="space-y-4 border-t border-line p-4 text-sm text-text-dim">
          <div>
            <h3 className="font-medium text-text">{t("comoFunciona")}</h3>
            <p className="mt-1.5 max-w-prose leading-relaxed">{t("comoFuncionaTexto")}</p>
          </div>
          <div>
            <h3 className="font-medium text-text">{t("comisiones")}</h3>
            <p className="mt-1.5 max-w-prose leading-relaxed">
              {t("comisionesTexto", {
                pides: importeConMoneda(5000, idioma),
                llegan: importeConMoneda(4890, idioma),
              })}
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}
