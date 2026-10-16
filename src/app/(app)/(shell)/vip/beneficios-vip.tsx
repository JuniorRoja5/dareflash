import { BENEFICIOS_VIP } from "@/config/constants";

/**
 * UN TIC, NO UNA GEMA. La maqueta pone una gemita delante de cada línea, que es el icono de la
 * puerta del VIP en la barra — y repetirlo aquí obligaría a mantener el MISMO dibujo en dos
 * ficheros, con la garantía de que uno de los dos se queda atrás. Además dicen cosas distintas: la
 * gema identifica el producto, y lo que una lista de beneficios necesita decir es "esto lo tienes".
 * Eso es un tic.
 */
function Tic() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--vip-gold)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0"
      aria-hidden
    >
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

/**
 * LO QUE INCLUYE EL PLAN.
 *
 * ┌─ LA LISTA NO SE ESCRIBE AQUÍ ───────────────────────────────────────────────────────────────┐
 * │ Sale de `BENEFICIOS_VIP`, y eso es lo que impide que esta pantalla prometa de más. Allí cada │
 * │ línea lleva anotada la pieza que la construyó, así que añadir una obliga a poder nombrarla.  │
 * │ Escritas aquí, "mensajes ilimitados" entra de un tirón y no falla nada: la persona que paga  │
 * │ diez dólares al mes se entera sola.                                                           │
 * │                                                                                               │
 * │ NI SIQUIERA COMO "PRÓXIMAMENTE". Un beneficio con etiqueta de futuro convierte la lista de lo │
 * │ que compras en una lista de intenciones, y el que paga no distingue una de otra al decidir.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MISMO IDIOMA DE TARJETA QUE EL RESTO DE LISTAS del producto (superficie al 60%, filete, sombra
 * pequeña): la vida va en el hero, no en cada fila. `tests/simetria-secciones` lo exige.
 */
export function BeneficiosVip() {
  return (
    <section aria-labelledby="vip-incluye" className="mt-8">
      <h2
        id="vip-incluye"
        className="text-sm font-semibold tracking-widest text-text-dim uppercase"
      >
        Lo que incluye
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {BENEFICIOS_VIP.map((b) => (
          <li
            key={b}
            data-beneficio
            className="flex items-start gap-3 rounded-sm border border-line bg-surface/60 p-4 text-sm text-text shadow-[var(--df-shadow-sm)] backdrop-blur-md"
          >
            <Tic />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
