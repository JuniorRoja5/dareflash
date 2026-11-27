import { Enlace } from "@/components/enlace";
import { redirigir } from "@/server/redirigir";

import { Boton } from "@/components/ui/boton";
import { NOTIF_PAGINA } from "@/config/constants";
import { haceCuanto } from "@/lib/notificaciones-vista";
import { textos, textosRicos } from "@/textos/servidor";

import { MarcarLeidasAlVer } from "./marcar-leidas";

export async function generateMetadata() {
  return { title: (await textos("titulos"))("notificaciones") };
}
export const dynamic = "force-dynamic";

/** "Ahora" del render. Fuera del componente: el reloj es de la petición, no un efecto del pintado. */
function instante(): number {
  return Date.now();
}

/**
 * /notificaciones — TODOS los avisos del usuario de la SESIÓN, por páginas. Es adonde lleva "Ver todas"
 * del desplegable de la campana (escritorio) y la entrada de /perfil (móvil).
 *
 * APROVECHA EL ANCHO en vez de hacer scroll infinito (decisión de producto): rejilla de 1/2/3 columnas y
 * páginas de `NOTIF_PAGINA` (3 x 6), con enlaces a la página siguiente. La paginación es KEYSET por la
 * URL (`?cursor=`), servida por el servidor: sin estado en el cliente y sin OFFSET.
 *
 * Al ENSEÑAR los avisos, los no leídos se marcan como leídos con `MarcarLeidasAlVer` (POST con CSRF,
 * nunca por este GET). Sin sesión -> a /entrar con la vuelta aquí.
 */
export default async function NotificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();
  if (!user) return redirigir(`/entrar?siguiente=${encodeURIComponent("/notificaciones")}`);

  const { cursor } = await searchParams;
  const { prisma } = await import("@/server/db/client");
  const { listarNotificaciones } = await import("@/server/services/notificaciones");
  const pagina = await listarNotificaciones(prisma, user.userId, {
    cursor: cursor ?? null,
    limite: NOTIF_PAGINA,
  });
  const ahoraMs = instante();
  const { idiomaDeLaPeticion, zonaDeLaPeticion } = await import("@/server/formato-peticion");
  const [idioma, zona] = await Promise.all([idiomaDeLaPeticion(), zonaDeLaPeticion()]);
  const sinLeer = pagina.items.filter((i) => !i.leida).map((i) => i.id);
  const [t, tr, tt] = await Promise.all([
    textos("notificaciones"),
    textosRicos("notificaciones"),
    textos("tiempoRelativo"),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8 lg:py-12">
      <h1
        className="mb-6 text-2xl leading-none text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 720, "wdth" 112',
        }}
      >
        {t("titulo")}
      </h1>

      {pagina.items.length === 0 ? (
        // Vacío = invitación a actuar (brief v2), no un mensaje triste.
        <div className="rounded-sm border border-line bg-surface/40 p-8 text-center">
          <p className="text-sm text-text-dim">{cursor ? t("vacioAntiguos") : t("vacio")}</p>
          <Boton
            href={cursor ? "/notificaciones" : "/retos"}
            variante="secundario"
            className="mt-4"
          >
            {cursor ? t("volverRecientes") : t("explorarRetos")}
          </Boton>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pagina.items.map((i) => (
            <li key={i.id}>
              <Enlace
                href={i.href}
                className="flex h-full gap-3 rounded-sm border border-line bg-surface/60 p-4 transition-colors duration-150 ease-mechanical hover:bg-raised"
              >
                {/* Punto de "nuevo": NEUTRO. El dinero tiene su color y la acción el suyo; esto no es ni una
                    cosa ni la otra. */}
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.leida ? "bg-transparent" : "bg-text"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${i.leida ? "text-text-dim" : "text-text"}`}>
                    {i.leida ? i.texto : tr("avisoNuevo", { oculto: {} }, { texto: i.texto })}
                  </span>
                  <span className="mt-1 block text-2xs text-text-dim">
                    {haceCuanto(tt, i.creadaMs, ahoraMs, idioma, zona)}
                  </span>
                </span>
              </Enlace>
            </li>
          ))}
        </ul>
      )}

      {pagina.items.length > 0 && (cursor || pagina.nextCursor) ? (
        <nav aria-label={t("paginasAria")} className="mt-8 flex flex-wrap gap-3">
          {cursor ? (
            <Boton href="/notificaciones" variante="secundario">
              {t("volverRecientes")}
            </Boton>
          ) : null}
          {pagina.nextCursor ? (
            <Boton
              href={`/notificaciones?cursor=${encodeURIComponent(pagina.nextCursor)}`}
              variante="secundario"
            >
              {t("verAntiguas")}
            </Boton>
          ) : null}
        </nav>
      ) : null}

      <MarcarLeidasAlVer ids={sinLeer} />
    </div>
  );
}
