import { ETIQUETA_RETO_PROXIMAMENTE } from "@/config/constants";

/**
 * LA CHAPA DE UN RETO QUE AÚN NO HA ABIERTO.
 *
 * ┌─ POR QUÉ HACE FALTA UNA CHAPA SI YA HAY UNA CUENTA ATRÁS ──────────────────────────────────┐
 * │ Porque la cuenta atrás son los mismos dígitos en los dos casos. Un "1 d 04 h" junto a un     │
 * │ premio se lee como el tiempo que queda para PARTICIPAR, y en un reto sin abrir significa lo  │
 * │ contrario. El marcador ya antepone "Abre en", pero eso vive en la barra de abajo, sobre la   │
 * │ portada; la chapa lo dice arriba, donde la vista aterriza primero al recorrer una rejilla.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EN `--df-time`, NO EN EL ACENTO NI EN EL ORO ─────────────────────────────────────────────┐
 * │ Esto habla de TIEMPO —cuándo empieza—, y el sistema ya tiene un token para eso: el mismo de  │
 * │ la cuenta atrás que va justo debajo, así que la chapa y el número dicen lo mismo con el mismo │
 * │ color. `--df-action` es del CTA y del Boost; `--vip-gold` es de la suscripción. Ninguno de    │
 * │ los dos significa "todavía no".                                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MISMA FORMA que `ChapaExclusivo` —fondo oscuro translúcido, filete del color, texto en
 * versalitas— porque viven en el mismo sitio de la misma tarjeta y pueden salir las dos a la vez:
 * dos chapas con dos formas distintas en la misma esquina se leen como dos cosas sin relación.
 */
export function ChapaProximamente({ clase = "" }: { clase?: string }) {
  return (
    <span
      data-reto-chapa-proximamente
      className={`pointer-events-none inline-flex items-center rounded-full border px-2 py-1 text-2xs font-semibold tracking-widest uppercase ${clase}`}
      style={{
        color: "var(--df-time)",
        borderColor: "color-mix(in srgb, var(--df-time) 45%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--df-void) 72%, transparent)",
      }}
    >
      {ETIQUETA_RETO_PROXIMAMENTE}
    </span>
  );
}
