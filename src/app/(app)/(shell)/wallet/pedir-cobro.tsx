"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { RETIRADA_MINIMA_CENTS } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { importeACentimos, importeConMoneda } from "@/lib/dinero";
import { evaluarImporte, nombreDeMetodo } from "@/lib/retirada";
import type { MetodoPagoPropio } from "@/server/services/metodos-pago";

/**
 * PEDIR UN COBRO. El importe y A CUÁL de tus métodos guardados.
 *
 * NO SE TECLEAN LOS DATOS DE PAGO: se elige uno de los guardados. Cada tecleo de una dirección de
 * cripto es una oportunidad de equivocarse en algo irrecuperable, así que ese momento ocurre UNA
 * vez, al configurarla, y no en cada cobro.
 *
 * LA CLAVE DE IDEMPOTENCIA SE GENERA UNA VEZ POR INTENCIÓN, no por envío. Si la red falla a mitad y
 * la persona vuelve a pulsar, el reintento lleva la MISMA clave y el servidor no debita dos veces.
 * Si se generara una nueva en cada clic, el doble clic sería un doble cobro.
 *
 * LO QUE VALIDA AQUÍ NO ES LA REGLA: la regla vive en el servidor, que es quien tiene el saldo bajo
 * bloqueo. Esto solo evita un viaje para decir algo que ya se sabe.
 */
export function PedirCobro({
  saldoCents,
  metodos,
}: {
  saldoCents: number;
  metodos: MetodoPagoPropio[];
}) {
  const router = useRouter();
  const [importe, setImporte] = useState("");
  const [metodoId, setMetodoId] = useState(metodos[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [clave, setClave] = useState(() => crypto.randomUUID());

  const cents = useMemo(() => importeACentimos(importe), [importe]);
  const importeOk = cents !== null && evaluarImporte(cents, saldoCents).ok;
  const puede = importeOk && metodoId !== "" && !ocupado;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!puede || cents === null) return;
    setError(null);
    setOcupado(true);
    const r = await postJsonCsrf("/api/retiradas", {
      clave,
      importeCents: cents,
      metodoPagoId: metodoId,
    });
    setOcupado(false);
    if (!r.ok) {
      // El copy sale del servidor, no de un mapa duplicado aquí: dos juegos de mensajes son libres
      // de discrepar justo cuando más importa entenderse.
      setError(mensajeDe(r.data) || "No hemos podido registrar tu solicitud.");
      return;
    }
    // Intención COMPLETADA: a partir de aquí, pedir otra vez es otra intención y lleva otra clave.
    setClave(crypto.randomUUID());
    setHecho(true);
    setImporte("");
    router.refresh();
  }

  return (
    <form
      onSubmit={enviar}
      className="mt-6 space-y-5 rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
      aria-label="Pedir un cobro"
    >
      <h2 className="font-medium text-text">Pedir un cobro</h2>

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

      <div>
        <label htmlFor="metodo" className="mb-1.5 block text-sm font-medium text-text">
          A dónde
        </label>
        <select
          id="metodo"
          value={metodoId}
          onChange={(e) => setMetodoId(e.target.value)}
          className="min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:bg-raised"
        >
          {metodos.map((m) => (
            <option key={m.id} value={m.id}>
              {/* El MISMO nombre que la tarjeta de arriba (`nombreDeMetodo`): aquí decía
                  "Cripto · TRC20" —el código de la red, no su nombre— y allí "Cripto · TRON
                  (TRC-20)". Dos formas de llamar a lo mismo en la misma pantalla. */}
              {nombreDeMetodo(m)} ····{m.pista}
            </option>
          ))}
        </select>
      </div>

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

      {/* ÚNICA acción principal de la pantalla: guardar un método es secundario, pedir el cobro es
          LA acción. Un acento por pantalla. */}
      <Boton type="submit" variante="principal" disabled={!puede} className="w-full sm:w-auto">
        {ocupado ? "Enviando…" : "Pedir cobro"}
      </Boton>
    </form>
  );
}
