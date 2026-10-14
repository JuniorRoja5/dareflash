"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type SVGProps, useMemo, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { REDES_CRIPTO } from "@/config/constants";
import { delCsrf, mensajeDe, postJsonCsrf, putJsonCsrf } from "@/lib/cliente-http";
import { nombreDeMetodo, validarDestino, type DestinoRetirada } from "@/lib/retirada";
import type { MetodoPagoPropio } from "@/server/services/metodos-pago";

/**
 * DÓNDE COBRAR — los métodos guardados, en tarjetas, y el formulario para añadir o sustituir uno.
 *
 * ┌─ ESTA ES LA ÚNICA PANTALLA DONDE ALGUIEN ESCRIBE UNA DIRECCIÓN ───────────────────────────────┐
 * │ Y por eso es donde más vale la validación: si una dirección de cripto pasa mal escrita de     │
 * │ aquí, el error se congela en todas las solicitudes futuras, y un envío a la red equivocada no │
 * │ se recupera. La comprobación usa la MISMA función que el servidor (`validarDestino`), así que │
 * │ no pueden discrepar: lo de aquí solo adelanta el "no", no decide.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SE PUEDE CONFIGURAR CON EL MONEDERO VACÍO. Guardar un método no mueve dinero; esconderlo hasta
 * tener saldo solo conseguía que la primera vez que alguien gana se encontrara con dos pasos justo
 * cuando quiere cobrar. `saldoCents` NO decide si esta sección se ve —eso ya no depende del saldo—:
 * solo elige la frase, porque "configura una cuenta para cobrar" y "déjalo listo para cuando ganes"
 * le hablan a dos personas distintas.
 *
 * LO QUE SE ENSEÑA DE UN MÉTODO SON CUATRO CARACTERES. El IBAN completo no vuelve del servidor ni
 * para pintar esta lista: basta la pista para saber cuál es cuál, y lo que no viaja no se puede
 * quedar por el camino.
 *
 * "EDITAR" ES SUSTITUIR, y la pantalla lo dice. Precisamente porque el dato no vuelve, no se puede
 * rellenar el formulario con él: cambiar un método es escribirlo entero otra vez. Lo que sí se
 * conserva es que el cambio sea atómico (`PUT`, una transacción en el servidor), para que un fallo
 * a mitad no deje a nadie sin método con el IBAN ya tecleado.
 */

type Icono = (p: SVGProps<SVGSVGElement>) => React.ReactElement;

/** Geométricos y con `currentColor`, como el resto del sistema: ni ilustraciones ni emoji. */
function Svg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const IconoBanco: Icono = (p) => (
  <Svg {...p}>
    <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M3 18h18M12 3 3 7.5h18L12 3Z" />
  </Svg>
);

const IconoCripto: Icono = (p) => (
  <Svg {...p}>
    <path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z" />
    <path d="M9.5 8.5h4a2 2 0 0 1 0 4h-4m0 0h4.2a2 2 0 0 1 0 4H9.5m0-8V16m2-9.5v1.5m0 8v1.5" />
  </Svg>
);

