"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentProps, useCallback, useMemo } from "react";

import { ruta, rutaSinIdioma } from "@/lib/idioma-ruta";
import { navegarDuro } from "@/lib/navegacion-dura";

import { useIdiomaDeLaPagina } from "./formato-provider";

/**
 * LOS ENLACES Y LAS NAVEGACIONES QUE CONSERVAN EL IDIOMA (Fase 11 · P5a). El ÚNICO sitio de la app de
 * usuario que importa `next/link` o llama a `router.push/replace` / `navegarDuro`: todo enlace interno
 * pasa por aquí y sale con el prefijo del idioma de la página (`/retos` → `/en/retos` en inglés; en
 * castellano, igual). Lo fija `enlaces-con-idioma`, que nombra el fichero que se lo salte.
 *
 * Un `href` se escribe SIN idioma (`/retos`), y `ruta()` pone el que toca: es idempotente (lo que ya
 * trae prefijo sale igual) y deja como están lo externo, las anclas y las rutas sin idioma (panel, API,
 * `/ir`). El panel tiene su propio `next/link`: no se traduce ni lleva prefijo.
 */

type PropsEnlace = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/** `<Link>` de Next con el idioma de la página. Mismas props, `href` siempre texto. */
export function Enlace({ href, ...props }: PropsEnlace) {
  const idioma = useIdiomaDeLaPagina();
  return <Link href={ruta(idioma, href)} {...props} />;
}

/**
 * La ruta de la página SIN prefijo de idioma (`/inicio` también en `/en/inicio`): la que se COMPARA con
 * una ruta escrita (qué pestaña está activa, si estamos en la portada). `usePathname()` a secas da la del
 * navegador, con prefijo; esa es la buena para volver a la misma página (`siguiente=`), no para comparar.
 */
export function useRutaSinIdioma(): string {
  return rutaSinIdioma(usePathname());
}

/** `router.push/replace` con el idioma de la página. Un hook porque el idioma sale del proveedor. */
export function useNavegar() {
  const router = useRouter();
  const idioma = useIdiomaDeLaPagina();
  // Memoizado: hay quien lo pone en las dependencias de un `useEffect` (los avisos que limpian la
  // URL); un objeto nuevo en cada render repetiría el efecto en cada render.
  return useMemo(
    () => ({
      push: (href: string, opciones?: Parameters<typeof router.push>[1]) =>
        router.push(ruta(idioma, href), opciones),
      replace: (href: string, opciones?: Parameters<typeof router.replace>[1]) =>
        router.replace(ruta(idioma, href), opciones),
    }),
    [router, idioma],
  );
}

/**
 * La navegación DURA (`navegarDuro`: la del login, el logout y el «entra para votar») con el idioma de la
 * página. Aparte de `useNavegar` porque no necesita el router: solo el idioma.
 */
export function useNavegarDuro(): (href: string) => void {
  const idioma = useIdiomaDeLaPagina();
  return useCallback((href: string) => navegarDuro(ruta(idioma, href)), [idioma]);
}
