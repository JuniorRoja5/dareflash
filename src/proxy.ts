import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";

import { SESSION_COOKIE } from "@/config/constants";

/**
 * PROXY (antes `middleware`; renombrado en Next 16 — misma funcionalidad, ver
 * node_modules/next/dist/docs/.../16-proxy.md). Corre en el borde ANTES de renderizar.
 * Aqui hace DOS cosas, ambas de UX (la seguridad de verdad la aplica el servidor):
 *
 *  1) ENRUTADO de la RAIZ "/" por dispositivo (decidido en SERVIDOR -> sin parpadeo):
 *     escritorio entra a la portada `/inicio`, movil al `/feed` inmersivo. `userAgent()`
 *     de next/server da `device.type`; la regla es: `mobile` -> /feed; cualquier otro
 *     (incl. tablet o indefinido) -> /inicio. OBLIGATORIO no cacheable: la respuesta lleva
 *     `Cache-Control: no-store` + `Vary: User-Agent`. Detras de Caddy, una "/" cacheada
 *     serviria la redireccion equivocada a otro dispositivo.
 *
 *  2) GATE de acciones PROTEGIDAS (capa de UX). Modelo: publico = ver feed/retos/perfiles;
 *     protegido = crear/subir/votar/comentar. Un ANONIMO (sin cookie de sesion) que pisa una
 *     ruta protegida se REDIRIGE a /entrar?siguiente=<ruta-original> para volver tras entrar.
 *     Aqui NO se verifica la firma de la sesion: basta "no hay cookie => anonimo". Si la cookie
 *     existe pero es invalida/caducada, el gate deja pasar y el SERVIDOR (page/endpoint) la
 *     rechaza (la subida ya devuelve 401). Esto solo evita que un invitado llegue a una pantalla
 *     que no puede usar.
 *
 * El `matcher` (abajo) acota QUE rutas pasan por aqui: SOLO "/" y las protegidas. La navegacion
 * publica (feed, retos, perfil, inicio, /entrar, /verify, assets, /api) NO se intercepta.
 */

/**
 * Prefijos de rutas PROTEGIDAS (requieren sesion). Para anadir "votar"/"comentar" cuando
 * existan: agrega su prefijo AQUI y, ademas, al `config.matcher` de abajo (el matcher decide
 * que llega al proxy; esta lista decide que se bloquea). Los dos deben ir de la mano.
 */
const RUTAS_PROTEGIDAS = ["/crear"] as const;

/** Una ruta esta protegida si coincide con un prefijo o cuelga de el (`/crear` o `/crear/...`). */
function estaProtegida(pathname: string): boolean {
  return RUTAS_PROTEGIDAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // 1) Enrutado de la RAIZ por dispositivo (sin tocar la logica ni las cabeceras).
  if (pathname === "/") {
    const { device } = userAgent(req);
    const destino = device.type === "mobile" ? "/feed" : "/inicio";
    const url = req.nextUrl.clone();
    url.pathname = destino;
    const res = NextResponse.redirect(url);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Vary", "User-Agent");
    return res;
  }

  // 2) Gate: anonimo (sin cookie) en ruta protegida -> a /entrar con la ruta de vuelta.
  if (estaProtegida(pathname)) {
    const tieneSesion = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
    if (!tieneSesion) {
      const url = req.nextUrl.clone();
      // `siguiente` es SOLO una ruta LOCAL: se toma del propio request (pathname + query),
      // nunca una URL absoluta externa. Al validarla en /entrar se corta el open-redirect.
      const siguiente = `${pathname}${req.nextUrl.search}`;
      url.pathname = "/entrar";
      url.search = "";
      url.searchParams.set("siguiente", siguiente);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

/**
 * SOLO "/" y las rutas protegidas pasan por el proxy; el resto (publico, assets, /api) no.
 * Al anadir una nueva ruta protegida a RUTAS_PROTEGIDAS, anade tambien su patron aqui.
 */
export const config = { matcher: ["/", "/crear", "/crear/:path*"] };
