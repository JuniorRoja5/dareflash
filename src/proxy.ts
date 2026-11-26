import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";

import { IDIOMAS_PUBLICADOS, SESSION_COOKIE } from "@/config/constants";
import { env } from "@/config/env";
import {
  CABECERA_IDIOMA,
  CABECERA_RUTA,
  COOKIE_IDIOMA,
  esRutaSinIdioma,
  IDIOMA_PSEUDO,
  IDIOMA_RAIZ,
  type IdiomaDeTextos,
  ruta,
  separarIdioma,
} from "@/lib/idioma-ruta";

/**
 * ¿Se sirve el pseudo-idioma `xx`? SOLO en desarrollo (Fase 11 · P5b1). Se lee `env` SOLO cuando la URL
 * lleva `/xx`: el resto de páginas no dependen de él.
 */
function pseudoPublicado(): boolean {
  return env.NODE_ENV === "development";
}

/** ¿Se sirve este prefijo? Los publicados, y el pseudo-idioma solo en desarrollo. */
function prefijoServido(prefijo: IdiomaDeTextos): boolean {
  if (prefijo === IDIOMA_PSEUDO) return pseudoPublicado();
  return IDIOMAS_PUBLICADOS.includes(prefijo);
}

/**
 * PROXY (antes `middleware`; renombrado en Next 16 — misma funcionalidad, ver
 * node_modules/next/dist/docs/.../16-proxy.md). Corre ANTES de renderizar. Solo mira la URL y las
 * cookies: ni E/S ni consultas (corre en cada página). La seguridad de verdad la aplica el servidor.
 *
 *  0) EL IDIOMA (Fase 11 · P5a; ver `lib/idioma-ruta`). El castellano vive en la raíz y los demás con
 *     prefijo (`/en/feed`). Aquí:
 *       - `/es/…` → 308 a la misma ruta sin prefijo (una sola URL por página);
 *       - un prefijo de un idioma NO publicado (`IDIOMAS_PUBLICADOS`) → 404, y con prefijo, las rutas
 *         que no llevan idioma (`/en/panel`, `/en/api`, `/en/ir`) → 404 siempre;
 *       - si no, la petición sigue a la ruta SIN prefijo (reescritura, la URL del navegador no cambia)
 *         con dos cabeceras: `x-df-idioma` (el idioma) y `x-df-ruta` (la ruta sin prefijo, para la
 *         canónica y el `hreflang`). Las dos se PISAN siempre: si las manda el cliente, no llegan.
 *       - y la respuesta deja el idioma en la cookie `df-idioma` si ha cambiado, para la API (P5b3).
 *
 *  1) ENRUTADO de la RAIZ "/" por dispositivo (decidido en SERVIDOR -> sin parpadeo):
 *     escritorio entra a la portada `/inicio`, movil al `/feed` inmersivo. `userAgent()`
 *     de next/server da `device.type`; la regla es: `mobile` -> /feed; cualquier otro
 *     (incl. tablet o indefinido) -> /inicio. OBLIGATORIO no cacheable: la respuesta lleva
 *     `Cache-Control: no-store` + `Vary: User-Agent`. Detras de Caddy, una "/" cacheada
 *     serviria la redireccion equivocada a otro dispositivo. Con prefijo, igual: `/en` -> `/en/inicio`.
 *
 *  2) GATE de acciones PROTEGIDAS (capa de UX). Modelo: publico = ver feed/retos/perfiles;
 *     protegido = crear/subir/votar/comentar. Un ANONIMO (sin cookie de sesion) que pisa una
 *     ruta protegida se REDIRIGE a /entrar?siguiente=<ruta-original> para volver tras entrar
 *     (con prefijo: `/en/crear` -> `/en/entrar?siguiente=/en/crear`).
 *     Aqui NO se verifica la firma de la sesion: basta "no hay cookie => anonimo". Si la cookie
 *     existe pero es invalida/caducada, el gate deja pasar y el SERVIDOR (page/endpoint) la
 *     rechaza (la subida ya devuelve 401). Esto solo evita que un invitado llegue a una pantalla
 *     que no puede usar.
 *
 *     OJO con el PREFETCH: `<Link>` pre-carga /crear también al invitado, y el router de cliente
 *     GUARDA este redirect. Por eso el login navega en DURO (`src/lib/navegacion-dura.ts`): con un
 *     `router.push`, el usuario ya logueado seguía cayendo en /entrar por la redirección guardada.
 *
 * El `matcher` (abajo) deja fuera lo que no es una página de la app: `_next`, `/api`, `/ir`, el panel y
 * los ficheros de metadatos. `/entrar` SÍ pasa ahora (para su idioma y su canónica), pero el proxy
 * nunca lo redirige: el redirect del login tiene que terminar.
 */

