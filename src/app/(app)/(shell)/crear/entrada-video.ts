/**
 * CREAR · qué entradas de vídeo ofrecer, según el dispositivo. PURO y testeable (sin React ni DOM).
 *
 * En MÓVIL (puntero grueso) el `<input capture>` abre la cámara y sin `capture` abre la galería: son
 * dos acciones distintas, así que se ofrecen las dos ("Grabar" + "Galería"). En ESCRITORIO `capture` no
 * hace nada (no hay cámara de captura directa del navegador de forma fiable): ofrecer "Grabar" allí
 * engañaría, así que se ofrece una sola entrada honesta ("Elegir vídeo").
 */
export type ClaveEntrada = "grabar" | "galeria" | "elegir";

export interface EntradaVideo {
  clave: ClaveEntrada;
  label: string;
  /** `true` => el <input> lleva `capture="user"` (abre cámara en móvil). */
  capture: boolean;
}

export function entradasVideo(esTactil: boolean): EntradaVideo[] {
  if (esTactil) {
    return [
      { clave: "grabar", label: "Grabar", capture: true },
      { clave: "galeria", label: "Galería", capture: false },
    ];
  }
  return [{ clave: "elegir", label: "Elegir vídeo", capture: false }];
}