export function MetodosDeCobro({
  metodos,
  saldoCents,
}: {
  metodos: MetodoPagoPropio[];
  saldoCents: number;
}) {
  const router = useRouter();
  /** `null` = cerrado; `""` = añadiendo uno nuevo; un id = sustituyendo ese. */
  const [editando, setEditando] = useState<string | null>(metodos.length === 0 ? "" : null);
  const [metodo, setMetodo] = useState<"BANK" | "CRYPTO">("BANK");
  const [iban, setIban] = useState("");
  const [titular, setTitular] = useState("");
  const [direccion, setDireccion] = useState("");
  const [red, setRed] = useState<(typeof REDES_CRIPTO)[number]["red"]>(REDES_CRIPTO[0].red);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  const destino: DestinoRetirada = useMemo(
    () =>
      metodo === "BANK" ? { metodo: "BANK", iban, titular } : { metodo: "CRYPTO", direccion, red },
    [metodo, iban, titular, direccion, red],
  );
  const puede = validarDestino(destino).ok && !ocupado;
  const sustituyendo = editando !== null && editando !== "";

  function limpiar() {
    setIban("");
    setTitular("");
    setDireccion("");
    setError(null);
  }

  function abrirNuevo() {
    limpiar();
    setMetodo("BANK");
    setEditando("");
  }

  /** Abre el formulario YA en el tipo y la red del método que se sustituye: lo único que se sabe. */
  function abrirSustitucion(m: MetodoPagoPropio) {
    limpiar();
    setMetodo(m.metodo === "CRYPTO" ? "CRYPTO" : "BANK");
    const suRed = REDES_CRIPTO.find((r) => r.red === m.red);
    if (suRed) setRed(suRed.red);
    setEditando(m.id);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!puede || editando === null) return;
    setError(null);
    setOcupado(true);
    const r = sustituyendo
      ? await putJsonCsrf(`/api/metodos-pago/${editando}`, destino)
      : await postJsonCsrf("/api/metodos-pago", destino);
    setOcupado(false);
    if (!r.ok) {
      setError(mensajeDe(r.data) || "No hemos podido guardar ese método.");
      return;
    }
    limpiar();
    setEditando(null);
    router.refresh();
  }

  async function borrar(metodoId: string) {
    setError(null);
    setBorrando(metodoId);
    const r = await delCsrf(`/api/metodos-pago/${metodoId}`);
    setBorrando(null);
    if (!r.ok) {
      setError(mensajeDe(r.data) || "No hemos podido borrar ese método.");
      return;
    }
    if (editando === metodoId) setEditando(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="donde-cobrar" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="donde-cobrar" className="font-medium text-text">
          Dónde cobrar
        </h2>
        {metodos.length > 0 ? (
          <span className="rounded-full border border-line px-2.5 py-0.5 text-2xs tracking-widest text-text-dim uppercase">
            {metodos.length === 1 ? "1 método" : `${metodos.length} métodos`}
          </span>
        ) : null}
      </div>

      <ul className="mt-3 space-y-2">
        {metodos.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-sm border border-line bg-surface/60 p-4 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
          >
            {/* El icono lleva el color del SIGNIFICADO del método —banco, cripto—, no un acento:
                elegir dónde cobrar no es la acción de la pantalla. */}
            <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-raised text-text-dim">
              {m.metodo === "BANK" ? <IconoBanco /> : <IconoCripto />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-text">{nombreDeMetodo(m)}</span>
              <span className="block font-mono text-xs text-text-dim">····{m.pista}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Boton variante="fantasma" onClick={() => abrirSustitucion(m)}>
                Editar
              </Boton>
              <Boton
                variante="fantasma"
                onClick={() => void borrar(m.id)}
                disabled={borrando !== null}
              >
                {borrando === m.id ? "…" : "Borrar"}
              </Boton>
            </span>
          </li>
        ))}
      </ul>

      {editando === null ? (
        <button
          type="button"
          onClick={abrirNuevo}
          className="mt-2 w-full rounded-sm border border-dashed border-line p-4 text-sm font-medium text-text-dim transition-colors duration-[var(--df-dur-fast)] ease-mechanical hover:bg-raised hover:text-text"
        >
          + Añadir método de cobro
        </button>
      ) : null}

      <p className="mt-3 max-w-prose text-xs leading-relaxed text-text-dim">
        {saldoCents > 0
          ? "Se guardan cifrados; el equipo solo los ve al procesar un cobro tuyo."
          : "Déjalos listos aunque todavía no tengas saldo: cuando ganes, cobras sin fricción. Se guardan cifrados; el equipo solo los ve al procesar un cobro tuyo."}
      </p>

      {editando !== null ? (
        <form
          onSubmit={guardar}
          className="mt-4 space-y-5 rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
          aria-label={sustituyendo ? "Sustituir método de cobro" : "Añadir método de cobro"}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-medium text-text">
              {sustituyendo ? "Sustituir este método" : "Nuevo método de cobro"}
            </h3>
            {metodos.length > 0 ? (
              <Boton variante="fantasma" onClick={() => setEditando(null)}>
                Cancelar
              </Boton>
            ) : null}
          </div>

          {sustituyendo ? (
            // Decirlo evita la pregunta "¿por qué está vacío?" y, sobre todo, evita que alguien crea
            // que el campo en blanco significa "déjalo como estaba".
            <p className="max-w-prose text-xs leading-relaxed text-text-dim">
              Escríbelo entero otra vez: guardamos los datos cifrados y no vuelven a salir del
              servidor, ni siquiera para rellenar este formulario. Al guardar, sustituye al anterior
              — y no cambia a dónde va un cobro que ya hayas pedido.
            </p>
          ) : null}

          <fieldset>
            <legend className="text-sm font-medium text-text">Tipo</legend>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ["BANK", "Banco"],
                  ["CRYPTO", "Cripto"],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setMetodo(valor)}
                  aria-pressed={metodo === valor}
                  /* NEUTRO, nunca el acento: elegir el tipo no es LA acción de la pantalla. */
                  className={`min-h-[44px] rounded-sm px-4 text-sm transition-colors duration-[var(--df-dur-fast)] ease-mechanical ${
                    metodo === valor
                      ? "bg-raised font-medium text-text"
                      : "text-text-dim hover:bg-raised hover:text-text"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </fieldset>

          {metodo === "BANK" ? (
            <>
              <Campo
                id="iban"
                label="IBAN"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                autoComplete="off"
                placeholder="ES00 0000 0000 0000 0000 0000"
              />
              <Campo
                id="titular"
                label="Nombre del titular"
                value={titular}
                onChange={(e) => setTitular(e.target.value)}
                autoComplete="off"
              />
            </>
          ) : (
            <>
              <div>
                <label htmlFor="red" className="mb-1.5 block text-sm font-medium text-text">
                  Red
                </label>
                {/* LA RED SE ELIGE DE UNA LISTA CERRADA, no se escribe: una red que no enviamos es
                    dinero perdido, así que no puede ser un campo de texto libre. */}
                <select
                  id="red"
                  value={red}
                  onChange={(e) => setRed(e.target.value as typeof red)}
                  className="min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:bg-raised"
                >
                  {REDES_CRIPTO.map((r) => (
                    <option key={r.red} value={r.red}>
                      {r.nombre} — {r.monedas}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Campo
                  id="direccion"
                  label="Dirección"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  autoComplete="off"
                />
                <p className="mt-1.5 text-xs text-text-dim">
                  Tiene que ser una dirección de la red elegida. Un envío a otra red no se recupera.
                </p>
              </div>
            </>
          )}

          {error ? (
            <p role="alert" className="text-sm text-alarm">
              {error}
            </p>
          ) : null}

          <Boton type="submit" variante="secundario" disabled={!puede}>
            {ocupado ? "Guardando…" : sustituyendo ? "Sustituir método" : "Guardar método"}
          </Boton>
        </form>
      ) : null}
    </section>
  );
}
