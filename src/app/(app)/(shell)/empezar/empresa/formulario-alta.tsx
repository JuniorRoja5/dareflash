"use client";

import { useMemo, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { Tarjeta } from "@/components/ui/tarjeta";
import {
  EMPRESA_CIUDAD_MAX,
  EMPRESA_CONTACTO_MAX,
  EMPRESA_DIRECCION_MAX,
  EMPRESA_FISCAL_MAX,
  EMPRESA_NOMBRE_MAX,
  EMPRESA_NOMBRE_MIN,
  EMPRESA_REDES_MAX,
  EMPRESA_WEB_MAX,
  ETIQUETA_TIPO_CUENTA,
  ETIQUETA_TIPO_NEGOCIO,
  MSG_EMPRESA_CORREO_NUEVO,
  MSG_EMPRESA_WEB_O_REDES,
  TipoCuentaEmpresaSchema,
  TipoNegocioSchema,
  type TipoCuentaEmpresa,
  type TipoNegocio,
} from "@/config/constants";
import { mensajeDe, postJson } from "@/lib/cliente-http";
import { paisesParaElegir } from "@/lib/paises";

const CONTROL =
  "min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:bg-raised focus:border-text";
const ETIQUETA = "mb-1.5 block text-sm font-medium text-text";
const SECCION = "text-2xs font-semibold tracking-widest text-text-dim uppercase";

/**
 * ALTA DE EMPRESA — la interfaz de `POST /api/empresa`, que crea LA CUENTA Y LA EMPRESA juntas.
 *
 * NO CONVIERTE UNA CUENTA EXISTENTE, y el formulario lo dice ARRIBA, antes de que nadie escriba
 * nada (`MSG_EMPRESA_CORREO_NUEVO`). Decirlo aquí y no en la respuesta no es una preferencia de
 * copy: contestar «ese correo ya tiene cuenta» convertiría el alta en un oráculo que confirma qué
 * direcciones existen, que es justo lo que el registro de participante se cuida de no abrir.
 *
 * NO HAY CSRF que pedir —no hay sesión todavía— ni sesión que crear al terminar: como en el
 * registro de participante, primero se verifica el correo. Por eso el final no es una navegación,
 * es una pantalla que explica qué pasa ahora.
 *
 * LOS PAÍSES no son una lista escrita a mano: son los códigos ISO y los nombres los pone la
 * plataforma en el idioma de quien mira (ver `lib/paises`).
 */
export function FormularioAlta() {
  const paises = useMemo(() => paisesParaElegir("es"), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState<TipoCuentaEmpresa>("EMPRESA");
  const [tipoNegocio, setTipoNegocio] = useState<TipoNegocio>("FISICO");
  const [paisIso, setPaisIso] = useState("ES");
  const [ciudadTexto, setCiudadTexto] = useState("");
  const [personaContacto, setPersonaContacto] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [redes, setRedes] = useState("");
  const [direccion, setDireccion] = useState("");
  const [fiscalId, setFiscalId] = useState("");
  const [fiscalPaisIso, setFiscalPaisIso] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const nombreLimpio = nombre.trim();
  const tieneContacto = webUrl.trim().length > 0 || redes.trim().length > 0;
  const valido =
    email.trim().length > 3 &&
    password.length > 0 &&
    acepta &&
    nombreLimpio.length >= EMPRESA_NOMBRE_MIN &&
    personaContacto.trim().length > 1 &&
    tieneContacto;

  async function enviar(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const r = await postJson<{ ok?: boolean; message?: string }>("/api/empresa", {
        email: email.trim(),
        password,
        aceptaTerminos: true,
        nombre: nombreLimpio,
        tipoCuenta,
        tipoNegocio,
        paisIso,
        personaContacto: personaContacto.trim(),
        // Solo lo que tiene algo: el esquema del servidor los trata como ausentes, no vacíos.
        ...(ciudadTexto.trim() ? { ciudadTexto: ciudadTexto.trim() } : {}),
        ...(webUrl.trim() ? { webUrl: webUrl.trim() } : {}),
        ...(redes.trim() ? { redes: redes.trim() } : {}),
        ...(direccion.trim() ? { direccion: direccion.trim() } : {}),
        ...(fiscalId.trim() ? { fiscalId: fiscalId.trim() } : {}),
        ...(fiscalId.trim() && fiscalPaisIso ? { fiscalPaisIso } : {}),
      });
      if (r.ok) {
        setEnviado(true);
        return;
      }
      setError(mensajeDe(r.data) || "No hemos podido registrar la empresa.");
    } catch {
      setError("No hemos podido conectar. Reinténtalo.");
    }
    setEnviando(false);
  }

  if (enviado) {
    return (
      <Tarjeta className="mt-6 max-w-prose">
        <h2 className="text-sm font-semibold text-text">Revisa tu correo</h2>
        <p className="mt-2 text-sm text-text-dim">
          Te hemos enviado un enlace para confirmar la dirección. Cuando lo abras, revisaremos la
          empresa a mano y te escribimos: no hace falta que vuelvas a enviarla.
        </p>
      </Tarjeta>
    );
  }

  return (
    <form
      className="mt-6 max-w-xl space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido && !enviando) void enviar();
      }}
    >
      <Tarjeta>
        <p className="text-sm text-text">{MSG_EMPRESA_CORREO_NUEVO}</p>
      </Tarjeta>

      <fieldset className="space-y-4">
        <legend className={SECCION}>Tu cuenta</legend>
        <Campo
          id="email"
          label="Correo"
          type="email"
          autoComplete="email"
          value={email}
          maxLength={254}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          maxLength={200}
          onChange={(e) => setPassword(e.target.value)}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className={SECCION}>Tu negocio</legend>
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

        <div>
          <label htmlFor="paisIso" className={ETIQUETA}>
            País
          </label>
          <select
            id="paisIso"
            value={paisIso}
            className={CONTROL}
            onChange={(e) => setPaisIso(e.target.value)}
          >
            {paises.map((p) => (
              <option key={p.iso} value={p.iso}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <Campo
          id="ciudadTexto"
          label="Ciudad (opcional)"
          value={ciudadTexto}
          maxLength={EMPRESA_CIUDAD_MAX}
          placeholder="Dónde estáis"
          onChange={(e) => setCiudadTexto(e.target.value)}
        />

        <Campo
          id="personaContacto"
          label="Persona de contacto"
          value={personaContacto}
          maxLength={EMPRESA_CONTACTO_MAX}
          autoComplete="name"
          placeholder="Con quién hablamos"
          onChange={(e) => setPersonaContacto(e.target.value)}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className={SECCION}>Cómo comprobamos que existís</legend>
        <p className="text-sm text-text-dim">{MSG_EMPRESA_WEB_O_REDES}</p>
        <Campo
          id="webUrl"
          label="Web"
          type="url"
          inputMode="url"
          value={webUrl}
          maxLength={EMPRESA_WEB_MAX}
          placeholder="https://…"
          onChange={(e) => setWebUrl(e.target.value)}
        />
        <Campo
          id="redes"
          label="Redes"
          value={redes}
          maxLength={EMPRESA_REDES_MAX}
          placeholder="@tunegocio, un enlace, varios…"
          onChange={(e) => setRedes(e.target.value)}
        />
        <Campo
          id="direccion"
          label="Dirección (opcional)"
          value={direccion}
          maxLength={EMPRESA_DIRECCION_MAX}
          placeholder="Solo para comprobar quién eres; no se publica"
          onChange={(e) => setDireccion(e.target.value)}
        />
        <Campo
          id="fiscalId"
          label="Identificación fiscal (opcional)"
          value={fiscalId}
          maxLength={EMPRESA_FISCAL_MAX}
          placeholder="NIF, CIF, RUT, RFC…"
          onChange={(e) => setFiscalId(e.target.value)}
        />
        {fiscalId.trim() ? (
          <div>
            <label htmlFor="fiscalPaisIso" className={ETIQUETA}>
              País que la emite
            </label>
            <select
              id="fiscalPaisIso"
              value={fiscalPaisIso}
              className={CONTROL}
              onChange={(e) => setFiscalPaisIso(e.target.value)}
            >
              <option value="">Sin indicar</option>
              {paises.map((p) => (
                <option key={p.iso} value={p.iso}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <p className="text-2xs text-text-dim">
          La identificación fiscal solo la vemos nosotros al verificarte: no sale en ningún listado
          ni en ningún correo.
        </p>
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={acepta}
          onChange={(e) => setAcepta(e.target.checked)}
          className="mt-1"
        />
        <span>
          Acepto la{" "}
          <a href="/privacidad" className="underline">
            política de privacidad
          </a>{" "}
          y los términos.
        </span>
      </label>

      <Boton type="submit" disabled={!valido || enviando}>
        {enviando ? "Enviando…" : "Crear cuenta de empresa"}
      </Boton>

      {error ? (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      ) : null}
    </form>
  );
}
