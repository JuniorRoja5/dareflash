import Link from "next/link";

import { Tarjeta } from "@/components/ui/tarjeta";
import { MSG_PAGO_PATROCINIO, RETO_SOLICITUDES_PENDIENTES_MAX } from "@/config/constants";

import { ambitoDelPortal } from "../../ambito-portal";
import { AvisoVerificar } from "../../aviso-verificar";
import { FormularioPropuesta } from "./formulario-propuesta";

export const metadata = { title: "Proponer un reto · DareFlash" };
// Lee la sesión y el estado de la empresa: por petición.
export const dynamic = "force-dynamic";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/** Lo que pasa con una propuesta, en orden. Es lo que de verdad hace el flujo, ni un paso más. */
const PASOS = [
  "La revisamos a mano y te escribimos en cuanto la decidamos.",
  "Si la aprobamos, la preparamos con tu marca.",
  "La publicamos en cuanto recibimos el pago.",
] as const;

/**
 * /empresa/retos/nuevo — PROPONER UN RETO PATROCINADO (Fase 9 · P3).
 *
 * Solo una empresa VERIFICADA ve el formulario. A las demás se les dice por qué no, en vez de
 * enseñarles un formulario que el servidor les va a rechazar al enviarlo (la misma regla del resto del
 * portal: la pantalla no promete lo que el servidor niega). El servidor lo comprueba igual.
 *
 * DOS COLUMNAS EN ESCRITORIO (fase9-diseno): el formulario y, al lado y pegado, qué pasa después y
 * cómo se paga. En móvil, ese panel va debajo del formulario.
 */
export default async function PaginaProponerReto() {
  const ambito = await ambitoDelPortal();

  return (
    <div className="df-rise space-y-6">
      <div>
        <Link
          href="/empresa/retos"
          className="inline-flex min-h-[44px] items-center text-sm text-text-dim underline underline-offset-2 hover:text-text"
        >
          <span aria-hidden="true">←&nbsp;</span>Mis retos
        </Link>
        <h1 className="text-2xl text-text">Proponer un reto</h1>
        <p className="mt-1 max-w-prose text-sm text-text-dim">
          Tú pones el reto y el premio; nosotros lo revisamos, lo preparamos y lo publicamos con tu
          marca. Nada sale publicado sin que lo aprobemos.
        </p>
      </div>

      {ambito === null ? (
        <AvisoVerificar />
      ) : ambito.estado !== "VERIFICADA" ? (
        <Tarjeta className="max-w-prose p-5">
          <p className="text-sm text-text-dim">
            Podrás proponer retos en cuanto verifiquemos tu empresa. Te escribiremos cuando esté.
          </p>
        </Tarjeta>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
          <div className="min-w-0">
            <FormularioPropuesta />
          </div>
          <aside aria-label="Cómo funciona" className="space-y-4 lg:sticky lg:top-24">
            <Tarjeta className="p-5">
              <h2 className={CABECERA}>Después de enviar</h2>
              <ol className="mt-3 space-y-2 text-sm text-text-dim">
                {PASOS.map((p, i) => (
                  <li key={p} className="flex gap-3">
                    <span className="w-4 shrink-0 font-semibold text-text tabular-nums">
                      {i + 1}
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            </Tarjeta>
            <Tarjeta className="p-5">
              <h2 className={CABECERA}>El pago</h2>
              <p className="mt-2 text-sm text-text">{MSG_PAGO_PATROCINIO}</p>
            </Tarjeta>
            <p className="text-2xs text-text-dim">
              Puedes tener hasta {RETO_SOLICITUDES_PENDIENTES_MAX} propuestas esperando a la vez.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
