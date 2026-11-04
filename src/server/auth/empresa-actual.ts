/**
 * EL CHOKEPOINT DEL PORTAL DE EMPRESA (Fase 9 · P1).
 *
 * La pregunta que hay que poder contestar sin leer código es: «¿por qué la empresa A no puede ver
 * nada de la B?». «Porque todas las consultas filtran» no es una respuesta: es una promesa que se
 * rompe el día que alguien añade la consulta número quince. Esta fase ya pagó esa factura —el
 * auto-ocultado filtraba en una superficie y no en la otra, con la suite en verde—, así que el
 * aislamiento se construye para que NO SE PUEDA escribir la consulta sin el filtro:
 *
 *  1. ESTE es el único sitio de todo el código donde se obtiene un `empresaId`. Sale de la SESIÓN,
 *     nunca del cuerpo ni de la query de la petición: un `empresaId` que viene del cliente es un
 *     IDOR con otro nombre.
 *  2. Los servicios del portal reciben ese id como PARÁMETRO OBLIGATORIO (ver
 *     `services/empresas.ts`). Un filtro opcional se puede olvidar y el código compila; un
 *     parámetro obligatorio no compila si falta, y `typecheck` corre en el pre-commit.
 *
 * Y hereda las barreras de siempre: sesión válida y EMAIL VERIFICADO, que es la barrera antifraude
 * de cualquier acción con efectos. No se reimplementa ninguna de las dos: es `requireVerifiedUser`.
 */
import "server-only";

import type { EstadoEmpresa } from "@/config/constants";
import { empresaDeUsuario, type EmpresaDeSesion } from "@/server/services/empresas";

import { requireVerifiedUser } from "./rbac";
import type { SessionUser } from "./session";

/**
 * No tiene empresa todavía. Es un estado NORMAL (acaba de llegar al portal), no un error de
 * permisos: quien lo captura manda a la pantalla de alta. Tiene su propio tipo para que una
 * superficie no lo confunda con un 403 y le cuente a nadie que existe algo que no es suyo.
 */
export class SinEmpresa extends Error {
  constructor() {
    super("SIN_EMPRESA");
    this.name = "SinEmpresa";
  }
}

export interface SesionEmpresa {
  user: SessionUser;
  empresa: EmpresaDeSesion | null;
}

/**
 * Quién mira y QUÉ empresa tiene, si tiene. `null` es una respuesta legítima y la usa la pantalla de
 * alta. Lanza `AuthError` si no hay sesión o el correo no está verificado.
 */
export async function empresaDeLaSesion(): Promise<SesionEmpresa> {
  const user = await requireVerifiedUser();
  const { prisma } = await import("@/server/db/client");
  return { user, empresa: await empresaDeUsuario(prisma, user.userId) };
}

export interface AmbitoEmpresa {
  user: SessionUser;
  /** EL ÁMBITO. Lo que se pasa a los servicios, y lo único que los autoriza. */
  empresaId: string;
  estado: EstadoEmpresa;
}

/**
 * EXIGE una empresa y devuelve su ámbito. Es el guard de todas las superficies del portal que leen o
 * escriben datos de la empresa.
 *
 * NO filtra por estado: una empresa pendiente entra (su pantalla es donde se le cuenta que está
 * pendiente) y una suspendida también (ve lo suyo y no crea nada). Lo que puede HACER con ese estado
 * lo decide `puedeOperarEmpresa` (`lib/empresa`, pura). Negarle la entrada a quien está pendiente
 * sería dejarle sin ningún sitio donde leer que está pendiente, y eso es un correo a soporte.
 */
export async function requireEmpresa(): Promise<AmbitoEmpresa> {
  const { user, empresa } = await empresaDeLaSesion();
  if (!empresa) throw new SinEmpresa();
  return { user, empresaId: empresa.id, estado: empresa.estado };
}
