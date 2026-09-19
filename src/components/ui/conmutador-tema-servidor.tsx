import { cookies } from "next/headers";

import { TEMA_COOKIE, temaDesdeCookie } from "@/lib/tema";

import { ConmutadorTema } from "./conmutador-tema";

/**
 * El conmutador de tema, resuelto en el SERVIDOR. Lee la cookie y le da al botón el tema con el que se
 * pintó la página, para que el primer render del cliente coincida con el HTML (nada de icono de sol
 * sobre una página que ya está en claro).
 *
 * Existe para que quien lo coloca no tenga que arrastrar el tema desde su página: se suelta y ya.
 */
export async function ConmutadorTemaServidor({
  className,
  conTexto,
}: {
  className?: string;
  conTexto?: boolean;
}) {
  const tema = temaDesdeCookie((await cookies()).get(TEMA_COOKIE)?.value);
  return <ConmutadorTema inicial={tema} className={className} conTexto={conTexto} />;
}
