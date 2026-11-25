import type { CSSProperties } from "react";

import { CampoCopiable } from "@/components/ui/campo-copiable";
import { CodigoQr } from "@/components/ui/codigo-qr";
import { POINTS } from "@/config/constants";
import { textos, textosRicos } from "@/textos/servidor";

/**
 * HERO DE REFERIDOS — lo que compartes, con el mismo cuerpo que el hero de /puntos.
 *
 * MISMO IDIOMA, DISTINTO PROTAGONISTA. En /puntos el centro es el medallón de tu nivel; aquí no hay
 * nivel que enseñar, y lo que la pantalla quiere que hagas es COMPARTIR. Así que el sitio del
 * medallón lo ocupa el QR —lo único de esta página que es un objeto y no texto— y el acento va en
 * el botón de copiar el enlace, que es la acción.
 *
 * EL HALO VA EN `--df-action` porque no hay color de nivel del que tirar. Es el acento del sistema
 * y esta pantalla lo tiene bien ganado: `--df-action` marca LA acción principal, una por pantalla,
 * y aquí esa acción es invitar. Misma clase `.df-halo` que /puntos, misma fuerza por tema.
 *
 * LOS TRES CAMPOS NO SON TRES FORMAS DE LO MISMO. El enlace se pega y ya está: es lo normal, y por
 * eso su botón es el principal. El código es para donde no cabe un enlace (se dicta, se escribe en
 * una bio). Y el QR es para cuando quien invita y quien se apunta están en la misma habitación con
 * dos teléfonos, que es como pasa la mitad de las veces.
 */
export async function HeroInvitacion({
  enlace,
  codigo,
}: {
  enlace: string | null;
  codigo: string | null;
}) {
  // `CampoCopiable` lee su espacio (`copiar`) del proveedor del armazón.
  const [t, tr] = await Promise.all([textos("referidos"), textosRicos("referidos")]);
  return (
    <section
      aria-labelledby="invitar"
      style={{ "--df-halo-color": "var(--df-action)" } as CSSProperties}
      className="relative overflow-hidden rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md lg:p-10"
    >
      <span className="df-halo" aria-hidden />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-12">
        <div className="min-w-0">
          <h1
            id="invitar"
            className="text-[clamp(1.75rem,5vw,2.75rem)] leading-[1.05] text-text"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"wght" 800, "wdth" 110',
            }}
          >
            {t("titulo")}
          </h1>
          {/* LA RECOMPENSA, EN UNA LÍNEA. El importe sale de `POINTS`, nunca escrito aquí: un número
              a mano sería un segundo catálogo esperando a discrepar del que se paga. */}
          <p className="mt-3 max-w-prose text-sm text-text-dim">
            {tr(
              "recompensa",
              { resaltado: { className: "font-semibold text-text", como: "strong" } },
              { n: POINTS.INVITE_FRIEND },
            )}
          </p>

          {enlace && codigo ? (
            <div className="mt-7 space-y-4">
              {/* EL ÚNICO ACENTO DE LA PANTALLA: el sistema reserva `--df-action` para una acción
                  por pantalla, y esta es. El código va secundario porque es el plan B. */}
              <CampoCopiable id="ref-enlace" etiqueta={t("tuEnlace")} valor={enlace} principal />
              <CampoCopiable id="ref-codigo" etiqueta={t("tuCodigo")} valor={codigo} />
            </div>
          ) : (
            // Un fallo se dice y se dice qué hacer, no se deja un hueco donde había algo.
            <p className="mt-7 rounded-sm border border-line bg-raised p-4 text-sm text-text-dim">
              {t("sinEnlace")}
            </p>
          )}
        </div>

        {enlace ? (
          <div className="flex flex-col items-center gap-3 lg:items-end">
            {/* La placa del QR: fondo claro SIEMPRE (lo pide el lector, no el diseño), con un aro
                del acento para que no parezca un recorte pegado sobre la tarjeta. */}
            <div
              className="rounded-sm p-2.5"
              style={{
                backgroundColor: "var(--df-qr-fondo)",
                boxShadow:
                  "0 0 0 1px color-mix(in srgb, var(--df-action) 35%, transparent), var(--df-shadow-sm)",
              }}
            >
              <CodigoQr valor={enlace} etiqueta={t("qr")} clase="h-32 w-32 lg:h-36 lg:w-36" />
            </div>
            <p className="max-w-[9rem] text-center text-2xs text-text-dim lg:text-right">
              {t("escanear")}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
