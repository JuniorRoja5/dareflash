import { BOOST_DAILY_LIMIT, BOOST_DURACION_MIN } from "@/config/constants";
import { duracionBoostHumana } from "@/lib/boost-duracion";

/**
 * CÓMO FUNCIONA UN BOOST — las tres cosas que hay que saber antes de pagar.
 *
 * SOBRIA A PROPÓSITO: `shadow-sm`, sin halo y sin acento. La vida de la pantalla está en el hero y
 * en el botón de comprar; si este panel también brillara, no destacaría nada. Es el mismo reparto
 * que la escalera de niveles junto al hero de /puntos, y lo vigila `simetria-secciones`.
 *
 * ┌─ AQUÍ NO HAY NINGUNA CIFRA ESCRITA A MANO ────────────────────────────────────────────────────┐
 * │ El límite sale de `BOOST_DAILY_LIMIT` y la duración de `BOOST_DURACION_MIN`, dicha en          │
 * │ castellano por `duracionBoostHumana` — "1 hora" escrito aquí se queda mintiendo el día que la │
 * │ duración pase a 90 minutos.                                                                   │
 * │                                                                                               │
 * │ MIENTRAS LA ACTIVACIÓN NO EXISTIÓ, LA DURACIÓN NO SE DECÍA, y no era un olvido: el esquema la │
 * │ dejaba en "~1h", que es una nota para nosotros y no un número decidido, así que escribirla     │
 * │ habría sido inventarse una promesa de producto desde una pantalla. Ahora está decidida en      │
 * │ constants, y por eso se puede decir. El aviso de "activar todavía no está disponible" se       │
 * │ retiró en la misma pieza que construyó la activación — que es lo que su guard de dos lados     │
 * │ obligaba a hacer, en vez de dejarlo puesto mintiendo al revés.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function ComoFunciona() {
  const pasos = [
    {
      titulo: "Compras Boosts",
      texto: "Se acreditan en tu saldo cuando el pago se confirma. No caducan nunca.",
    },
    {
      titulo: "Gastas uno para destacar",
      texto: `Cada Boost pone tu perfil en el espacio destacado ${duracionBoostHumana(BOOST_DURACION_MIN)}. Como máximo ${BOOST_DAILY_LIMIT} veces al día.`,
    },
    {
      titulo: "Te ve quien entra",
      texto:
        "Sales en la portada, donde más gente pasa, y el último en activar aparece primero. No está escondido en una sección.",
    },
  ];

  return (
    <section
      aria-labelledby="como-funciona"
      className="rounded-sm border border-line bg-surface/60 p-5 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
    >
      <h2
        id="como-funciona"
        className="text-sm font-semibold tracking-widest text-text-dim uppercase"
      >
        Cómo funciona
      </h2>

      <ol className="mt-4 space-y-4">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="flex gap-3">
            {/* El número del paso, neutro: ordena, no celebra. */}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-2xs font-semibold tabular-nums text-text-dim">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">{p.titulo}</span>
              <span className="mt-0.5 block text-2xs text-text-dim">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-5 border-t border-line pt-4 text-2xs text-text-dim">
        El contador de {BOOST_DAILY_LIMIT} al día se reinicia a medianoche UTC. Los Boosts sin
        gastar no caducan.
      </p>
    </section>
  );
}
