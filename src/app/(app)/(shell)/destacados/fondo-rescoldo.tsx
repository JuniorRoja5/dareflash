/**
 * EL FONDO AMBIENTAL DE LA VITRINA — un rescoldo de marca, lento y tenue.
 *
 * ┌─ SOLO AQUÍ, Y NO DETRÁS DE LA FILA DE LA PORTADA ─────────────────────────────────────────────┐
 * │ En /inicio la fila de destacados es una sección entre otras, y ahí ya hay un hero y un vídeo  │
 * │ de fondo: un segundo fondo animado competiría con los dos y la portada pasaría a ser una      │
 * │ feria. Esta pantalla, en cambio, ES la vitrina — el ambiente es suyo. Hay un test de que no se │
 * │ cuela en la portada.                                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NO LLEVA NI UN COLOR PROPIO: toda la pintura está en `.df-rescoldo`, que reusa `--df-glow-accion`
 * y `--df-glow-money`. Esos dos se DERIVAN de los tokens con `color-mix`, así que el rescoldo cambia
 * con la paleta y con el tema sin tocar nada aquí, y es imposible que se convierta en neón: lo que
 * hay es un tinte del acento y del dinero.
 *
 * ┌─ ES HERMANO DEL CONTENEDOR DE PÁGINA, NUNCA HIJO ─────────────────────────────────────────────┐
 * │ La capa es `position: fixed`, y un ancestro que anime `transform` —el contenedor lleva         │
 * │ `df-rise`— o que use `overflow-*-clip` le crea BLOQUE CONTENEDOR: dejaría de cubrir el         │
 * │ viewport y se quedaría recortada dentro del `div`. Es exactamente la trampa que ya enseñó el   │
 * │ fondo de vídeo de la portada, y por eso este componente se monta fuera, al lado.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * EL MOVIMIENTO ES CSS (opacidad y transform), así que la regla global de `prefers-reduced-motion`
 * lo apaga con `!important` y queda un fondo quieto — que sigue siendo el fondo que toca, no un
 * hueco. `aria-hidden`: no dice nada que haya que leer.
 */
export function FondoRescoldo() {
  return <div className="df-rescoldo" aria-hidden />;
}
