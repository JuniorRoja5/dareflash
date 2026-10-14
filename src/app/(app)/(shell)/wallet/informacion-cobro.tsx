import { REDES_CRIPTO } from "@/config/constants";
import { importeConMoneda } from "@/lib/dinero";

/**
 * INFORMACIÓN — las tres cosas que hay que saber antes de pedir un cobro.
 *
 * RECOGIDA EN UN DESPLEGABLE, y es una decisión de jerarquía: esto se lee UNA vez, y el histórico y
 * los métodos se miran cada vez. Tres bloques de prosa abiertos debajo del acordeón competían con
 * él y empujaban lo accionable fuera de la pantalla. Cerrado sigue estando —y se anuncia— sin pelear
 * por el sitio.
 *
 * EL AVISO DE LA RED VA FUERA DEL DESPLEGABLE, siempre visible. Es el único de los tres que, si no
 * se lee, cuesta dinero que no se puede recuperar: esconderlo tras un clic es esconder justo el que
 * no se puede esconder. Los otros dos se arreglan preguntando.
 *
 * `<details>` NATIVO: abre y cierra sin JavaScript, y por tanto funciona en el primer pintado y con
 * el teclado sin que nadie tenga que implementarlo. Es un bloque de texto, no un widget.
 */
export function InformacionCobro() {
  return (
    <section aria-labelledby="info-cobro" className="mt-10">
      <h2 id="info-cobro" className="sr-only">
        Información sobre los cobros
      </h2>

      {/* EL AVISO IRREVERSIBLE va en `--df-alarm`, que es exactamente para lo que existe ese token
          —peligro—, no para decorar: equivocarse de red es dinero que desaparece. Y va FUERA del
          desplegable: es el único de los tres que, si no se lee, cuesta dinero que no vuelve. */}
      <div className="rounded-sm border border-alarm/40 bg-alarm/5 p-4">
        <h3 className="text-sm font-medium text-alarm">Red de la cripto: léelo con cuidado</h3>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-text-dim">
          Solo enviamos USDC/USDT por {REDES_CRIPTO.map((r) => r.nombre).join(" y ")}. Tu dirección
          tiene que ser de esa misma red. Si nos das una de otra red,{" "}
          <span className="text-text">el dinero se pierde y no se puede recuperar</span>: los envíos
          de cripto son irreversibles.
        </p>
      </div>

      <details className="group mt-2 rounded-sm border border-line bg-surface/60 backdrop-blur-md">
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
              Las comisiones de la red (cripto) o del banco corren por tu cuenta, no por la de
              DareFlash. Recibirás el importe solicitado menos esas comisiones: si pides{" "}
              {importeConMoneda(5000)}, pueden llegarte, por ejemplo, {importeConMoneda(4890)}.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}
