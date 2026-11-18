"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type SVGProps, useMemo, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { delCsrf, mensajeDe, postJsonCsrf, putJsonCsrf } from "@/lib/cliente-http";
import { nombreDeMetodo, validarDestino, type DestinoRetirada } from "@/lib/retirada";
import type { MetodoPagoPropio } from "@/server/services/metodos-pago";

/**
 * DÓNDE COBRAR — los métodos guardados, en tarjetas, y el formulario para añadir o sustituir uno.
 *
 * ┌─ ESTA ES LA ÚNICA PANTALLA DONDE ALGUIEN ESCRIBE SU IBAN ─────────────────────────────────────┐
 * │ Y por eso es donde más vale la validación: si un IBAN pasa mal escrito de aquí, el error se   │
 * │ congela en todas las solicitudes futuras. La comprobación usa la MISMA función que el         │
 * │ servidor (`validarDestino`), así que no pueden discrepar: lo de aquí solo adelanta el "no",   │
 * │ no decide.                                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SIN SELECTOR DE TIPO: el único método es la cuenta bancaria (la cripto se retiró en la Fase 11 ·
 * PC). Un selector de una sola opción es una pregunta que no pregunta nada.
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
 * SE DICE "REEMPLAZAR", NO "EDITAR", Y ESO ES LA DECISIÓN. Precisamente porque el dato no vuelve, el
 * formulario no se puede rellenar con él: cambiar un método es escribirlo entero otra vez. "Editar"
 * PROMETE encontrarlo relleno, así que la palabra mentía antes de que nadie pulsara. Lo que de
 * verdad ocurre —escribes otro y sustituye al anterior— es lo que dice el botón. Y el cambio es
 * atómico (`PUT`, una transacción en el servidor), para que un fallo a mitad no deje a nadie sin
 * método con el IBAN ya tecleado.
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

export function MetodosDeCobro({
  metodos,
  saldoCents,
}: {
  metodos: MetodoPagoPropio[];
  saldoCents: number;
}) {
  const router = useRouter();
  /** `null` = cerrado; `""` = añadiendo uno nuevo; un id = reemplazando ese. */
  const [editando, setEditando] = useState<string | null>(metodos.length === 0 ? "" : null);
  const [iban, setIban] = useState("");
  const [titular, setTitular] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  const destino: DestinoRetirada = useMemo(
    () => ({ metodo: "BANK", iban, titular }),
    [iban, titular],
  );
  const puede = validarDestino(destino).ok && !ocupado;
  const reemplazando = editando !== null && editando !== "";

  function limpiar() {
    setIban("");
    setTitular("");
    setError(null);
  }

  function abrirNuevo() {
    limpiar();
    setEditando("");
  }

  function abrirReemplazo(m: MetodoPagoPropio) {
    limpiar();
    setEditando(m.id);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!puede || editando === null) return;
    setError(null);
    setOcupado(true);
    const r = reemplazando
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
    <section aria-labelledby="donde-cobrar">
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
            /* `flex-wrap` + un ancho mínimo para el nombre: con "Reemplazar" al lado, en móvil un
               nombre largo se partía en tres líneas. Así, cuando no cabe, son los botones los que
               bajan a su propia línea. */
            className="flex flex-wrap items-center gap-3 rounded-sm border border-line bg-surface/60 p-4 shadow-[var(--df-shadow-sm)] backdrop-blur-md"
          >
            {/* El icono es neutro, no un acento: elegir dónde cobrar no es la acción de la pantalla. */}
            <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-raised text-text-dim">
              <IconoBanco />
            </span>
            <span className="min-w-[9rem] flex-1">
              <span className="block text-sm font-medium text-text">{nombreDeMetodo(m)}</span>
              <span className="block font-mono text-xs text-text-dim">····{m.pista}</span>
            </span>
            <span className="ml-auto flex shrink-0 gap-1">
              {/* "REEMPLAZAR", NO "EDITAR", y la palabra importa: editar PROMETE que el formulario
                  viene relleno, y no puede venirlo — los datos se guardan cifrados y no vuelven del
                  servidor ni para su dueño. Lo que ocurre de verdad es que se escribe otro y
                  sustituye al anterior, así que eso es lo que dice el botón. */}
              <Boton variante="fantasma" onClick={() => abrirReemplazo(m)}>
                Reemplazar
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
          aria-label={reemplazando ? "Reemplazar método de cobro" : "Añadir método de cobro"}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-medium text-text">
              {reemplazando ? "Reemplazar este método" : "Nuevo método de cobro"}
            </h3>
            {metodos.length > 0 ? (
              <Boton variante="fantasma" onClick={() => setEditando(null)}>
                Cancelar
              </Boton>
            ) : null}
          </div>

          {reemplazando ? (
            // Decirlo evita la pregunta "¿por qué está vacío?" y, sobre todo, evita que alguien crea
            // que el campo en blanco significa "déjalo como estaba".
            <p className="max-w-prose text-xs leading-relaxed text-text-dim">
              Escríbelo entero otra vez: guardamos los datos cifrados y no vuelven a salir del
              servidor, ni siquiera para rellenar este formulario. Al guardar, reemplaza al anterior
              — y no cambia a dónde va un cobro que ya hayas pedido.
            </p>
          ) : null}

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

          {error ? (
            <p role="alert" className="text-sm text-alarm">
              {error}
            </p>
          ) : null}

          <Boton type="submit" variante="secundario" disabled={!puede}>
            {ocupado ? "Guardando…" : reemplazando ? "Reemplazar método" : "Guardar método"}
          </Boton>
        </form>
      ) : null}
    </section>
  );
}
