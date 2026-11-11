/**
 * EL TELÓN DE LA PORTADA — el fondo fijo detrás de todo el contenido de `/inicio`: el `void` del tema
 * y, encima, el velo (`--df-velo-fondo`), oscuro en el tema oscuro y blanco liso en el claro.
 *
 * ┌─ AQUÍ HUBO UN VÍDEO, Y SE FUE (P14, 2026-11-11) ───────────────────────────────────────────────┐
 * │ Era un .mp4 en bucle de 17,4 MB que se bajaba en la primera visita de escritorio en oscuro. Se   │
 * │ quitó del todo: en oscuro pesaba lo que pesa una portada entera muchas veces, y en claro ya no   │
 * │ se pintaba (la portada clara va en blanco, decisión de Sergio). Lo que queda es lo que ya veían  │
 * │ el móvil, el movimiento reducido y el tema claro: este telón. Un guard (`portada-sin-video`)     │
 * │ falla si vuelve un `<video>` o un `.mp4` a la portada.                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DÓNDE MONTARLO: es `position: fixed`, así que ningún ancestro puede crearle un bloque contenedor
 * (`transform`, `filter`, `backdrop-filter`, `will-change`, `contain`): va FUERA del contenedor de la
 * página y del hero, que anima `transform` (`df-rise`). Server Component: no hay nada que decidir en
 * el cliente.
 */
export function TelonPortada() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-void">
      <div className="absolute inset-0" style={{ background: "var(--df-velo-fondo)" }} />
    </div>
  );
}
