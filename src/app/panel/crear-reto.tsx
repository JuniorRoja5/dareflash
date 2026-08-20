"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { CATEGORIES } from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { importeACentimos } from "@/lib/dinero";

type Estado = "idle" | "enviando" | "creado";

const CLASE_CONTROL =
  "min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text placeholder:text-text-dim focus:border-text focus:bg-raised focus:outline-none";

/** datetime-local ("2026-08-25T14:00", hora LOCAL) -> ISO en UTC; "" si vacío/ inválido. */
function aIsoUtc(valorLocal: string): string | null {
  if (!valorLocal) return null;
  const d = new Date(valorLocal);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Formulario de CREAR RETO (panel admin). El reto se guarda como DRAFT; publicar es una acción aparte.
 * Validación de aquí = UX; el gate es el servidor (Zod). Único magenta de la pantalla = "Crear reto".
 * El premio se introduce como importe y se envía en CÉNTIMOS enteros (sin float). Fechas -> ISO UTC.
 */
export function CrearReto() {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIES[0]!.key);
  const [reglas, setReglas] = useState("");
  const [premio, setPremio] = useState("0");
  const [apertura, setApertura] = useState("");
  const [cierre, setCierre] = useState("");
  const [ganadores, setGanadores] = useState("1");
  const [votos, setVotos] = useState("1");
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const ocupado = estado === "enviando";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setEstado("idle");
    setError(undefined);

    if (titulo.trim().length < 3) {
      setError("Escribe un título de al menos 3 caracteres.");
      return;
    }
    const centimos = importeACentimos(premio);
    if (centimos === null) {
      setError(
        "El premio no es válido. Usa un importe como 20 o 20.50 (o 0 si aún no hay premio).",
      );
      return;
    }
    const startsAt = aIsoUtc(apertura);
    const deadline = aIsoUtc(cierre);
    if (!startsAt || !deadline) {
      setError("Indica la fecha de apertura y la de cierre.");
      return;
    }

    setEstado("enviando");
    try {
      const r = await postJsonCsrf<{ id?: string }>("/api/panel/retos", {
        title: titulo,
        description: descripcion,
        category: categoria,
        rules: reglas,
        prizeAmountCents: centimos,
        startsAt,
        deadline,
        winnersCount: Number(ganadores),
        maxVotesPerUser: Number(votos),
      });
      if (r.ok) {
        setEstado("creado");
        setTitulo("");
        setDescripcion("");
        setReglas("");
        setPremio("0");
        setApertura("");
        setCierre("");
        setGanadores("1");
        setVotos("1");
        router.refresh(); // el nuevo borrador aparece en la lista
        return;
      }
      setEstado("idle");
      if (r.status === 401) {
        setError("Tu sesión ha caducado. Vuelve a iniciar sesión.");
      } else {
        setError(
          mensajeDe(r.data) || "No hemos podido crear el reto. Revisa los datos e inténtalo.",
        );
      }
    } catch (err) {
      setEstado("idle");
      setError(
        err instanceof Error && err.message === "SIN_SESION"
          ? "Inicia sesión para crear el reto."
          : "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
      );
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)]"
    >
      <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">Nuevo reto</h2>
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <Campo
          id="reto-titulo"
          label="Título"
          placeholder="Ej.: Tu mejor salto en caja"
          maxLength={120}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          disabled={ocupado}
          className="lg:col-span-2"
        />

        <div className="lg:col-span-2">
          <label htmlFor="reto-desc" className="mb-1.5 block text-sm font-medium text-text">
            Descripción <span className="text-text-dim">(opcional)</span>
          </label>
          <textarea
            id="reto-desc"
            rows={3}
            maxLength={2000}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            disabled={ocupado}
            placeholder="El gancho del reto"
            className={`${CLASE_CONTROL} py-2`}
          />
        </div>

        <div>
          <label htmlFor="reto-categoria" className="mb-1.5 block text-sm font-medium text-text">
            Categoría
          </label>
          <select
            id="reto-categoria"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as typeof categoria)}
            disabled={ocupado}
            className={CLASE_CONTROL}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.emoji} {c.es}
              </option>
            ))}
          </select>
        </div>

        <Campo
          id="reto-premio"
          label="Premio (importe)"
          inputMode="decimal"
          placeholder="20.00"
          value={premio}
          onChange={(e) => setPremio(e.target.value)}
          disabled={ocupado}
        />

        <div className="lg:col-span-2">
          <label htmlFor="reto-reglas" className="mb-1.5 block text-sm font-medium text-text">
            Reglas <span className="text-text-dim">(opcional)</span>
          </label>
          <textarea
            id="reto-reglas"
            rows={3}
            maxLength={4000}
            value={reglas}
            onChange={(e) => setReglas(e.target.value)}
            disabled={ocupado}
            placeholder="Cómo se participa y cómo se decide el ganador"
            className={`${CLASE_CONTROL} py-2`}
          />
        </div>

        <Campo
          id="reto-apertura"
          label="Apertura"
          type="datetime-local"
          value={apertura}
          onChange={(e) => setApertura(e.target.value)}
          disabled={ocupado}
        />
        <Campo
          id="reto-cierre"
          label="Cierre"
          type="datetime-local"
          value={cierre}
          onChange={(e) => setCierre(e.target.value)}
          disabled={ocupado}
        />

        <Campo
          id="reto-ganadores"
          label="Nº de ganadores"
          type="number"
          min={1}
          step={1}
          value={ganadores}
          onChange={(e) => setGanadores(e.target.value)}
          disabled={ocupado}
        />
        <Campo
          id="reto-votos"
          label="Votos por usuario (0 = sin límite)"
          type="number"
          min={0}
          step={1}
          value={votos}
          onChange={(e) => setVotos(e.target.value)}
          disabled={ocupado}
        />
      </div>

      <Boton
        type="submit"
        variante="principal"
        disabled={ocupado}
        className="mt-6 py-3.5 shadow-[var(--df-cta-lift)]"
      >
        {ocupado ? "Creando…" : "Crear reto"}
      </Boton>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alarm">
          {error}
        </p>
      ) : null}
      {estado === "creado" ? (
        <p role="status" className="mt-3 text-sm text-ok">
          Reto creado como borrador. Publícalo desde la lista cuando esté listo.
        </p>
      ) : null}
    </form>
  );
}
