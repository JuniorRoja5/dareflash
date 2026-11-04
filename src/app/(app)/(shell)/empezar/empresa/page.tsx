import { redirect } from "next/navigation";

import { msgSocioFundador } from "@/config/constants";
import { paisesParaElegir } from "@/lib/paises";

import { FormularioAlta } from "./formulario-alta";

export const metadata = { title: "Registrar mi empresa · DareFlash" };
// Mira la sesión (para no enseñarle el alta a quien ya tiene su portal): por petición.
export const dynamic = "force-dynamic";

/**
 * /empezar/empresa — EL ALTA, QUE CREA LA CUENTA Y LA EMPRESA JUNTAS.
 *
 * PÚBLICA: quien llega aquí todavía no tiene cuenta. Por eso no cuelga del portal (`/empresa`),
 * que sí exige sesión en su layout: el alta de una empresa no puede estar detrás de la puerta que
 * abre el alta.
 *
 * QUIEN YA ES EMPRESA no la ve: se va a su portal. A quien tiene una cuenta de participante no se
 * le echa —puede registrar una empresa, con otro correo—, y por qué hace falta otro correo lo dice
 * el formulario antes de que escriba nada.
 */
export default async function PaginaAltaEmpresa() {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  if (sesion?.esCuentaEmpresa) redirect("/empresa");

  return (
    <div className="df-rise mx-auto w-full max-w-3xl px-4 py-8 lg:px-8 lg:py-12">
      <h1 className="text-2xl text-text">Registra tu empresa</h1>
      <p className="mt-2 max-w-prose text-sm text-text-dim">
        Las revisamos a mano, una por una. Cuéntanos quién eres y te escribimos en cuanto esté.
      </p>
      <p className="mt-2 max-w-prose text-sm text-text">{msgSocioFundador()}</p>
      {/* LA LISTA DE PAÍSES SE CALCULA AQUÍ, UNA VEZ. Si la calculara también el cliente, el ICU de
          Node y el de Chrome ordenarían distinto y React abortaría la hidratación (pasó: «Hungría»
          donde el navegador esperaba «Hong Kong»). Ver el docblock del formulario. */}
      <FormularioAlta paises={paisesParaElegir("es")} />
    </div>
  );
}
