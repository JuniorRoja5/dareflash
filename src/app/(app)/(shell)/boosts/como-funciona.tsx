import { BOOST_DAILY_LIMIT, BOOST_DURACION_MIN } from "@/config/constants";
import { duracionBoostHumana } from "@/lib/boost-duracion";
import { horaDelReinicioDiario, type Idioma, type ZonaHoraria } from "@/lib/formato";
import { palabrasDuracion } from "@/textos/duracion";
import { textos } from "@/textos/servidor";

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
export async function ComoFunciona({ idioma, zona }: { idioma: Idioma; zona: ZonaHoraria | null }) {
  const [t, tdur] = await Promise.all([textos("boosts"), textos("duracion")]);
  const pasos = [
    { titulo: t("paso1Titulo"), texto: t("paso1Texto") },
    {
      titulo: t("paso2Titulo"),
      texto: t("paso2Texto", {
        duracion: duracionBoostHumana(BOOST_DURACION_MIN, palabrasDuracion(tdur, idioma)),
        n: BOOST_DAILY_LIMIT,
      }),
    },
    { titulo: t("paso3Titulo"), texto: t("paso3Texto") },
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
        {t("comoFunciona")}
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
        {/* La hora del reinicio, en la de quien mira (Fase 11); el día se sigue contando en UTC. */}
        {zona
          ? t("reinicioConHora", {
              n: BOOST_DAILY_LIMIT,
              hora: horaDelReinicioDiario(new Date(), idioma, zona),
            })
          : t("reinicioSinHora", { n: BOOST_DAILY_LIMIT })}
      </p>
    </section>
  );
}
