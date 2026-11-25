import { redirigir } from "@/server/redirigir";

import { Tarjeta } from "@/components/ui/tarjeta";
import { TextosProvider } from "@/components/textos-provider";
import { creditoDia, socioFundador } from "@/textos/empresa";
import { textos, textosClienteDeLaPeticion } from "@/textos/servidor";
import { paisesParaElegir } from "@/lib/paises";

import { FormularioAlta } from "./formulario-alta";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("altaEmpresa") };
}
// Mira la sesión (para no enseñarle el alta a quien ya tiene su portal): por petición.
export const dynamic = "force-dynamic";

const CABECERA = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/** Lo que pasa después de enviar, en orden. Es lo que de verdad hace el alta, ni un paso más. */
/** Qué pasa después de enviar. Sale dos veces (panel en escritorio, pie en móvil) y es UNA pieza. */
async function DespuesDeEnviar({ className }: { className: string }) {
  const t = await textos("altaEmpresa");
  const PASOS = [t("paso1"), t("paso2"), t("paso3")];
  return (
    <Tarjeta className={`p-5 ${className}`}>
      <h2 className={CABECERA}>{t("despues")}</h2>
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
  if (sesion?.esCuentaEmpresa) return redirigir("/empresa");
  const [t, tn, textosForm] = await Promise.all([
    textos("altaEmpresa"),
    textos("negocio"),
    textosClienteDeLaPeticion(["altaFormulario", "negocio"] as const),
  ]);

  return (
    <div className="df-rise mx-auto w-full max-w-6xl px-4 py-8 lg:px-8 lg:py-12">
      <h1 className="text-2xl text-text lg:text-3xl">{t("titulo")}</h1>
      <p className="mt-2 max-w-prose text-sm text-text-dim">{t("intro")}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-10">
        {/* EL PANEL, ANTES EN EL DOM: en móvil sale primero (lo que se lleva, antes de rellenar); en
            escritorio pasa a la segunda columna con `order`. */}
        <aside aria-label={t("queTeLlevas")} className="space-y-4 lg:sticky lg:top-24 lg:order-2">
          <Tarjeta className="p-5">
            <h2 className={CABECERA}>{t("queTeLlevas")}</h2>
            <ul className="mt-3 space-y-2 text-sm text-text">
              <li>{t("llevaRetos")}</li>
              <li>{t("llevaCreditos", { frase: creditoDia(tn, idioma) })}</li>
              <li className="text-text-dim">{t("llevaNoParticipas")}</li>
            </ul>
          </Tarjeta>

          {/* El aviso se construye con las constantes (fecha y cifra), nunca escrito a mano. Con
              filete pleno para que se lea como lo que es: una condición con fecha. */}
          {/* Sin cabecera propia: el texto ya empieza por «Socios Fundadores:» y repetirlo encima
              era leer lo mismo dos veces. */}
          <Tarjeta className="border-text/40 p-5">
            <p className="text-sm font-medium text-text">{socioFundador(tn, idioma)}</p>
          </Tarjeta>

          <DespuesDeEnviar className="hidden lg:block" />
        </aside>

        <div className="min-w-0 lg:order-1">
          {/* LA LISTA DE PAÍSES SE CALCULA AQUÍ, UNA VEZ. Si la calculara también el cliente, el ICU de
              Node y el de Chrome ordenarían distinto y React abortaría la hidratación (pasó: «Hungría»
              donde el navegador esperaba «Hong Kong»). Ver el docblock del formulario. */}
          <TextosProvider textos={textosForm}>
            <FormularioAlta paises={paisesParaElegir(idioma)} />
          </TextosProvider>

          {/* En móvil, «después de enviar» va debajo del formulario: arriba solo lo que decide. */}
          <DespuesDeEnviar className="mt-6 lg:hidden" />
        </div>
      </div>
    </div>
  );
}
