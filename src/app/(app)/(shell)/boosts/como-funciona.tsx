import { BOOST_DAILY_LIMIT } from "@/config/constants";

/**
 * CÓMO FUNCIONA UN BOOST — las tres cosas que hay que saber antes de pagar.
 *
 * SOBRIA A PROPÓSITO: `shadow-sm`, sin halo y sin acento. La vida de la pantalla está en el hero y
 * en el botón de comprar; si este panel también brillara, no destacaría nada. Es el mismo reparto
 * que la escalera de niveles junto al hero de /puntos, y lo vigila `simetria-secciones`.
 *
 * ┌─ AQUÍ NO HAY NINGUNA CIFRA ESCRITA A MANO ────────────────────────────────────────────────────┐
 * │ El límite sale de `BOOST_DAILY_LIMIT`. Y la DURACIÓN del puesto destacado NO SE DICE: todavía │
 * │ no está decidida en el código (el esquema la deja en "~1h", que no es un número, es una nota  │
 * │ para nosotros). Escribir "1 hora" aquí sería inventarse una promesa de producto desde una      │
 * │ pantalla, que es exactamente el fallo que `panel-reto-vista` dejó prohibido.                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Y SE DICE QUE ACTIVAR NO EXISTE AÚN. Vender un crédito sin avisar de que todavía no hay botón
 * para gastarlo es cobrar por una expectativa. Cuando la activación se construya, esta línea se
 * cae — y hay un test que la exige MIENTRAS no exista, para que no se quede puesta mintiendo al
 * revés.
 */
export function ComoFunciona() {
  const pasos = [
    {
      titulo: "Compras Boosts",
      texto: "Se acreditan en tu saldo cuando el pago se confirma. No caducan nunca.",
    },
    {
      titulo: "Gastas uno para destacar",
      texto: `Cada Boost pone tu perfil en el espacio destacado. Como máximo ${BOOST_DAILY_LIMIT} veces al día.`,
    },
    {
      titulo: "Te ve quien entra",
      texto: "El espacio destacado está donde más gente pasa, no escondido en una sección.",
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
        Activar un Boost todavía no está disponible: por ahora se quedan en tu saldo, y no caducan.
      </p>
    </section>
  );
}
