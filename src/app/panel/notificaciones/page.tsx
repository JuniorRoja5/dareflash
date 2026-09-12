import Link from "next/link";

import { TipoNotificacionSchema } from "@/config/constants";
import { leerFiltrosInspector } from "@/lib/filtros-inspector";

import { EnviarAnuncio } from "./enviar-anuncio";
import { ETIQUETA_TIPO } from "./etiquetas";
import { InspectorNotificaciones } from "./inspector-notificaciones";
import { ListaAnuncios } from "./lista-anuncios";

export const metadata = { title: "Notificaciones · Panel" };
export const dynamic = "force-dynamic";

const ESTILO_TITULO = {
  fontFamily: "var(--font-display)",
  fontVariationSettings: '"wght" 720, "wdth" 112',
} as const;

const TITULO_SECCION = "mb-3 text-sm font-semibold tracking-widest text-text-dim uppercase";
const CAMPO =
  "mt-1 min-h-[40px] w-full rounded-sm border border-line bg-raised px-3 text-sm font-normal tracking-normal text-text normal-case";

/**
 * NOTIFICACIONES (Fase 4): enviar anuncios y revisar lo emitido.
 *
 *  - ENVIAR: crea el anuncio y encola su reparto (ver `anuncios.ts`). La pantalla no reparte nada.
 *  - ANUNCIOS ENVIADOS: con su progreso real (COUNT de sus avisos sobre el objetivo), por keyset.
 *  - INSPECTOR: las notificaciones de todas las cuentas, filtrables por usuario, tipo y fecha, por
 *    keyset y sin la clave del hecho. Los filtros van por URL: el enlace se puede compartir.
 *
 * SEGURIDAD heredada: cuelga de /panel (`protegerPanel()` en el layout). Los endpoints que usa se
 * protegen ellos mismos.
 */
export default async function NotificacionesPanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const valor = (k: string): string | null => (typeof sp[k] === "string" ? sp[k] : null);
  const { filtros, valores, consulta } = leerFiltrosInspector({
    usuario: valor("usuario"),
    tipo: valor("tipo"),
    desde: valor("desde"),
    hasta: valor("hasta"),
  });

  const { prisma } = await import("@/server/db/client");
  const { inspeccionarNotificaciones, listarAnuncios, tamanoAudiencia } =
    await import("@/server/services/anuncios");
  const [anuncios, inspector, audiencia] = await Promise.all([
    listarAnuncios(prisma),
    inspeccionarNotificaciones(prisma, filtros),
    tamanoAudiencia(prisma),
  ]);

  return (
    <div className="df-rise space-y-10">
      <div>
        <h1 className="text-2xl leading-none text-text" style={ESTILO_TITULO}>
          Notificaciones
        </h1>
        <p className="mt-2 text-sm text-text-dim">
          Anuncios a los usuarios y la revisión de todo lo que el sistema ha avisado.
        </p>
      </div>

      <EnviarAnuncio audiencia={audiencia} />

      <section>
        <h2 className={TITULO_SECCION}>Anuncios enviados</h2>
        {/* La clave cambia con el anuncio más nuevo: tras enviar uno, la lista se rehace. */}
        <ListaAnuncios
          key={anuncios.items[0]?.id ?? "vacio"}
          inicial={anuncios.items}
          cursorInicial={anuncios.nextCursor}
        />
      </section>

      <section id="inspector">
        <h2 className={TITULO_SECCION}>Inspector de notificaciones</h2>
        <form
          method="get"
          action="/panel/notificaciones#inspector"
          className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_10rem_10rem_auto] xl:items-end"
        >
          <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
            Usuario
            <input
              type="text"
              name="usuario"
              defaultValue={valores.usuario}
              placeholder="@usuario"
              className={CAMPO}
            />
          </label>
          <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
            Tipo
            <select name="tipo" defaultValue={valores.tipo} className={CAMPO}>
              <option value="">Todos</option>
              {TipoNotificacionSchema.options.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
            Desde (UTC)
            <input type="date" name="desde" defaultValue={valores.desde} className={CAMPO} />
          </label>
          <label className="block text-2xs font-semibold tracking-widest text-text-dim uppercase">
            Hasta (UTC)
            <input type="date" name="hasta" defaultValue={valores.hasta} className={CAMPO} />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-[40px] rounded-sm border border-line px-4 text-sm font-medium text-text transition-colors hover:bg-raised"
            >
              Filtrar
            </button>
            {consulta ? (
              <Link
                href="/panel/notificaciones#inspector"
                className="flex min-h-[40px] items-center rounded-sm px-3 text-sm text-text-dim hover:text-text"
              >
                Quitar filtros
              </Link>
            ) : null}
          </div>
        </form>
        <InspectorNotificaciones
          key={consulta}
          inicial={inspector.items}
          cursorInicial={inspector.nextCursor}
          consulta={consulta}
        />
      </section>
    </div>
  );
}
