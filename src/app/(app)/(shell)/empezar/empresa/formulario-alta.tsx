"use client";

import { type ReactNode, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { BarraEnviar, BloqueFormulario as Bloque } from "@/components/ui/formulario";
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
  MSG_REVISA_CORREO_EMPRESA,
  type TipoCuentaEmpresa,
  type TipoNegocio,
  VALORES_TIPO_CUENTA_EMPRESA,
  VALORES_TIPO_NEGOCIO,
} from "@/config/constants";
import { unoDe } from "@/lib/valores";
import { mensajeDe, postJson } from "@/lib/cliente-http";
import type { PaisParaElegir } from "@/lib/paises";

const CONTROL =
  "min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text focus:bg-raised focus:border-text";
const ETIQUETA = "mb-1.5 block text-sm font-medium text-text";
const AYUDA = "text-2xs text-text-dim";

/** Un desplegable con su etiqueta real, con el mismo aspecto que `Campo`. */
function Selector({
  id,
  label,
  value,
  onChange,
  autoComplete,
  className = "",
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={ETIQUETA}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        autoComplete={autoComplete}
        className={CONTROL}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

/**
 * ALTA DE EMPRESA — la interfaz de `POST /api/empresa`, que crea LA CUENTA Y LA EMPRESA juntas.
 *
 * NO CONVIERTE UNA CUENTA EXISTENTE, y el formulario lo dice en el bloque «Acceso», antes de que nadie
 * escriba el correo (`MSG_EMPRESA_CORREO_NUEVO`). Decirlo aquí y no en la respuesta no es una
 * preferencia de copy: contestar «ese correo ya tiene cuenta» convertiría el alta en un oráculo que
 * confirma qué direcciones existen, que es justo lo que el registro de participante se cuida de no
 * abrir.
 *
 * NO HAY CSRF que pedir —no hay sesión todavía— ni sesión que crear al terminar: como en el
 * registro de participante, primero se verifica el correo. Por eso el final no es una navegación,
 * es una pantalla que explica qué pasa ahora.
 *
 * LA MAQUETA (fase9-diseno): cinco bloques con título —Tu negocio · Ubicación · Contacto · Datos
 * fiscales · Acceso— y los cortos de dos en dos. En móvil el botón de enviar va en una barra PEGADA
 * encima de la navegación inferior: es un formulario largo y la acción tiene que estar a mano sin
 * bajar hasta el final. La barra dice además QUÉ falta, porque un botón apagado sin explicación
 * parece roto.
 *
 * ┌─ LOS PAÍSES LLEGAN HECHOS, DESDE EL SERVIDOR, Y NO ES UN CAPRICHO ─────────────────────────────┐
 * │ La lista sale de `Intl.DisplayNames` + `localeCompare`, y el ICU de Node NO ordena igual que   │
 * │ el de Chrome: con la lista calculada aquí, el servidor pintaba «Hungría» donde el navegador    │
 * │ esperaba «Hong Kong» y React abortaba la hidratación de la página entera (visto en el dev, no  │
 * │ deducido). Calculándola en UN solo sitio —el Server Component que monta esto— no hay dos       │
 * │ verdades que comparar. Hay test de que este fichero no vuelve a calcularla.                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function FormularioAlta({ paises }: { paises: readonly PaisParaElegir[] }) {
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
  // Lo que falta, en el orden del formulario. `valido` sale de aquí: una sola lista de condiciones.
  const faltan = [
    nombreLimpio.length >= EMPRESA_NOMBRE_MIN ? null : "el nombre",
    personaContacto.trim().length > 1 ? null : "la persona de contacto",
    tieneContacto ? null : "la web o las redes",
    email.trim().length > 3 ? null : "el correo",
    password.length > 0 ? null : "la contraseña",
    acepta ? null : "aceptar la política de privacidad",
  ].filter((f): f is string => f !== null);
  const valido = faltan.length === 0;

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

  // NO dice «empresa registrada» ni promete un enlace de verificación: las dos cosas serían mentira
  // si el correo ya tenía cuenta. Dice lo que es verdad en los dos casos —hay un mensaje en tu
  // correo— y la frase es la misma que devuelve la API. Lo encontró Junior en producción: la
  // pantalla anterior prometía un enlace que nunca salió.
  if (enviado) {
    return (
      <Tarjeta className="p-5 lg:p-6" role="status">
        <p className="text-base font-semibold text-text">Recibido.</p>
        <p className="mt-2 max-w-prose text-sm text-text">{MSG_REVISA_CORREO_EMPRESA}</p>
      </Tarjeta>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido && !enviando) void enviar();
      }}
    >
      <Bloque titulo="Tu negocio">
        <Campo
          id="nombre"
          label="Nombre comercial"
          className="sm:col-span-2"
          value={nombre}
          maxLength={EMPRESA_NOMBRE_MAX}
          autoComplete="organization"
          placeholder="Como te conoce la gente"
          onChange={(e) => setNombre(e.target.value)}
        />
        <Selector
          id="tipoCuenta"
          label="¿Quién firma la cuenta?"
          value={tipoCuenta}
          onChange={(v) => setTipoCuenta(unoDe(VALORES_TIPO_CUENTA_EMPRESA, v))}
        >
          {VALORES_TIPO_CUENTA_EMPRESA.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_CUENTA[t]}
            </option>
          ))}
        </Selector>
        <Selector
          id="tipoNegocio"
          label="¿Qué clase de negocio es?"
          value={tipoNegocio}
          onChange={(v) => setTipoNegocio(unoDe(VALORES_TIPO_NEGOCIO, v))}
        >
          {VALORES_TIPO_NEGOCIO.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_NEGOCIO[t]}
            </option>
          ))}
        </Selector>
      </Bloque>

      <Bloque titulo="Ubicación">
        <Selector
          id="paisIso"
          label="País"
          value={paisIso}
          autoComplete="country"
          onChange={setPaisIso}
        >
          {paises.map((p) => (
            <option key={p.iso} value={p.iso}>
              {p.nombre}
            </option>
          ))}
        </Selector>
        <Campo
          id="ciudadTexto"
          label="Ciudad (opcional)"
          value={ciudadTexto}
          maxLength={EMPRESA_CIUDAD_MAX}
          autoComplete="address-level2"
          placeholder="Dónde estáis"
          onChange={(e) => setCiudadTexto(e.target.value)}
        />
        <div className="sm:col-span-2">
          <Campo
            id="direccion"
            label="Dirección (opcional)"
            value={direccion}
            maxLength={EMPRESA_DIRECCION_MAX}
            autoComplete="street-address"
            placeholder="Calle y número"
            onChange={(e) => setDireccion(e.target.value)}
          />
          <p className={`mt-1.5 ${AYUDA}`}>Solo para comprobar quién eres: no se publica.</p>
        </div>
      </Bloque>

      <Bloque titulo="Contacto" descripcion={MSG_EMPRESA_WEB_O_REDES}>
        <Campo
          id="personaContacto"
          label="Persona de contacto"
          value={personaContacto}
          maxLength={EMPRESA_CONTACTO_MAX}
          autoComplete="name"
          placeholder="Con quién hablamos"
          onChange={(e) => setPersonaContacto(e.target.value)}
        />
        {/* Hueco a propósito: la persona es un nombre, no necesita las dos columnas. */}
        <span className="hidden sm:block" aria-hidden />
        <Campo
          id="webUrl"
          label="Web"
          type="url"
          inputMode="url"
          autoComplete="url"
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
          placeholder="@tunegocio, un enlace…"
          onChange={(e) => setRedes(e.target.value)}
        />
      </Bloque>

      <Bloque
        titulo="Datos fiscales (opcional)"
        descripcion="La identificación fiscal solo la vemos nosotros al verificarte: no sale en ningún listado ni en ningún correo."
      >
        <Campo
          id="fiscalId"
          label="Identificación fiscal"
          value={fiscalId}
          maxLength={EMPRESA_FISCAL_MAX}
          autoComplete="off"
          placeholder="NIF, CIF, RUT, RFC…"
          onChange={(e) => setFiscalId(e.target.value)}
        />
        {fiscalId.trim() ? (
          <Selector
            id="fiscalPaisIso"
            label="País que la emite"
            value={fiscalPaisIso}
            autoComplete="off"
            onChange={setFiscalPaisIso}
          >
            <option value="">Sin indicar</option>
            {paises.map((p) => (
              <option key={p.iso} value={p.iso}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        ) : null}
      </Bloque>

      <Bloque titulo="Acceso" descripcion={MSG_EMPRESA_CORREO_NUEVO}>
        <Campo
          id="email"
          label="Correo"
          type="email"
          inputMode="email"
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
        {/* El área táctil es la etiqueta entera (≥44 px), no solo la casilla. */}
        <label className="flex min-h-[44px] items-start gap-3 py-2 text-sm text-text sm:col-span-2">
          <input
            type="checkbox"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            Acepto la{" "}
            <a href="/privacidad" className="underline underline-offset-2">
              política de privacidad
            </a>{" "}
            y los términos.
          </span>
        </label>
      </Bloque>

      <BarraEnviar
        nota={
          error ? (
            <p role="alert" className="text-sm text-alarm">
              {error}
            </p>
          ) : !valido ? (
            // En móvil, corto (la barra tapa pantalla): lo primero que falta y cuántos más. Con
            // ancho, la lista entera.
            <p className={AYUDA} aria-live="polite">
              <span className="sm:hidden">
                Falta: {faltan[0]}
                {faltan.length > 1 ? ` y ${faltan.length - 1} más` : ""}.
              </span>
              <span className="hidden sm:inline">Falta: {faltan.join(", ")}.</span>
            </p>
          ) : null
        }
      >
        <Boton
          type="submit"
          disabled={!valido || enviando}
          className="w-full shrink-0 whitespace-nowrap sm:w-auto"
        >
          {enviando ? "Enviando…" : "Crear cuenta de empresa"}
        </Boton>
      </BarraEnviar>
    </form>
  );
}
