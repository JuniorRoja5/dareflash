"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { CATEGORIES, DEFAULT_CURRENCY, MSG_PAGO_PATROCINIO } from "@/config/constants";
import { mensajeDe, obtenerCsrfToken } from "@/lib/cliente-http";
import { importeACentimos } from "@/lib/dinero";

const CONTROL =
  "min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:bg-raised focus:border-text";
const AREA =
  "w-full rounded-sm border border-line bg-surface px-3.5 py-2.5 text-base text-text focus:bg-raised focus:border-text";
const ETIQUETA = "mb-1.5 block text-sm font-medium text-text";
const SECCION = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/** datetime-local (hora LOCAL del navegador) -> ISO en UTC. La MISMA conversión que el panel. */
function aIsoUtc(valorLocal: string): string | null {
  if (!valorLocal) return null;
  const d = new Date(valorLocal);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * PROPONER UN RETO PATROCINADO (Fase 9 · P3). El formulario del admin RECORTADO: qué, premio, fechas
 * y ganadores, y el logo de la marca. Lo que es de DareFlash —comisión, nivel, VIP, portada— no está:
 * lo pone el equipo en el borrador. La MARCA tampoco se escribe: es la de la empresa.
 *
 * Los mismos campos con los mismos nombres que el del panel, para que el servidor los valide con la
 * misma pieza (`camposDeReto`). Lo de aquí es comodidad —decirlo antes de enviar—; el que manda es el
 * servidor.
 */
export function FormularioPropuesta() {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState<string>(CATEGORIES[0]!.key);
  const [reglas, setReglas] = useState("");
  const [premio, setPremio] = useState("");
  const [apertura, setApertura] = useState("");
  const [cierre, setCierre] = useState("");
  const [ganadores, setGanadores] = useState("1");
  const [logo, setLogo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (titulo.trim().length < 3) {
      setError("Escribe un título de al menos 3 caracteres.");
      return;
    }
    const centimos = importeACentimos(premio);
    if (centimos === null || centimos <= 0) {
      setError("El premio no es válido. Usa un importe como 50 o 49.90.");
      return;
    }
    const startsAt = aIsoUtc(apertura);
    const deadline = aIsoUtc(cierre);
    if (!startsAt || !deadline) {
      setError("Elige cuándo abre y cuándo cierra el reto.");
      return;
    }
    if (new Date(startsAt) >= new Date(deadline)) {
      setError("El cierre tiene que ser después de la apertura.");
      return;
    }
    if (new Date(deadline) <= new Date()) {
      setError("El cierre tiene que estar en el futuro.");
      return;
    }

    setEnviando(true);
    try {
      const cuerpo = new FormData();
      cuerpo.set("title", titulo);
      cuerpo.set("description", descripcion);
      cuerpo.set("category", categoria);
      cuerpo.set("rules", reglas);
      cuerpo.set("prizeAmountCents", String(centimos));
      cuerpo.set("startsAt", startsAt);
      cuerpo.set("deadline", deadline);
      cuerpo.set("winnersCount", ganadores);
      if (logo) cuerpo.set("sponsorLogo", logo);

      // Multipart (no JSON): token CSRF del helper compartido, fetch propio (como el panel).
      const csrf = await obtenerCsrfToken();
      const res = await fetch("/api/empresa/retos", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: cuerpo,
      });
      if (res.ok) {
        // A la lista: ahí se ve en revisión. Navegación de cliente normal (no hay cambio de sesión).
        router.push("/empresa/retos?enviada=1");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(mensajeDe(data) || "No hemos podido enviar la propuesta. Revisa los datos.");
    } catch {
      setError("No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.");
    }
    setEnviando(false);
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-5" noValidate>
      <p className={SECCION}>El reto</p>
      <Campo
        id="title"
        label="Título"
        value={titulo}
        maxLength={120}
        placeholder="Lo que la gente verá en la tarjeta"
        onChange={(e) => setTitulo(e.target.value)}
      />
      <div>
        <label htmlFor="description" className={ETIQUETA}>
          Qué tiene que hacer la gente
        </label>
        <textarea
          id="description"
          value={descripcion}
          rows={4}
          maxLength={2000}
          className={AREA}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="category" className={ETIQUETA}>
          Categoría
        </label>
        <select
          id="category"
          value={categoria}
          className={CONTROL}
          onChange={(e) => setCategoria(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.es}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rules" className={ETIQUETA}>
          Reglas (opcional)
        </label>
        <textarea
          id="rules"
          value={reglas}
          rows={3}
          maxLength={4000}
          className={AREA}
          onChange={(e) => setReglas(e.target.value)}
        />
      </div>

      <p className={SECCION}>Premio y fechas</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="premio"
          label={`Premio (${DEFAULT_CURRENCY})`}
          inputMode="decimal"
          value={premio}
          placeholder="50"
          onChange={(e) => setPremio(e.target.value)}
        />
        <Campo
          id="winnersCount"
          label="Ganadores"
          type="number"
          min={1}
          value={ganadores}
          onChange={(e) => setGanadores(e.target.value)}
        />
        <Campo
          id="startsAt"
          label="Abre"
          type="datetime-local"
          value={apertura}
          onChange={(e) => setApertura(e.target.value)}
        />
        <Campo
          id="deadline"
          label="Cierra"
          type="datetime-local"
          value={cierre}
          onChange={(e) => setCierre(e.target.value)}
        />
      </div>

      <p className={SECCION}>Tu marca</p>
      <div>
        <label htmlFor="sponsorLogo" className={ETIQUETA}>
          Logo (opcional)
        </label>
        <input
          id="sponsorLogo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm text-text-dim file:mr-3 file:rounded-sm file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:text-text"
          onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
        />
        <p className="mt-1.5 text-2xs text-text-dim">
          Saldrá junto a «Patrocinado por» con el nombre de tu empresa.
        </p>
      </div>

      <p className="max-w-prose text-sm text-text-dim">{MSG_PAGO_PATROCINIO}</p>

      <Boton type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar propuesta"}
      </Boton>

      {error ? (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      ) : null}
    </form>
  );
}
