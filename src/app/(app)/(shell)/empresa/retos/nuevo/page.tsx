import Link from "next/link";

import { RETO_SOLICITUDES_PENDIENTES_MAX } from "@/config/constants";

import { ambitoDelPortal } from "../../ambito-portal";
import { AvisoVerificar } from "../../aviso-verificar";
import { FormularioPropuesta } from "./formulario-propuesta";

export const metadata = { title: "Proponer un reto · DareFlash" };
// Lee la sesión y el estado de la empresa: por petición.
export const dynamic = "force-dynamic";

/**
 * /empresa/retos/nuevo — PROPONER UN RETO PATROCINADO (Fase 9 · P3).
 *
 * Solo una empresa VERIFICADA ve el formulario. A las demás se les dice por qué no, en vez de
 * enseñarles un formulario que el servidor les va a rechazar al enviarlo (la misma regla del resto del
 * portal: la pantalla no promete lo que el servidor niega). El servidor lo comprueba igual.
 */
export default async function PaginaProponerReto() {
  const ambito = await ambitoDelPortal();

  return (
    <div className="df-rise space-y-6">
      <div>
        <h1 className="text-2xl text-text">Proponer un reto</h1>
        <p className="mt-1 max-w-prose text-sm text-text-dim">
          Tú pones el reto y el premio; nosotros lo revisamos, lo preparamos y lo publicamos con tu
          marca. Nada sale publicado sin que lo aprobemos.
        </p>
      </div>

      {ambito === null ? (
        <AvisoVerificar />
      ) : ambito.estado !== "VERIFICADA" ? (
        <p className="max-w-prose rounded-sm border border-line bg-surface p-4 text-sm text-text-dim">
          Podrás proponer retos en cuanto verifiquemos tu empresa. Te escribiremos cuando esté.
        </p>
      ) : (
        <>
          <p className="text-2xs text-text-dim">
            Puedes tener hasta {RETO_SOLICITUDES_PENDIENTES_MAX} propuestas esperando a la vez.
          </p>
          <FormularioPropuesta />
        </>
      )}

      <Link
        href="/empresa/retos"
        className="inline-block text-sm text-text-dim underline underline-offset-2 hover:text-text"
      >
        Volver a mis retos
      </Link>
    </div>
  );
}