/**
 * Prefijos de rutas PROTEGIDAS (requieren sesion), SIN prefijo de idioma. Para anadir una: agrega su
 * prefijo AQUI (el matcher ya deja pasar todas las paginas).
 */
const RUTAS_PROTEGIDAS = ["/crear"] as const;

/** Una ruta esta protegida si coincide con un prefijo o cuelga de el (`/crear` o `/crear/...`). */
function estaProtegida(pathname: string): boolean {
  return RUTAS_PROTEGIDAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** 404 con la página de «no existe» de la app: se reescribe a una ruta que no existe. */
function noExiste(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/_no-existe";
  url.search = "";
  return NextResponse.rewrite(url, { request: { headers: cabeceras(req, IDIOMA_RAIZ, null) } });
}

/** Las cabeceras de la petición con las NUESTRAS puestas (las del cliente, pisadas). */
function cabeceras(req: NextRequest, idioma: string, resto: string | null): Headers {
  const h = new Headers(req.headers);
  h.delete(CABECERA_IDIOMA);
  h.delete(CABECERA_RUTA);
  h.set(CABECERA_IDIOMA, idioma);
  if (resto !== null) h.set(CABECERA_RUTA, resto);
  return h;
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const { prefijo, resto } = separarIdioma(pathname);
  const idioma = prefijo ?? IDIOMA_RAIZ;

  // 0) El idioma de la URL.
  if (prefijo === IDIOMA_RAIZ) {
    const url = req.nextUrl.clone();
    url.pathname = resto;
    return NextResponse.redirect(url, 308);
  }
  if (prefijo !== null && (!prefijoServido(prefijo) || esRutaSinIdioma(resto))) {
    return noExiste(req);
  }

  // 1) Enrutado de la RAIZ por dispositivo (sin tocar la logica ni las cabeceras).
  if (resto === "/") {
    const { device } = userAgent(req);
    const destino = device.type === "mobile" ? "/feed" : "/inicio";
    const url = req.nextUrl.clone();
    url.pathname = ruta(idioma, destino);
    const res = NextResponse.redirect(url);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Vary", "User-Agent");
    return res;
  }

  // 2) Gate: anonimo (sin cookie) en ruta protegida -> a /entrar con la ruta de vuelta.
  if (estaProtegida(resto)) {
    const tieneSesion = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
    if (!tieneSesion) {
      const url = req.nextUrl.clone();
      // `siguiente` es SOLO una ruta LOCAL: se toma del propio request (pathname + query),
      // nunca una URL absoluta externa. Al validarla en /entrar se corta el open-redirect.
      const siguiente = `${pathname}${search}`;
      url.pathname = ruta(idioma, "/entrar");
      url.search = "";
      url.searchParams.set("siguiente", siguiente);
      return NextResponse.redirect(url);
    }
  }

  const peticion = { request: { headers: cabeceras(req, idioma, resto) } };
  if (prefijo === null) return conCookieDeIdioma(req, NextResponse.next(peticion), idioma);
  const url = req.nextUrl.clone();
  url.pathname = resto;
  return conCookieDeIdioma(req, NextResponse.rewrite(url, peticion), idioma);
}

/**
 * LA COOKIE `df-idioma` (P5b3): el idioma de la página que se sirve, para que la API —que no pasa por
 * aquí— responda en él. SOLO SI CAMBIA: reescribirla en cada respuesta sería un `Set-Cookie` en cada
 * página para nada (y una respuesta con `Set-Cookie` es más difícil de cachear). Sin script ni JS: la
 * pone la respuesta. No es secreta ni identifica a nadie; `httpOnly` porque nadie en el navegador la lee.
 */
function conCookieDeIdioma(req: NextRequest, res: NextResponse, idioma: string): NextResponse {
  if (req.cookies.get(COOKIE_IDIOMA)?.value === idioma) return res;
  res.cookies.set(COOKIE_IDIOMA, idioma, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/**
 * Todas las páginas de la app pasan por aquí; fuera: `_next`, `/api`, `/ir`, el panel y los ficheros
 * de metadatos (iconos, robots). Con prefijo de idioma pasa TODO (`/en/panel` tiene que dar 404).
 */
export const config = {
  matcher: [
    "/((?!(?:_next|api|ir|panel|img)(?:/|$)|(?:icon\\.svg|apple-icon\\.png|robots\\.txt)$).*)",
  ],
};
