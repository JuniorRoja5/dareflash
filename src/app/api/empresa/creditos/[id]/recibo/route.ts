import { apiError, depsRuta } from "@/server/http/api";

export const dynamic = "force-dynamic";

const ID_VALIDO = /^[a-z0-9]{10,40}$/;

function redirigir(destino: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: destino, "Cache-Control": "no-store" },
  });
}

/**
 * GET /api/empresa/creditos/{id}/recibo — EL RECIBO DE STRIPE de una compra de créditos (P11): lleva a
 * la página del recibo del cobro, desde la que se descarga. «Recibo», nunca «Factura» (la factura es la
 * P13, con sus obligaciones).
 *
 * EL ÁMBITO SALE DEL CHOKEPOINT (`requireEmpresa`): el movimiento se busca CON la empresa de la sesión
 * dentro del where. El de otra empresa es un 404, igual que uno que no existe, y no se le pregunta nada
 * a Stripe. Es un GET sin efectos: no pasa por `mutatingRoute`.
 *
 * Si Stripe no está configurado o aún no tiene el recibo, vuelve al historial con un aviso en vez de
 * enseñar un error técnico.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { env, prisma } = await depsRuta();
  const { requireEmpresa } = await import("@/server/auth/empresa-actual");
  const { compraDeMiEmpresa, reciboDeMiCompra } = await import("@/server/services/creditos-compra");
  const { clienteStripe } = await import("@/server/pagos/stripe");

  let empresaId: string;
  try {
    empresaId = (await requireEmpresa()).empresaId;
  } catch {
    return apiError("NOT_FOUND", "No encontrado.", 404);
  }
  const { id } = await params;
  if (!ID_VALIDO.test(id) || !(await compraDeMiEmpresa(prisma, empresaId, id))) {
    return apiError("NOT_FOUND", "No encontrado.", 404);
  }

  const volver = new URL("/empresa/creditos?recibo=no-disponible", env.APP_URL).toString();
  try {
    const url = await reciboDeMiCompra(prisma, clienteStripe(env.STRIPE_SECRET_KEY), empresaId, id);
    return redirigir(url ?? volver);
  } catch (e) {
    console.error(`[creditos] recibo ${id}: ${e instanceof Error ? e.message : e}`);
    return redirigir(volver);
  }
}
