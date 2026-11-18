import { importeConMoneda } from "@/lib/dinero";
import { type Idioma } from "@/lib/formato";

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
export function InformacionCobro({ idioma }: { idioma: Idioma }) {
  return (
    <section aria-labelledby="info-cobro">
      <h2 id="info-cobro" className="sr-only">
        Información sobre los cobros
      </h2>

      <details className="group rounded-sm border border-line bg-surface/60 backdrop-blur-md">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
          Cómo funciona el cobro y las comisiones
          <span
            className="text-text-dim transition-transform duration-[var(--df-dur-fast)] ease-mechanical group-open:rotate-90"
            aria-hidden
          >
            ›
          </span>
        </summary>
        <div className="space-y-4 border-t border-line p-4 text-sm text-text-dim">
          <div>
            <h3 className="font-medium text-text">Cómo funciona</h3>
            <p className="mt-1.5 max-w-prose leading-relaxed">
              Al pedir un cobro, ese importe sale de tu saldo al momento, el equipo lo revisa y te
              lo envía por el método que elijas. Puede tardar unos días. Si lo rechazamos, el dinero
              vuelve entero a tu monedero.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-text">Comisiones</h3>
            <p className="mt-1.5 max-w-prose leading-relaxed">
              Las comisiones del banco corren por tu cuenta, no por la de DareFlash. Recibirás el
              importe solicitado menos esas comisiones: si pides {importeConMoneda(5000, idioma)},
              pueden llegarte, por ejemplo, {importeConMoneda(4890, idioma)}.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}
