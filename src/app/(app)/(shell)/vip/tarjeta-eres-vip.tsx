import { formatearFechaParaQuienMira, type Idioma, type ZonaHoraria } from "@/lib/formato";
import type { VipResuelto } from "@/lib/vip";

import { CancelarVip } from "./cancelar-vip";

/**
 * YA ERES MYTHIC — el estado de tu suscripción, y la puerta para darte de baja.
 *
 * ┌─ QUIÉN DECIDE QUE ESTO SE PINTE ─────────────────────────────────────────────────────────────┐
 * │ El chokepoint, siempre: la página monta esta tarjeta cuando `vipDe(...)` dice `activo`, que   │
 * │ es `esVipActivo` comparando `periodoFin` con el reloj. NUNCA el `?suscripcion=ok` de la URL,  │
 * │ que lo escribe Stripe al devolver y puede teclear cualquiera.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LA FECHA ES LA DE VERDAD (`periodoFin`, que escribió el webhook con lo que dijo Stripe), no un
 * "se renueva el día X de cada mes" deducido: un mes con 28 días o una suscripción que empezó un
 * día 31 dejarían esa frase mintiendo sin que nada fallara.
 *
 * Y CAMBIA DE VOZ SEGÚN SE VAYA A RENOVAR O NO. Con la baja ya pedida no se dice "se renueva"
 * —sería lo contrario de lo que va a pasar— y tampoco se ofrece el botón de cancelar otra vez: ya
 * está pedido. La ruta aguanta el segundo clic igual, pero un botón que no hace nada es un botón
 * mudo.
 *
 * ┌─ SIN EMBLEMA, Y LO CAZÓ UN GUARD ───────────────────────────────────────────────────────────┐
 * │ La maqueta pone el emblema grande también aquí. Al montarlo, `vip-perfil` se puso rojo: ese │
 * │ guard exige que el emblema grande sea UNO por página, y el hero de esta misma pantalla ya    │
 * │ lleva el suyo — o sea que un VIP veía dos píldoras doradas idénticas apiladas. La tarjeta no │
 * │ se queda sin firma: el filete y el fondo dorados ya la marcan, y el título dice lo mismo que │
 * │ diría el emblema.                                                                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function TarjetaEresVip({
  vip,
  idioma,
  zona,
}: {
  vip: VipResuelto;
  idioma: Idioma;
  zona: ZonaHoraria | null;
}) {
  // El fin del periodo es un INSTANTE: en la zona de quien mira (Fase 11).
  const hasta = vip.hasta
    ? formatearFechaParaQuienMira(vip.hasta, idioma, zona, "diaFijoMesLargoAno")
    : null;

  return (
    <section
      aria-labelledby="vip-eres"
      data-eres-vip
      className="mt-10 flex flex-wrap items-center gap-4 rounded-sm border p-5"
      style={{
        borderColor: "color-mix(in srgb, var(--vip-gold) 40%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--vip-gold) 7%, transparent)",
      }}
    >
      <div className="min-w-0">
        <h2
          id="vip-eres"
          className="text-lg leading-none text-text"
          style={{
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"wght" 800, "wdth" 110',
          }}
        >
          Eres VIP Mythic
        </h2>
        <p className="mt-2 text-sm text-text-dim">
          {vip.terminaAlFinal
            ? hasta
              ? `Tu suscripción no se renovará. Mantienes el VIP hasta el ${hasta}.`
              : "Tu suscripción no se renovará. Mantienes el VIP hasta el fin del periodo."
            : hasta
              ? `Activa. Se renueva el ${hasta}.`
              : "Activa."}
        </p>
      </div>

      {vip.terminaAlFinal ? null : <CancelarVip className="sm:ml-auto" />}
    </section>
  );
}
