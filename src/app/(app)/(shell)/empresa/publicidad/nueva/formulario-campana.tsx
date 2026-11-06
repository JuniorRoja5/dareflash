"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { BarraEnviar, BloqueFormulario } from "@/components/ui/formulario";
import {
  type AlcancePublicidad,
  ETIQUETA_ALCANCE_PUBLICIDAD,
  PUBLICIDAD_DESTINO_MAX,
  PUBLICIDAD_DIAS_MAX,
  PUBLICIDAD_DIAS_MIN,
  PUBLICIDAD_NOMBRE_MAX,
  PUBLICIDAD_PAISES_AVISO_GLOBAL,
  PUBLICIDAD_PAISES_MAX,
  PUBLICIDAD_TEXTO_MAX,
} from "@/config/constants";
import { mensajeDe, obtenerCsrfToken } from "@/lib/cliente-http";
import { costeTotal, destinoValido, tarifaPorDia } from "@/lib/publicidad";

import { BuscadorCiudad } from "./buscador-ciudad";

const CONTROL =
  "min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:bg-raised focus:border-text";
const AREA =
  "w-full rounded-sm border border-line bg-surface px-3.5 py-2.5 text-base text-text focus:bg-raised focus:border-text";
const ETIQUETA = "mb-1.5 block text-sm font-medium text-text";

export interface PropsFormularioCampana {
  alcances: readonly AlcancePublicidad[];
  pais: string;
  regiones: { codigo: string; nombre: string }[];
  /** Países elegibles, ya ORDENADOS en el servidor (el orden de Intl no hidrata igual en el cliente). */
  paises: { iso: string; nombre: string }[];
  saldo: number;
  /** Hoy y el último día en que se puede empezar, en AAAA-MM-DD: los fija el servidor. */
  hoy: string;
  ultimoInicio: string;
}

/**
 * CREAR UNA CAMPAÑA (Fase 9 · P6). Tres bloques —Dónde · Cuándo · La pieza— y una barra con el COSTE
 * y el saldo, que se recalculan con cada cambio. Crea un BORRADOR: la estimación de cuánta gente la
 * verá y el botón de activar están en la ficha que se abre después, antes de gastar nada.
 *
 * Lo de aquí es comodidad (decirlo antes de enviar); quien manda es el servidor, que vuelve a validar
 * la zona contra el catálogo y el tipo de negocio. Solo se ofrecen los alcances que este negocio puede
 * comprar (`alcancesPermitidos`, la misma regla que aplica la ruta).
 */
