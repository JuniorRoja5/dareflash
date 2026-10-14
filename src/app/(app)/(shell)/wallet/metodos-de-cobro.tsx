"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { REDES_CRIPTO } from "@/config/constants";
import { delCsrf, mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { validarDestino, type DestinoRetirada } from "@/lib/retirada";
import type { MetodoPagoPropio } from "@/server/services/metodos-pago";

/**
 * DÓNDE COBRAR — los métodos guardados, y el formulario para añadir uno.
 *
 * ┌─ ESTA ES LA ÚNICA PANTALLA DONDE ALGUIEN ESCRIBE UNA DIRECCIÓN ───────────────────────────────┐
 * │ Y por eso es donde más vale la validación: si una dirección de cripto pasa mal escrita de     │
 * │ aquí, el error se congela en todas las solicitudes futuras, y un envío a la red equivocada no │
 * │ se recupera. La comprobación usa la MISMA función que el servidor (`validarDestino`), así que │
 * │ no pueden discrepar: lo de aquí solo adelanta el "no", no decide.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * LO QUE SE ENSEÑA DE UN MÉTODO GUARDADO SON CUATRO CARACTERES. El IBAN completo no vuelve del
 * servidor ni para pintar esta lista: basta la pista para saber cuál es cuál, y lo que no viaja no
 * se puede quedar por el camino.
 *
 * NO HAY "EDITAR": se añade y se borra. Editar uno que ya se usó en una solicitud pendiente
 * invitaría a creer que esa solicitud cambia de destino, y no cambia — la retirada se quedó con su
 * propia copia. Añadir y borrar dice la verdad sin tener que explicarla.
 */
export function MetodosDeCobro({ metodos }: { metodos: MetodoPagoPropio[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(metodos.length === 0);
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

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!puede) return;
    setError(null);
    setOcupado(true);
    const r = await postJsonCsrf("/api/metodos-pago", destino);
    setOcupado(false);
    if (!r.ok) {
      setError(mensajeDe(r.data) || "No hemos podido guardar ese método.");
      return;
    }
    setIban("");
    setTitular("");
    setDireccion("");
    setAbierto(false);
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
    router.refresh();
  }

  return (
    <section
      aria-label="Dónde cobrar"
      className="mt-6 rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-medium text-text">Dónde cobrar</h2>
        {metodos.length > 0 ? (
          <Boton variante="fantasma" onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Cancelar" : "Añadir otro"}
          </Boton>
        ) : null}
      </div>

      {metodos.length === 0 ? (
        <p className="mt-2 text-sm text-text-dim">
          Configura una cuenta para poder cobrar. Lo guardamos cifrado y solo lo ve el equipo que
          hace el pago.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {metodos.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="text-text">
                  {m.metodo === "BANK" ? "Cuenta bancaria" : `Cripto · ${m.red}`}
                </span>
                <span className="ml-2 font-mono text-text-dim">····{m.pista}</span>
              </span>
              <Boton
                variante="fantasma"
                onClick={() => void borrar(m.id)}
                disabled={borrando !== null}
              >
                {borrando === m.id ? "…" : "Borrar"}
              </Boton>
            </li>
          ))}
        </ul>
      )}

      {abierto ? (
        <form onSubmit={guardar} className="mt-5 space-y-5" aria-label="Añadir método de cobro">
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
            {ocupado ? "Guardando…" : "Guardar método"}
          </Boton>
        </form>
      ) : null}
    </section>
  );
}
