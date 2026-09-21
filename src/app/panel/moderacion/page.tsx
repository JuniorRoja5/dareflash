import { COLA_MODERACION_PAGINA } from "@/config/constants";

import { requireSeccion } from "../panel-guard";
import { seccionPorHref } from "../secciones";

import { ColaModeracion } from "./cola";

const S = seccionPorHref("/panel/moderacion")!;

export const metadata = { title: "Moderación · Panel" };
export const dynamic = "force-dynamic";

/**
 * MODERACIÓN — la cola de lo denunciado, lo más denunciado primero.
 *
 * Guard PROPIO derivado de su sección: MODERATOR (el administrador lo cumple por jerarquía). Es la
 * primera sección del panel que NO es del administrador, y la que hace que abrirlo tenga sentido.
 *
 * La primera página la sirve el servidor; las siguientes las pide la isla por cursor a
 * `/api/panel/moderacion`. Cero datos inventados: si no hay nada pendiente, lo dice.
 */
export default async function Pagina() {
  await requireSeccion("/panel/moderacion");

  const { prisma } = await import("@/server/db/client");
  const { contarDenunciasAbiertas, listarColaModeracion } =
    await import("@/server/services/cola-moderacion");
  const { firmarReproduccion } = await import("@/server/services/reproduccion-servidor");

  const [pagina, abiertas] = await Promise.all([
    listarColaModeracion(prisma, { limite: COLA_MODERACION_PAGINA, firmar: firmarReproduccion }),
    contarDenunciasAbiertas(prisma),
  ]);

  return (
    <div className="df-rise space-y-6">
      <div>
        <h1
          className="text-2xl leading-none text-text"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 720, "wdth" 112',
          }}
        >
          {S.label}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-text-dim">
          Lo que la comunidad ha denunciado y sigue sin decidir, con lo más denunciado arriba.
          Retirar oculta el contenido en todas partes; descartar lo deja como está. Las dos cosas
          cierran sus denuncias.
        </p>
        <p className="mt-2 text-2xs tracking-widest text-text-dim uppercase tabular-nums">
          {abiertas} {abiertas === 1 ? "denuncia abierta" : "denuncias abiertas"}
        </p>
      </div>

      <ColaModeracion inicial={pagina.items} cursorInicial={pagina.nextCursor} />
    </div>
  );
}
