import { Avatar } from "@/components/ui/avatar";
import { InsigniaNivel } from "@/components/ui/insignia-nivel";
import { MSG_EMAIL_NO_DISPONIBLE } from "@/config/constants";
import { nombreMostrado } from "@/lib/identidad";
import type { FichaCuenta } from "@/server/services/cuentas-panel";

import { AccionesCuenta } from "./acciones-cuenta";
import { ETIQUETA_ACTIVA, ETIQUETA_ROL, ETIQUETA_SUSPENDIDA } from "./etiquetas";
import { VerEmail } from "./ver-email";

const DATO = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/**
 * LA FICHA DE UNA CUENTA. Quién es, qué es y desde cuándo; su email a petición; y las acciones de
 * gobierno, que viven AQUÍ y no en cada fila de la lista: gobernar a alguien es una decisión sobre una
 * persona concreta, y se toma habiéndola mirado.
 *
 * LO QUE NO ESTÁ, y su ausencia es la pieza: ni ajuste de puntos ni historial del ledger. Los puntos
 * se enseñan como CIFRA, en solo lectura, porque decir cuánto tiene alguien ayuda a entender su
 * cuenta; moverlos es otra cosa y vive en `/panel/ranking`, que es del administrador. Esta pantalla
 * es del MODERADOR: si el ajuste estuviera aquí, la frontera entre moderar y tocar el saldo sería una
 * costumbre en vez de una barrera.
 */
export function Ficha({ ficha, rolMira }: { ficha: FichaCuenta; rolMira: string }) {
  const c = ficha.cuenta;

  return (
    <section
      aria-label={`Ficha de @${c.username}`}
      data-ficha={c.id}
      className="mt-8 space-y-6 rounded-sm border border-line bg-surface/60 p-5"
    >
      <div className="flex flex-wrap items-center gap-4">
        <Avatar nombre={c.username} imagen={c.image} tamano="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-text">
            {nombreMostrado(c.displayName, c.username)}
          </p>
          <p className="text-sm text-text-dim">@{c.username}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="rounded-xs border border-line px-2 py-0.5 text-2xs text-text-dim">
            {ETIQUETA_ROL[c.rol as keyof typeof ETIQUETA_ROL] ?? ETIQUETA_ROL.USER}
          </span>
          <span
            className={`rounded-xs px-2 py-0.5 text-2xs ${
              c.suspendida ? "bg-alarm/15 text-alarm" : "text-text-dim"
            }`}
          >
            {c.suspendida ? ETIQUETA_SUSPENDIDA : ETIQUETA_ACTIVA}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className={DATO}>Alta</dt>
          <dd className="mt-1 text-sm text-text tabular-nums">
            {c.alta.toLocaleDateString("es-ES", { timeZone: "UTC" })}
          </dd>
        </div>
        <div>
          <dt className={DATO}>Puntos</dt>
          <dd className="mt-1 flex items-center gap-2 text-sm text-text tabular-nums">
            {ficha.puntos.toLocaleString("es-ES")}
            <InsigniaNivel puntos={ficha.puntos} />
          </dd>
        </div>
        <div>
          <dt className={DATO}>Retos ganados</dt>
          <dd className="mt-1 text-sm text-text tabular-nums">
            {c.victorias.toLocaleString("es-ES")}
          </dd>
        </div>
        <div>
          <dt className={DATO}>Email</dt>
          <dd className="mt-1">
            <VerEmail userId={c.id} aviso={MSG_EMAIL_NO_DISPONIBLE} />
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <AccionesCuenta
          userId={c.id}
          handle={c.username}
          rolMira={rolMira}
          rolDestino={c.rol}
          suspendida={c.suspendida}
        />
      </div>
    </section>
  );
}
