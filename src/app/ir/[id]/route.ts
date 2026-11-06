/**
 * GET /ir/{id} — EL REDIRECTOR DE LA PUBLICIDAD (Fase 9 · P10): cuenta el clic y lleva a la web de la
 * campaña. Es el enlace que pone `enlaceDeCampana`, el único constructor del enlace de una pieza.
 *
 *  - El destino sale de la CAMPAÑA, no de la URL: `/ir` no es un redirector abierto, y una campaña que
 *    ya no se sirve (retirada, en revisión…) manda a la portada en vez de a su web.
 *  - El clic se cuenta con tope por IP CIFRADA, leída SOLO de X-Real-IP (la fija Caddy); por encima del
 *    tope se redirige igual, sin sumar. La IP nunca se guarda en claro.
 *  - Es un GET sin efectos que importen a nadie más que a las cifras: no pasa por `mutatingRoute` (no hay
 *    sesión que exigir: los invitados también hacen clic).
 *
 * `env` y `prisma` se cargan DENTRO del handler (`depsRuta`): nada se evalúa al construir.
 */
export const dynamic = "force-dynamic";

const ID_VALIDO = /^[a-z0-9]{10,40}$/;

function redirigir(destino: string): Response {
  return new Response(null, {
    status: 302,
    // `no-store`: cada clic tiene que llegar aquí para contarse, y el destino puede cambiar (o retirarse).
    headers: { Location: destino, "Cache-Control": "no-store" },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { depsRuta, clientIpKey } = await import("@/server/http/api");
  const { env, prisma } = await depsRuta();
  const portada = new URL("/", env.APP_URL).toString();
  const { id } = await params;
  if (!ID_VALIDO.test(id)) return redirigir(portada);

  const { clicEnCampana } = await import("@/server/services/publicidad-metricas");
  const { getRedis } = await import("@/server/cache/redis");
  // Sin la cabecera no hay con qué acotar el clic: se redirige igual, pero no cuenta.
  const ipKey = req.headers.get("x-real-ip") ? clientIpKey(req, env.AUTH_SECRET) : null;
  try {
    const destino = await clicEnCampana(prisma, { publicidadId: id, ipKey, redis: getRedis() });
    return redirigir(destino ?? portada);
  } catch {
    // Si falla la base, a la portada: un clic nunca acaba en una página de error.
    return redirigir(portada);
  }
}