export function FormularioCampana(props: PropsFormularioCampana) {
  const router = useRouter();
  const [alcance, setAlcance] = useState<AlcancePublicidad>(props.alcances[0]!);
  const [ciudad, setCiudad] = useState<{ id: number; etiqueta: string } | null>(null);
  const [region, setRegion] = useState("");
  const [paises, setPaises] = useState<string[]>([]);
  const [paisAnadir, setPaisAnadir] = useState("");
  const [inicio, setInicio] = useState(props.hoy);
  const [dias, setDias] = useState("7");
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState("https://");
  const [imagen, setImagen] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nDias = Number.parseInt(dias, 10);
  const diasValidos =
    Number.isInteger(nDias) && nDias >= PUBLICIDAD_DIAS_MIN && nDias <= PUBLICIDAD_DIAS_MAX;
  const tarifa = tarifaPorDia(alcance, Math.max(1, paises.length));
  const coste = diasValidos ? costeTotal(tarifa, nDias) : null;
  const nombreDePais = (iso: string) => props.paises.find((p) => p.iso === iso)?.nombre ?? iso;

  function zonaElegida(): string | null {
    if (alcance === "CIUDAD" && !ciudad) return "Elige la ciudad de la lista.";
    if (alcance === "ESTADO" && !region) return "Elige la región.";
    if (alcance === "PAIS" && paises.length === 0) return "Añade al menos un país.";
    return null;
  }

  async function enviar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const falta =
      zonaElegida() ??
      (nombre.trim().length < 3 ? "Ponle un nombre a la campaña (al menos 3 caracteres)." : null) ??
      (texto.trim().length < 3 ? "Escribe el texto del anuncio." : null) ??
      (!destinoValido(destino.trim())
        ? "El enlace tiene que ser una dirección web completa (https://…)."
        : null) ??
      (!diasValidos ? `Elige entre ${PUBLICIDAD_DIAS_MIN} y ${PUBLICIDAD_DIAS_MAX} días.` : null) ??
      (!imagen ? "Sube la imagen de la campaña." : null);
    if (falta) {
      setError(falta);
      return;
    }

    setEnviando(true);
    try {
      const cuerpo = new FormData();
      cuerpo.set("nombre", nombre);
      cuerpo.set("alcance", alcance);
      if (alcance === "CIUDAD" && ciudad) cuerpo.set("ciudadId", String(ciudad.id));
      if (alcance === "ESTADO") cuerpo.set("estadoCodigo", region);
      if (alcance === "PAIS") cuerpo.set("paises", paises.join(","));
      cuerpo.set("texto", texto);
      cuerpo.set("destinoUrl", destino.trim());
      cuerpo.set("fechaInicio", inicio);
      cuerpo.set("dias", String(nDias));
      if (imagen) cuerpo.set("imagen", imagen);

      const csrf = await obtenerCsrfToken();
      const res = await fetch("/api/empresa/publicidad", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: cuerpo,
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (res.ok && data.id) {
        // A la ficha del borrador: ahí están la estimación y el botón de activar.
        router.push(`/empresa/publicidad/${data.id}`);
        router.refresh();
        return;
      }
      setError(mensajeDe(data) || "No hemos podido crear la campaña. Revisa los datos.");
    } catch {
      setError("No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.");
    }
    setEnviando(false);
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-4" noValidate>
      <BloqueFormulario titulo="Dónde" descripcion="Dónde se verá tu publicidad.">
        <fieldset className="sm:col-span-2">
          <legend className={ETIQUETA}>Alcance</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {props.alcances.map((a) => (
              <label
                key={a}
                className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-sm border px-3.5 py-2 text-sm ${
                  alcance === a ? "border-text bg-raised text-text" : "border-line text-text-dim"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="alcance"
                    value={a}
                    checked={alcance === a}
                    onChange={() => setAlcance(a)}
                    className="accent-current"
                  />
                  {ETIQUETA_ALCANCE_PUBLICIDAD[a]}
                </span>
                <span className="shrink-0 text-2xs text-text-dim tabular-nums">
                  {a === "PAIS" ? `${tarifaPorDia("PAIS", 1)} por país` : tarifaPorDia(a)} cr./día
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {alcance === "CIUDAD" ? (
          <div className="sm:col-span-2">
            <BuscadorCiudad pais={props.pais} elegida={ciudad} onElegir={setCiudad} />
          </div>
        ) : null}

        {alcance === "ESTADO" ? (
          <div className="sm:col-span-2">
            <label htmlFor="region" className={ETIQUETA}>
              Región
            </label>
            <select
              id="region"
              value={region}
              className={CONTROL}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">Elige una región</option>
              {props.regiones.map((r) => (
                <option key={r.codigo} value={r.codigo}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {alcance === "PAIS" ? (
          <div className="sm:col-span-2">
            <label htmlFor="pais-anadir" className={ETIQUETA}>
              Países
            </label>
            <div className="flex gap-2">
              <select
                id="pais-anadir"
                value={paisAnadir}
                className={CONTROL}
                onChange={(e) => setPaisAnadir(e.target.value)}
              >
                <option value="">Elige un país</option>
                {props.paises
                  .filter((p) => !paises.includes(p.iso))
                  .map((p) => (
                    <option key={p.iso} value={p.iso}>
                      {p.nombre}
                    </option>
                  ))}
              </select>
              <Boton
                type="button"
                variante="secundario"
                className="shrink-0"
                disabled={!paisAnadir || paises.length >= PUBLICIDAD_PAISES_MAX}
                onClick={() => {
                  if (paisAnadir) setPaises((ps) => [...ps, paisAnadir]);
                  setPaisAnadir("");
                }}
              >
                Añadir
              </Boton>
            </div>
            {paises.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Países elegidos">
                {paises.map((p) => (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => setPaises((ps) => ps.filter((x) => x !== p))}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line px-3 text-sm text-text hover:bg-raised"
                      aria-label={`Quitar ${nombreDePais(p)}`}
                    >
                      {nombreDePais(p)} <span aria-hidden>×</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {paises.length >= PUBLICIDAD_PAISES_AVISO_GLOBAL &&
            props.alcances.includes("GLOBAL") ? (
              <p className="mt-2 text-sm text-text">
                Con {paises.length} países pagas lo mismo que por Todo el mundo, que llega a más
                gente.
              </p>
            ) : null}
          </div>
        ) : null}
      </BloqueFormulario>

      <BloqueFormulario titulo="Cuándo" descripcion="Días completos, en hora UTC.">
        <Campo
          id="inicio"
          label="Empieza el"
          type="date"
          value={inicio}
          min={props.hoy}
          max={props.ultimoInicio}
          onChange={(e) => setInicio(e.target.value)}
        />
        <Campo
          id="dias"
          label="Días"
          type="number"
          inputMode="numeric"
          min={PUBLICIDAD_DIAS_MIN}
          max={PUBLICIDAD_DIAS_MAX}
          value={dias}
          onChange={(e) => setDias(e.target.value)}
        />
      </BloqueFormulario>

      <BloqueFormulario titulo="La pieza" descripcion="Lo que verá la gente en el feed.">
        <Campo
          id="nombre"
          label="Nombre de la campaña"
          className="sm:col-span-2"
          value={nombre}
          maxLength={PUBLICIDAD_NOMBRE_MAX}
          autoComplete="off"
          placeholder="Solo para ti: no lo ve nadie más"
          onChange={(e) => setNombre(e.target.value)}
        />
        <div className="sm:col-span-2">
          <label htmlFor="texto" className={ETIQUETA}>
            Texto
          </label>
          <textarea
            id="texto"
            value={texto}
            rows={3}
            maxLength={PUBLICIDAD_TEXTO_MAX}
            className={AREA}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="mt-1 text-right text-2xs text-text-dim tabular-nums">
            {texto.length}/{PUBLICIDAD_TEXTO_MAX}
          </p>
        </div>
        <Campo
          id="destino"
          label="Enlace al pulsar"
          type="url"
          inputMode="url"
          autoComplete="url"
          className="sm:col-span-2"
          value={destino}
          maxLength={PUBLICIDAD_DESTINO_MAX}
          onChange={(e) => setDestino(e.target.value)}
        />
        <div className="sm:col-span-2">
          <label htmlFor="imagen" className={ETIQUETA}>
            Imagen
          </label>
          <input
            id="imagen"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="block w-full text-sm text-text-dim file:mr-3 file:min-h-[44px] file:rounded-sm file:border file:border-line file:bg-surface file:px-4 file:text-sm file:text-text"
            onChange={(e) => setImagen(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1.5 text-2xs text-text-dim">
            PNG, JPG o WebP. Mejor en vertical: el feed se ve en el móvil.
          </p>
        </div>
      </BloqueFormulario>

      <BarraEnviar
        nota={
          error ? (
            <p role="alert" className="text-sm text-alarm">
              {error}
            </p>
          ) : (
            <p className="text-sm text-text-dim tabular-nums">
              {coste !== null ? (
                <>
                  <span className="font-semibold text-text">{coste} créditos</span> en total ·{" "}
                  {tarifa} al día · tienes {props.saldo}
                </>
              ) : (
                `Tienes ${props.saldo} créditos de publicidad`
              )}
            </p>
          )
        }
      >
        <Boton
          type="submit"
          disabled={enviando}
          className="w-full shrink-0 whitespace-nowrap sm:w-auto"
        >
          {enviando ? "Creando…" : "Crear borrador"}
        </Boton>
      </BarraEnviar>
    </form>
  );
}
