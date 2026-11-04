import { redirect } from "next/navigation";

import { AvisoVerificar } from "../aviso-verificar";
import { FormularioAlta } from "../formulario-alta";

export const metadata = { title: "Registrar mi empresa · DareFlash" };
// Lee la sesión para saber si ya hay empresa: por petición, nunca cacheada.
export const dynamic = "force-dynamic";

/**
 * /empresa/alta — EL FORMULARIO.
 *
 * Son dos pantallas y no una con un `if` porque son dos cosas distintas: registrar y consultar. Así
 * cada una tiene su guard —aquí «todavía no tiene», allí «tiene»— y el chokepoint queda con un
 * consumidor de verdad desde el primer día, en vez de ser una función que nadie llama.
 *
 * QUIEN YA TIENE EMPRESA NO VE ESTO. No por esconder un formulario: por no ofrecer una segunda alta
 * que la base de datos va a rechazar (`ownerUserId` es UNIQUE).
 */
export default async function PaginaAlta() {
  const { AuthError } = await import("@/server/auth/rbac");
  const { empresaDeLaSesion } = await import("@/server/auth/empresa-actual");

  let sesion;
  try {
    sesion = await empresaDeLaSesion();
  } catch (e) {
    if (e instanceof AuthError && e.code === "EMAIL_NOT_VERIFIED") {
      return (
        <div className="df-rise mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
          <h1 className="text-2xl text-text">Registra tu empresa</h1>
          <div className="mt-6">
            <AvisoVerificar />
          </div>
        </div>
      );
    }
    throw e;
  }
  if (sesion.empresa) redirect("/empresa");

  return (
    <div className="df-rise mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
      <h1 className="text-2xl text-text">Registra tu empresa</h1>
      <p className="mt-2 max-w-prose text-sm text-text-dim">
        Las revisamos a mano, una por una. Cuéntanos quién eres y te escribimos en cuanto esté.
      </p>
      <FormularioAlta />
    </div>
  );
}
