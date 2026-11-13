import { redirect } from "next/navigation";

import { Tarjeta } from "@/components/ui/tarjeta";
import { fraseCreditoPublica, msgSocioFundador } from "@/config/constants";
import { paisesParaElegir } from "@/lib/paises";

import { FormularioAlta } from "./formulario-alta";

export const metadata = { title: "Registrar mi empresa · DareFlash" };
// Mira la sesión (para no enseñarle el alta a quien ya tiene su portal): por petición.
export const dynamic = "force-dynamic";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/** Lo que pasa después de enviar, en orden. Es lo que de verdad hace el alta, ni un paso más. */
const PASOS = [
  "Te enviamos un correo para confirmar tu dirección.",
  "Revisamos tu empresa a mano, una por una.",
  "Te escribimos en cuanto la decidamos. Si no podemos verificarla, te decimos por qué.",
] as const;

/** Qué pasa después de enviar. Sale dos veces (panel en escritorio, pie en móvil) y es UNA pieza. */
function DespuesDeEnviar({ className }: { className: string }) {
  return (
    <Tarjeta className={`p-5 ${className}`}>
      <h2 className={CABECERA}>Después de enviar</h2>
      <ol className="mt-3 space-y-2 text-sm text-text-dim">
        {PASOS.map((p, i) => (
          <li key={p} className="flex gap-3">
            <span className="w-4 shrink-0 font-semibold text-text tabular-nums">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
    </Tarjeta>
  );
}

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
 *
 * DOS COLUMNAS EN ESCRITORIO (fase9-diseno): el formulario a la izquierda y, a la derecha y PEGADO
 * al hacer scroll, lo que se lleva, el aviso de Socios Fundadores y qué pasa después de enviar. En
 * móvil el panel va ARRIBA y corto: quien llega tiene que saber a qué se apunta antes de rellenar.
 */
export default async function PaginaAltaEmpresa() {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const sesion = await getCurrentUser();
  const { idiomaDeLaPeticion } = await import("@/server/formato-peticion");
  const idioma = await idiomaDeLaPeticion();
  if (sesion?.esCuentaEmpresa) redirect("/empresa");

  return (
    <div className="df-rise mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-12">
      <h1 className="text-2xl text-text lg:text-3xl">Registra tu empresa</h1>
      <p className="mt-2 max-w-prose text-sm text-text-dim">
        Las revisamos a mano, una por una. Cuéntanos quién eres y te escribimos en cuanto esté.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
        {/* EL PANEL, ANTES EN EL DOM: en móvil sale primero (lo que se lleva, antes de rellenar); en
            escritorio pasa a la segunda columna con `order`. */}
        <aside aria-label="Qué te llevas" className="space-y-4 lg:sticky lg:top-24 lg:order-2">
          <Tarjeta className="p-5">
            <h2 className={CABECERA}>Qué te llevas</h2>
            <ul className="mt-3 space-y-2 text-sm text-text">
              <li>Patrocina retos con tu marca: tú pones el reto y el premio.</li>
              <li>Créditos de publicidad: {fraseCreditoPublica()}</li>
              <li className="text-text-dim">
                Lo ves todo, pero no participas: ni subes vídeos ni votas.
              </li>
            </ul>
          </Tarjeta>

          {/* El aviso se construye con las constantes (fecha y cifra), nunca escrito a mano. Con
              filete pleno para que se lea como lo que es: una condición con fecha. */}
          {/* Sin cabecera propia: el texto ya empieza por «Socios Fundadores:» y repetirlo encima
              era leer lo mismo dos veces. */}
          <Tarjeta className="border-text/40 p-5">
            <p className="text-sm font-medium text-text">{msgSocioFundador(idioma)}</p>
          </Tarjeta>

          <DespuesDeEnviar className="hidden lg:block" />
        </aside>

        <div className="min-w-0 lg:order-1">
          {/* LA LISTA DE PAÍSES SE CALCULA AQUÍ, UNA VEZ. Si la calculara también el cliente, el ICU de
              Node y el de Chrome ordenarían distinto y React abortaría la hidratación (pasó: «Hungría»
              donde el navegador esperaba «Hong Kong»). Ver el docblock del formulario. */}
          <FormularioAlta paises={paisesParaElegir("es")} />

          {/* En móvil, «después de enviar» va debajo del formulario: arriba solo lo que decide. */}
          <DespuesDeEnviar className="mt-6 lg:hidden" />
        </div>
      </div>
    </div>
  );
}
