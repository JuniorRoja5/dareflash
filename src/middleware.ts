import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";

/**
 * Enrutado de la RAIZ "/" por dispositivo (decidido en SERVIDOR -> sin parpadeo): escritorio entra a
 * la portada `/inicio`, movil al `/feed` inmersivo. `userAgent()` de next/server da `device.type`;
 * la regla es: `mobile` -> /feed; cualquier otro (incl. tablet o indefinido) -> /inicio.
 *
 * OBLIGATORIO no cacheable: la respuesta lleva `Cache-Control: no-store` + `Vary: User-Agent`. Detras
 * de Caddy, una "/" cacheada serviria la redireccion equivocada a otro dispositivo. Solo actua sobre
 * "/" (ver `config.matcher`); el resto de rutas no pasan por aqui.
 */
export function middleware(req: NextRequest): NextResponse {
  const { device } = userAgent(req);
  const destino = device.type === "mobile" ? "/feed" : "/inicio";
  const url = req.nextUrl.clone();
  url.pathname = destino;
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "User-Agent");
  return res;
}

export const config = { matcher: "/" };
