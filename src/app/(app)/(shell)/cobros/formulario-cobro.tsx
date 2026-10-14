"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { REDES_CRIPTO, RETIRADA_MINIMA_CENTS } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { importeACentimos, importeConMoneda } from "@/lib/dinero";
import { evaluarImporte, validarDestino, type DestinoRetirada } from "@/lib/retirada";

/**
 * EL FORMULARIO DE COBRO (isla cliente). POST /api/retiradas.
 *
 * LO QUE VALIDA AQUÍ NO ES LA REGLA: la regla vive en el servidor, que es quien tiene el saldo bajo
 * bloqueo. Esto solo evita un viaje de ida y vuelta para decir algo que ya se sabe —y, sobre todo,
 * evita que alguien mande una dirección a la red equivocada, que es el error que no tiene arreglo.
 * Las dos capas usan LA MISMA función (`validarDestino`), así que no pueden discrepar.
 *
 * LA CLAVE DE IDEMPOTENCIA SE GENERA UNA VEZ POR INTENCIÓN, no por envío. Si la red falla a mitad y
 * la persona vuelve a pulsar, el reintento lleva la MISMA clave y el servidor no debita dos veces.
 * Si generara una nueva en cada clic, el doble clic sería un doble cobro.
 */
export function FormularioCobro({ saldoCents }: { saldoCents: number }) {
  const router = useRouter();
  const [importe, setImporte] = useState("");
  const [metodo, setMetodo] = useState<"BANK" | "CRYPTO">("BANK");
  const [iban, setIban] = useState("");
  const [titular, setTitular] = useState("");
  const [direccion, setDireccion] = useState("");
  const [red, setRed] = useState<(typeof REDES_CRIPTO)[number]["red"]>(REDES_CRIPTO[0].red);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState(false);

  /** UNA por intención de cobrar. Se renueva solo cuando la anterior se completó (ver arriba). */
  const [clave, setClave] = useState(() => crypto.randomUUID());

  const cents = useMemo(() => importeACentimos(importe), [importe]);
  const destino: DestinoRetirada = useMemo(
    () =>
      metodo === "BANK" ? { metodo: "BANK", iban, titular } : { metodo: "CRYPTO", direccion, red },
    [metodo, iban, titular, direccion, red],
  );

  const importeOk = cents !== null && evaluarImporte(cents, saldoCents).ok;
  const destinoOk = validarDestino(destino).ok;
  const puede = importeOk && destinoOk && !ocupado;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!puede || cents === null) return;
    setError(null);
    setOcupado(true);
    const r = await postJsonCsrf("/api/retiradas", { clave, importeCents: cents, destino });
    setOcupado(false);

    if (!r.ok) {
      // El copy sale del servidor (`mensajeDe`), no de un mapa duplicado aquí: un segundo juego de
      // mensajes sería libre de discrepar del primero justo cuando más importa entenderse.
      setError(mensajeDe(r.data) || "No hemos podido registrar tu solicitud.");
      return;
    }
    // Intención COMPLETADA: a partir de aquí, pedir otra vez es otra intención y lleva otra clave.
    setClave(crypto.randomUUID());
    setHecho(true);
    setImporte("");
    setIban("");
    setTitular("");
    setDireccion("");
    router.refresh();
  }

  return (
    <form
      onSubmit={enviar}
      className="mt-6 space-y-5 rounded-sm border border-line bg-surface/60 p-6 backdrop-blur-md"
      aria-label="Pedir un cobro"
    >
      <div>
        <Campo
          id="importe"
          label="Importe"
          value={importe}
          onChange={(e) => {
            setImporte(e.target.value);
            setHecho(false);
          }}
          inputMode="decimal"
        />
        <p className="mt-1.5 text-xs text-text-dim">
          Mínimo {importeConMoneda(RETIRADA_MINIMA_CENTS)} · disponible{" "}
          {importeConMoneda(saldoCents)}
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-text">Cómo quieres cobrar</legend>
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
              onClick={() => {
                setMetodo(valor);
                setHecho(false);
              }}
              aria-pressed={metodo === valor}
              /* NEUTRO, nunca el acento: elegir método no es LA acción de la pantalla — la acción es
                 pedir el cobro, y solo puede haber un acento. */
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
            <label htmlFor="red" className="text-sm font-medium text-text">
              Red
            </label>
            {/* LA RED SE ELIGE DE UNA LISTA CERRADA, no se escribe: una red que no enviamos es
                dinero perdido, así que no puede ser un campo de texto libre. */}
            <select
              id="red"
              value={red}
              onChange={(e) => setRed(e.target.value as typeof red)}
              className="mt-1.5 min-h-[44px] w-full rounded-sm border border-line bg-raised px-3 text-sm text-text"
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
      {hecho ? (
        <p role="status" className="text-sm text-ok">
          Solicitud registrada. El importe ya ha salido de tu saldo y el equipo la revisará.
        </p>
      ) : null}

      {/* ÚNICA acción principal de la pantalla. */}
      <Boton type="submit" variante="principal" disabled={!puede} className="w-full sm:w-auto">
        {ocupado ? "Enviando…" : "Pedir cobro"}
      </Boton>
    </form>
  );
}
