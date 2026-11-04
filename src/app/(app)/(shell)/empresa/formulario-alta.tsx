"use client";

import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import {
  EMPRESA_DIRECCION_MAX,
  EMPRESA_NOMBRE_MAX,
  EMPRESA_NOMBRE_MIN,
  EMPRESA_WEB_MAX,
  ETIQUETA_TIPO_CUENTA,
  ETIQUETA_TIPO_NEGOCIO,
  TipoCuentaEmpresaSchema,
  TipoNegocioSchema,
  type TipoCuentaEmpresa,
  type TipoNegocio,
} from "@/config/constants";
import { mensajeDe, postJsonCsrf } from "@/lib/cliente-http";
import { navegarDuro } from "@/lib/navegacion-dura";

const CONTROL =
  "min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:bg-raised focus:border-text";
const ETIQUETA = "mb-1.5 block text-sm font-medium text-text";

/**
 * ALTA DE EMPRESA — la interfaz de `POST /api/empresa`.
 *
 * LOS DOS TIPOS SE PREGUNTAN AQUÍ Y NO SE DEDUCEN. El tipo de cuenta dice quién firma; el tipo de
 * negocio decide qué podrá comprar (`ALCANCES_POR_NEGOCIO`), así que no es un detalle de formulario:
 * es un dato del que depende una regla, y por eso se elige de una lista cerrada y no se escribe.
 *
 * WEB Y DIRECCIÓN SON OPCIONALES DE VERDAD: una marca personal puede no tener web y un negocio
 * online no tiene dirección. Pedir las dos "por si acaso" convierte un alta de un minuto en un
 * formulario que se abandona.
 *
 * AL TERMINAR, NAVEGACIÓN DURA. No es un capricho: a /empresa se llega desde aquí porque /empresa
 * nos REDIRIGIÓ a /empresa/alta hace un momento, y esa redirección está en la caché del router de
 * cliente. Con `router.push` volveríamos a caer en el alta con la empresa ya creada — el mismo fallo
 * que el login documentado en `lib/navegacion-dura`.
 */
export function FormularioAlta() {
  const [nombre, setNombre] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuentaEmpresa>("EMPRESA");
  const [tipoNegocio, setTipoNegocio] = useState<TipoNegocio>("FISICO");
  const [webUrl, setWebUrl] = useState("");
  const [direccion, setDireccion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limpio = nombre.trim();
  const valido = limpio.length >= EMPRESA_NOMBRE_MIN && limpio.length <= EMPRESA_NOMBRE_MAX;

  async function enviar(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const r = await postJsonCsrf<{ id?: string; creado?: boolean }>("/api/empresa", {
        nombre: limpio,
        tipoCuenta,
        tipoNegocio,
        // Se mandan solo si tienen algo: el esquema del servidor los trata como ausentes, no vacíos.
        ...(webUrl.trim() ? { webUrl: webUrl.trim() } : {}),
        ...(direccion.trim() ? { direccion: direccion.trim() } : {}),
      });
      // `creado: false` NO es un error: ya tenía empresa (doble clic, dos pestañas). Mismo destino.
      if (r.ok) {
        navegarDuro("/empresa");
        return;
      }
      setError(mensajeDe(r.data) || "No hemos podido registrar la empresa.");
    } catch (e) {
      setError(
        e instanceof Error && e.message === "SIN_SESION"
          ? "Se ha cerrado tu sesión. Entra otra vez y vuelve a enviarlo."
          : "No hemos podido conectar. Reinténtalo: si ya se registró, no se duplicará.",
      );
    }
    setEnviando(false);
  }

  return (
    <form
      className="mt-6 max-w-xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido && !enviando) void enviar();
      }}
    >
      <Campo
        id="nombre"
        label="Nombre comercial"
        value={nombre}
        maxLength={EMPRESA_NOMBRE_MAX}
        autoComplete="organization"
        placeholder="Como te conoce la gente"
        onChange={(e) => setNombre(e.target.value)}
      />

      <div>
        <label htmlFor="tipoCuenta" className={ETIQUETA}>
          ¿Quién firma la cuenta?
        </label>
        <select
          id="tipoCuenta"
          value={tipoCuenta}
          className={CONTROL}
          onChange={(e) => setTipoCuenta(TipoCuentaEmpresaSchema.parse(e.target.value))}
        >
          {TipoCuentaEmpresaSchema.options.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_CUENTA[t]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tipoNegocio" className={ETIQUETA}>
          ¿Qué clase de negocio es?
        </label>
        <select
          id="tipoNegocio"
          value={tipoNegocio}
          className={CONTROL}
          onChange={(e) => setTipoNegocio(TipoNegocioSchema.parse(e.target.value))}
        >
          {TipoNegocioSchema.options.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_NEGOCIO[t]}
            </option>
          ))}
        </select>
      </div>

      <Campo
        id="webUrl"
        label="Web (opcional)"
        type="url"
        inputMode="url"
        value={webUrl}
        maxLength={EMPRESA_WEB_MAX}
        placeholder="https://…"
        onChange={(e) => setWebUrl(e.target.value)}
      />

      <Campo
        id="direccion"
        label="Dirección o localidad (opcional)"
        value={direccion}
        maxLength={EMPRESA_DIRECCION_MAX}
        placeholder="Para saber dónde estás"
        onChange={(e) => setDireccion(e.target.value)}
      />
      <p className="text-2xs text-text-dim">
        La dirección es solo para que podamos comprobar quién eres. No se publica.
      </p>

      <Boton type="submit" disabled={!valido || enviando}>
        {enviando ? "Enviando…" : "Enviar para revisión"}
      </Boton>

      {error ? (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      ) : null}
    </form>
  );
}
