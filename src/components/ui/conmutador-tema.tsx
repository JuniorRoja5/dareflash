"use client";

import { useState } from "react";

import { atributoTema, cookieDeTema, TEMA_COLOR_BARRA, temaContrario, type Tema } from "@/lib/tema";

/**
 * CONMUTADOR DE TEMA (claro/oscuro) del sitio público. Un interruptor, no un menú: solo hay dos.
 *
 * El cambio es INMEDIATO y sin recargar: se escribe el atributo en `<html>` —de ahí cuelga toda la
 * paleta (ver `globals.css`)— y se guarda la cookie para que el SERVIDOR pinte ya con ese tema la
 * próxima petición. Ese orden importa: si solo se guardara la cookie, el tema no cambiaría hasta
 * navegar; si solo se cambiara el atributo, al recargar volvería el anterior.
 *
 * `inicial` lo da el servidor (leyó la cookie), así que el primer render del cliente coincide con el
 * HTML recibido: ni parpadeo ni aviso de hidratación.
 *
 * NO aparece en el PANEL: el panel es oscuro siempre y no tiene tema que elegir.
 */
export function ConmutadorTema({
  inicial,
  className = "",
  conTexto = false,
}: {
  inicial: Tema;
  className?: string;
  /** Con etiqueta y a lo ancho (la columna de acciones del perfil, que es la vía del MÓVIL); sin
   *  ella, el botón de icono del cromo de escritorio. Mismo botón, dos sitios. */
  conTexto?: boolean;
}) {
  const [tema, setTema] = useState<Tema>(inicial);
  const destino = temaContrario(tema);
  const etiqueta = destino === "claro" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";

  function cambiar(): void {
    setTema(destino);
    const raiz = document.documentElement;
    raiz.dataset.theme = atributoTema(destino);
    document.cookie = cookieDeTema(destino);
    // La barra del navegador también: en móvil se queda oscura sobre una página blanca si no.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", TEMA_COLOR_BARRA[destino]);
  }

  const icono = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {destino === "claro" ? (
        // Vas a ir a claro -> sol.
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </>
      ) : (
        // Vas a ir a oscuro -> luna.
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8.2 8.2 0 0 0-1.3.6A8 8 0 0 0 12 20a8 8 0 0 0 8-5.5z" />
      )}
    </svg>
  );

  if (conTexto) {
    return (
      <button
        type="button"
        onClick={cambiar}
        className={`flex w-full items-center justify-center gap-2 rounded-sm border border-line py-3 text-sm font-medium text-text-dim transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised hover:text-text ${className}`}
      >
        {icono}
        {etiqueta}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cambiar}
      // El nombre accesible dice lo que VA A PASAR, no en qué tema estás: es un botón, no un estado.
      aria-label={etiqueta}
      title={destino === "claro" ? "Tema claro" : "Tema oscuro"}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-sm text-text-dim transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised hover:text-text ${className}`}
    >
      {icono}
    </button>
  );
}
