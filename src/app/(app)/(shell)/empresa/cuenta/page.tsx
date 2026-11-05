import { redirect } from "next/navigation";

import { CerrarSesion } from "../../cerrar-sesion";
import { CambiarEmail } from "../../perfil/editar/cambiar-email";
import { CambiarPassword } from "../../perfil/editar/cambiar-password";

export const metadata = { title: "Cuenta · DareFlash" };
// Lee la sesión y el correo de la cuenta: por petición.
export const dynamic = "force-dynamic";

/**
 * /empresa/cuenta — CON QUÉ SE ENTRA Y DÓNDE LE ESCRIBIMOS: correo, contraseña y cerrar sesión.
 *
 * ┌─ POR QUÉ UNA PANTALLA PROPIA Y NO /perfil/editar ─────────────────────────────────────────────┐
 * │ /perfil/editar es la ficha del PARTICIPANTE: nombre público, foto, bio, redes. Su formulario   │
 * │ principal guarda por una ruta que a una empresa le responde 403 (no participa). Aquí está SOLO │
 * │ lo que una empresa gobierna de su cuenta, y son las dos rutas que P1 le abrió a propósito      │
 * │ (`perfil/email` y `auth/change-password`, `cuentaEmpresa: "permite"`).                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LOS COMPONENTES SON LOS MISMOS que en /perfil/editar, importados, no copiados: el copy del cambio
 * de correo (y su doble enlace de seguridad) es uno solo.
 *
 * CERRAR SESIÓN VA AQUÍ porque en móvil no hay barra superior: para el participante la salida vive
 * en su perfil, y una empresa no tiene perfil.
 *
 * Quien NO es empresa no tiene nada que hacer aquí: va a su edición de perfil, que tiene lo mismo y
 * más. El guard de sesión lo pone el layout del portal.
 */
export default async function CuentaEmpresaPage() {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  // Sin sesión no se llega (lo corta el layout); se comprueba igual para que el tipo lo sepa.
  if (!sesion) redirect("/entrar?siguiente=%2Fempresa%2Fcuenta");
  if (!sesion.esCuentaEmpresa) redirect("/perfil/editar");

  const { prisma } = await import("@/server/db/client");
  const cuenta = await prisma.user.findUnique({
    where: { id: sesion.userId },
    select: { email: true, emailPendiente: true },
  });

  return (
    <div className="df-rise">
      <h1 className="text-2xl text-text">Cuenta</h1>
      <p className="mt-1 max-w-prose text-sm text-text-dim">
        El correo con el que entras es también donde te escribimos sobre tu empresa.
      </p>

      {/* LADO A LADO EN ESCRITORIO (fase9-diseno): son dos formularios independientes y cortos; uno
          debajo del otro dejaban media pantalla vacía. Los componentes son los del perfil, sin tocar. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:items-start">
        <CambiarEmail
          emailActual={cuenta?.email ?? "—"}
          pendienteInicial={cuenta?.emailPendiente ?? null}
        />
        <CambiarPassword />
      </div>

      <CerrarSesion className="mt-8" />
    </div>
  );
}
