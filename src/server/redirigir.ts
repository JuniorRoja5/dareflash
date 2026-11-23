/**
 * LAS REDIRECCIONES DEL SERVIDOR CON EL IDIOMA DE LA PÁGINA (Fase 11 · P5a) — server-only. El único sitio
 * de la app de usuario que llama a `redirect` / `permanentRedirect` de Next: la ruta se escribe sin
 * idioma (`/entrar?siguiente=…`) y sale con el prefijo de la página (`/en/entrar?…`). Lo fija
 * `enlaces-con-idioma`. Como `redirect`, NO vuelve: se llama con `await` y el código de después no corre.
 */
import "server-only";

import { permanentRedirect, redirect } from "next/navigation";

import { ruta } from "@/lib/idioma-ruta";

import { idiomaDeLaPeticion } from "./formato-peticion";

export async function redirigir(href: string): Promise<never> {
  redirect(ruta(await idiomaDeLaPeticion(), href));
}

export async function redirigirPermanente(href: string): Promise<never> {
  permanentRedirect(ruta(await idiomaDeLaPeticion(), href));
}
