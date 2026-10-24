"use client";

import { useEffect, useRef, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { CATEGORIES, COMISION_SPONSOR_BPS_DEFECTO, SPONSOR_NOMBRE_MAX } from "@/config/constants";
import { mensajeDe, obtenerCsrfToken } from "@/lib/cliente-http";
import { bpsAPorcentaje, comisionCents, porcentajeABps, totalSponsorCents } from "@/lib/comision";
import { centimosAImporte, importeACentimos } from "@/lib/dinero";
import { NIVEL_MINIMO_ABIERTO } from "@/lib/nivel-reto";
import { NIVELES } from "@/lib/niveles";
import type { RetoAdminFila } from "@/server/services/retos-admin";
import { AVATAR_TIPOS, avatarExcedeTope } from "@/app/(app)/(shell)/perfil/perfil-logic";

type Estado = "idle" | "enviando" | "hecho";

const CLASE_CONTROL =
  "min-h-[44px] w-full rounded-sm border border-line bg-surface px-3.5 text-base text-text placeholder:text-text-dim focus:border-text focus:bg-raised focus:outline-none";

/** datetime-local ("2026-08-25T14:00", hora LOCAL) -> ISO en UTC; null si vacío/ inválido. */
function aIsoUtc(valorLocal: string): string | null {
  if (!valorLocal) return null;
  const d = new Date(valorLocal);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Instante UTC (Date) -> valor para un `datetime-local`, en la hora LOCAL del navegador. Inverso EXACTO
 * de `aIsoUtc` (usa los getters locales, igual que `new Date(valorLocal)` interpreta la entrada como
 * local): así precargar y volver a enviar no desplaza la hora. Para EDITAR.
 */
function aInputLocal(fecha: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

/**
 * Formulario de reto (panel admin), `multipart/form-data`. Sirve para CREAR (queda DRAFT) y para EDITAR
 * (`reto` presente): mismos campos y validación de UX; el gate real es el servidor (Zod + sanitizado de
 * imagen). Al editar, el `publicCode` NO cambia y el `status` se conserva (publicar es aparte). Único
 * --df-action = el botón de acción. El premio va en CÉNTIMOS enteros (sin float); las fechas a ISO UTC.
 * PORTADA opcional: al editar, si no se elige una nueva se conserva la actual.
 */
export function FormularioReto({
  reto,
  onGuardado,
  onCancelar,
}: {
  /** Reto a editar; `undefined` = crear. */
  reto?: RetoAdminFila;
  /** Se llama tras guardar con éxito (el padre refresca la lista y, al editar, cierra la edición). */
  onGuardado: () => void;
  /** Solo en edición: cancelar y volver a la lista sin guardar. */
  onCancelar?: () => void;
}) {
  const esEdicion = reto !== undefined;

  const [titulo, setTitulo] = useState(reto?.title ?? "");
  const [descripcion, setDescripcion] = useState(reto?.description ?? "");
  const [categoria, setCategoria] = useState(reto?.category ?? CATEGORIES[0]!.key);
  const [reglas, setReglas] = useState(reto?.rules ?? "");
  const [premio, setPremio] = useState(reto ? centimosAImporte(reto.prizeAmountCents) : "0");
  const [apertura, setApertura] = useState(reto ? aInputLocal(reto.startsAt) : "");
  const [cierre, setCierre] = useState(reto ? aInputLocal(reto.deadline) : "");
  const [ganadores, setGanadores] = useState(reto ? String(reto.winnersCount) : "1");
  const [nivelMinimo, setNivelMinimo] = useState(reto?.nivelMinimo ?? NIVEL_MINIMO_ABIERTO);
  const [soloVip, setSoloVip] = useState(reto?.soloVip ?? false);
  const [esPatrocinado, setEsPatrocinado] = useState(reto?.esPatrocinado ?? false);
  const [sponsorNombre, setSponsorNombre] = useState(reto?.sponsorNombre ?? "");
  // El % se edita en PORCENTAJE (lo que una persona negocia) y viaja en BPS (lo que se guarda).
  const [comisionPct, setComisionPct] = useState(
    bpsAPorcentaje(reto?.comisionBps ?? COMISION_SPONSOR_BPS_DEFECTO),
  );
  const [logo, setLogo] = useState<File | null>(null);
  const [previaLogo, setPreviaLogo] = useState<string | null>(reto?.sponsorLogo ?? null);
  const logoUrlRef = useRef<string | null>(null);
  const [portada, setPortada] = useState<File | null>(null);
  // Previa: object URL de un fichero recién elegido, o la portada ACTUAL (URL de Caddy) al editar.
  const [previa, setPrevia] = useState<string | null>(reto?.coverImage ?? null);
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [aviso, setAviso] = useState<string | undefined>(undefined);
  // Solo se revocan las object URL que creamos aquí (no la URL de Caddy de la portada actual).
  const objectUrlRef = useRef<string | null>(null);

  const ocupado = estado === "enviando";

  /**
   * LO QUE SE LE VA A FACTURAR A LA MARCA, calculado con la MISMA función que la contabilidad del
   * panel. Si esta pantalla hiciera su propia cuenta, el admin pactaría una cifra y luego se
   * facturaría otra. Con un premio o un porcentaje a medio escribir no se inventa nada: se calla.
   */
  const resumenComision = (() => {
    const centimos = importeACentimos(premio);
    const bps = porcentajeABps(comisionPct);
    if (centimos === null || bps === null) return "Escribe el premio y el % para ver el total.";
    return (
      `Premio ${centimosAImporte(centimos)} + comisión ${centimosAImporte(comisionCents(centimos, bps))}` +
      ` = ${centimosAImporte(totalSponsorCents(centimos, bps))} a cobrar a la marca.`
    );
  })();

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    };
  }, []);

  function onElegirPortada(e: React.ChangeEvent<HTMLInputElement>): void {
    setError(undefined);
    const f = e.target.files?.[0] ?? null;
    if (f && !AVATAR_TIPOS.includes(f.type as (typeof AVATAR_TIPOS)[number])) {
      setError("La portada debe ser una imagen JPG, PNG o WebP.");
      return;
    }
    if (f && avatarExcedeTope(f.size)) {
      setError("La portada es demasiado grande. Prueba con una imagen más ligera.");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = f ? URL.createObjectURL(f) : null;
    objectUrlRef.current = url;
    // Al deseleccionar un fichero nuevo en edición, se vuelve a mostrar la portada actual.
    setPrevia(url ?? reto?.coverImage ?? null);
    setPortada(f);
  }

  /** El LOGO pasa por las MISMAS comprobaciones de UX que la portada: tipo y tamaño. */
  function onElegirLogo(e: React.ChangeEvent<HTMLInputElement>): void {
    setError(undefined);
    const f = e.target.files?.[0] ?? null;
    if (f && !AVATAR_TIPOS.includes(f.type as (typeof AVATAR_TIPOS)[number])) {
      setError("El logo debe ser una imagen JPG, PNG o WebP.");
      return;
    }
    if (f && avatarExcedeTope(f.size)) {
      setError("El logo es demasiado grande. Prueba con una imagen más ligera.");
      return;
    }
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    const url = f ? URL.createObjectURL(f) : null;
    logoUrlRef.current = url;
    setPreviaLogo(url ?? reto?.sponsorLogo ?? null);
    setLogo(f);
  }

  function reiniciarCrear(): void {
    setTitulo("");
    setDescripcion("");
    setReglas("");
    setPremio("0");
    setApertura("");
    setCierre("");
    setGanadores("1");
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPrevia(null);
    setPortada(null);
    setEsPatrocinado(false);
    setSponsorNombre("");
    setComisionPct(bpsAPorcentaje(COMISION_SPONSOR_BPS_DEFECTO));
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    logoUrlRef.current = null;
    setPreviaLogo(null);
    setLogo(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setEstado("idle");
    setError(undefined);
    setAviso(undefined);

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
    /*
     * LAS MISMAS DOS REGLAS QUE EL SERVIDOR, AQUÍ TAMBIÉN. No eran ninguna: el submit solo miraba
     * que las fechas se pudieran parsear, y el `refine` de Zod era lo único que paraba un cierre
     * en el pasado. Funcionaba —el servidor es la autoridad y lo sigue siendo— pero el admin se
     * enteraba después de rellenar el formulario entero, y con un mensaje de API.
     *
     * Y el cierre pasado es el error CARO de esta pantalla: publicado, el reto nace muerto y ya no
     * se reabre editando. Decirlo antes de enviar cuesta cuatro líneas.
     *
     * Se comparan los INSTANTES ya convertidos a UTC, no las cadenas del input: dos `datetime-local`
     * se pueden comparar como texto porque el formato ordena, pero contra "ahora" no — y esa es
     * justo la comparación que importa.
     */
    if (new Date(startsAt) >= new Date(deadline)) {
      setError("El cierre debe ser posterior a la apertura.");
      return;
    }
    if (new Date(deadline) <= new Date()) {
      setError("El cierre debe estar en el futuro: corrige la fecha o la hora de cierre.");
      return;
    }
    // LA MARCA ES OBLIGATORIA SI EL RETO ES PATROCINADO. El servidor lo vuelve a comprobar (es la
    // autoridad); aquí se dice antes para no mandar un formulario que va a volver con un 400.
    if (esPatrocinado && sponsorNombre.trim().length === 0) {
      setError("Escribe el nombre de la marca que patrocina el reto.");
      return;
    }
    // El porcentaje se teclea como "25" o "25.5" y se guarda en PUNTOS BÁSICOS, enteros: el
    // redondeo se hace AQUÍ, una vez, y lo que viaja ya es el número que se guarda.
    const bps = porcentajeABps(comisionPct);
    if (esPatrocinado && bps === null) {
      setError("La comisión no es válida. Usa un porcentaje como 25 o 25.5 (entre 0 y 100).");
      return;
    }

    setEstado("enviando");
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
      cuerpo.set("nivelMinimo", nivelMinimo);
      // SIEMPRE, también cuando es `false`: una casilla HTML sin marcar no manda nada, y entonces
      // "quitar el exclusivo" al editar no llegaría al servidor — el reto se quedaría exclusivo
      // para siempre. Se manda el valor explícito y el schema lo entiende (ver `crearRetoSchema`).
      cuerpo.set("soloVip", soloVip ? "1" : "0");
      // Igual que `soloVip`: SIEMPRE, también en "0", o desmarcar no llegaría al servidor.
      cuerpo.set("esPatrocinado", esPatrocinado ? "1" : "0");
      cuerpo.set("sponsorNombre", sponsorNombre);
      cuerpo.set("comisionBps", String(bps ?? COMISION_SPONSOR_BPS_DEFECTO));
      if (logo) cuerpo.set("sponsorLogo", logo);
      if (portada) cuerpo.set("portada", portada); // al editar sin fichero nuevo, se conserva la actual

      const url = esEdicion ? `/api/panel/retos/${reto.id}/editar` : "/api/panel/retos";
      // Multipart (no JSON): token CSRF del helper compartido, fetch propio.
      const csrfToken = await obtenerCsrfToken();
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
        body: cuerpo,
      });
      if (res.ok) {
        const ok = (await res.json().catch(() => ({}))) as {
          portadaGuardada?: boolean;
          aviso?: string;
        };
        // El reto se creó/editó. Si la portada falló, el servidor lo avisa (portadaGuardada:false).
        if (ok.portadaGuardada === false) {
          setAviso(ok.aviso ?? "La portada no se pudo guardar.");
        }
        setEstado("hecho");
        if (!esEdicion) reiniciarCrear();
        onGuardado();
        return;
      }
      setEstado("idle");
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Tu sesión ha caducado. Vuelve a iniciar sesión.");
      } else {
        setError(
          mensajeDe(data) || "No hemos podido guardar el reto. Revisa los datos e inténtalo.",
        );
      }
    } catch (err) {
      setEstado("idle");
      setError(
        err instanceof Error && err.message === "SIN_SESION"
          ? "Inicia sesión para guardar el reto."
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">
          {esEdicion ? "Editar reto" : "Nuevo reto"}
        </h2>
        {esEdicion ? (
          <span className="text-2xs tracking-widest text-text-dim uppercase">
            {reto.publicCode} · el estado no cambia al editar
          </span>
        ) : null}
      </div>
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
            onChange={(e) => setCategoria(e.target.value)}
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

        <div>
          <label htmlFor="reto-nivel" className="mb-1.5 block text-sm font-medium text-text">
            ¿Qué nivel puede participar?
          </label>
          <select
            id="reto-nivel"
            value={nivelMinimo}
            onChange={(e) => setNivelMinimo(e.target.value)}
            disabled={ocupado}
            className={CLASE_CONTROL}
          >
            {NIVELES.map((n) => (
              <option key={n.clave} value={n.clave}>
                {/* Rookie empieza en 0 puntos, así que "de Rookie para arriba" ES todo el mundo:
                    se dice TODOS, que es lo que el admin está eligiendo de verdad. */}
                {n.clave === NIVEL_MINIMO_ABIERTO ? "TODOS" : `${n.nombre} o superior`}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-2xs text-text-dim">
            Es un mínimo, no un nivel exacto: en un reto de Pro también entran Elite y Legend.
          </p>
        </div>

        {/* SOLO VIP — al lado del nivel porque son las dos puertas del reto, y SE COMPONEN: un reto
            puede pedir nivel Pro Y ser exclusivo, y entonces hacen falta las dos cosas. Son ejes
            distintos (el nivel se juega, el VIP se paga), por eso son dos controles y no una
            opción más del desplegable de nivel. */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-text">¿Reto exclusivo?</span>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-sm border border-line bg-surface px-3.5">
            <input
              type="checkbox"
              name="soloVip"
              checked={soloVip}
              onChange={(e) => setSoloVip(e.target.checked)}
              disabled={ocupado}
              className="h-4 w-4 shrink-0 accent-[var(--vip-gold)]"
            />
            <span className="text-base text-text">Solo VIP Mythic</span>
          </label>
          <p className="mt-1.5 text-2xs text-text-dim">
            El reto se ve igual para todo el mundo —con su marco dorado—, pero solo pueden
            participar los suscriptores.
          </p>
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

        {/* PATROCINIO. La casilla DESCUBRE los campos de la marca en vez de tenerlos siempre
            visibles: un reto patrocinado es la excepción, y tres campos vacíos en todos los demás
            son tres sitios donde escribir algo por error. Lo que no se ve, no se manda (el
            servidor ignora la marca si el reto no es patrocinado). */}
        <div className="lg:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-text">¿Reto patrocinado?</span>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-sm border border-line bg-surface px-3.5">
            <input
              type="checkbox"
              name="esPatrocinado"
              checked={esPatrocinado}
              onChange={(e) => setEsPatrocinado(e.target.checked)}
              disabled={ocupado}
              className="h-4 w-4 shrink-0 accent-[var(--df-action)]"
            />
            <span className="text-base text-text">Lo paga una marca</span>
          </label>
          <p className="mt-1.5 text-2xs text-text-dim">
            El ganador cobra el premio íntegro, como en cualquier reto. La comisión se le factura a
            la marca aparte y solo se ve en el panel.
          </p>
        </div>

        {esPatrocinado ? (
          <>
            <Campo
              id="reto-sponsor"
              label="Marca"
              placeholder="Nombre comercial"
              value={sponsorNombre}
              onChange={(e) => setSponsorNombre(e.target.value)}
              disabled={ocupado}
              maxLength={SPONSOR_NOMBRE_MAX}
            />

            <div>
              <Campo
                id="reto-comision"
                label="Comisión (%)"
                inputMode="decimal"
                placeholder="25"
                value={comisionPct}
                onChange={(e) => setComisionPct(e.target.value)}
                disabled={ocupado}
              />
              {/* EL CÁLCULO, A LA VISTA Y EN VIVO: cobrar tiene que ser leer una cifra, y la
                  primera vez que se lee es aquí, al pactarla. Sale de la MISMA función que la
                  contabilidad, así que no puede discrepar con lo que luego se facture. */}
              <p className="mt-1.5 text-2xs text-text-dim">{resumenComision}</p>
            </div>

            {/* LOGO opcional: la marca puede no tener uno a mano, y el nombre ya la identifica. */}
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-text">
                Logo de la marca <span className="text-text-dim">(opcional)</span>
              </label>
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-sm border border-line bg-raised">
                  {previaLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- previa local u objeto de Caddy
                    <img
                      src={previaLogo}
                      alt="Vista previa del logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-2xs text-text-dim">Sin logo</span>
                  )}
                </div>
                <input
                  type="file"
                  accept={AVATAR_TIPOS.join(",")}
                  onChange={onElegirLogo}
                  disabled={ocupado}
                  className="block w-full text-sm text-text-dim file:mr-3 file:min-h-[44px] file:cursor-pointer file:rounded-sm file:border file:border-line file:bg-surface file:px-4 file:text-sm file:font-medium file:text-text"
                />
              </div>
            </div>
          </>
        ) : null}

        {/* PORTADA opcional. Al editar, la previa arranca con la portada actual. */}
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-text">
            Portada <span className="text-text-dim">(opcional)</span>
          </label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-28 shrink-0 overflow-hidden rounded-sm border border-line bg-raised">
              {previa ? (
                // eslint-disable-next-line @next/next/no-img-element -- previa local (object URL) o Caddy
                <img
                  src={previa}
                  alt="Vista previa de la portada"
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div>
              <label
                htmlFor="reto-portada"
                className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-sm border border-line bg-raised px-4 text-sm font-semibold text-text transition-colors duration-150 ease-mechanical hover:bg-surface ${ocupado ? "pointer-events-none opacity-60" : ""}`}
              >
                {previa ? "Cambiar imagen" : "Elegir imagen"}
              </label>
              <input
                id="reto-portada"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={ocupado}
                onChange={onElegirPortada}
              />
              <p className="mt-2 text-2xs tracking-widest text-text-dim uppercase">
                {esEdicion
                  ? "JPG, PNG o WebP · si no eliges otra, se mantiene la actual"
                  : "JPG, PNG o WebP · se recorta a lo ancho de la tarjeta"}
              </p>
            </div>
          </div>
        </div>

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
        {/* `min` = la APERTURA: el calendario ya no deja elegir un cierre anterior a su propio
            inicio. Sale del estado del formulario, no del reloj, y por eso no hay mismatch de
            hidratación que gestionar.
            NO lleva `min` de "ahora" a propósito: eso sí dependería del reloj —un valor distinto
            en el servidor y en el navegador— y el cierre en el pasado ya lo paran tres sitios
            (el submit de aquí, el `refine` de Zod y el candado de publicar), cada uno con su
            mensaje. Un cuarto, a cambio de un efecto, no compraba nada. */}
        <Campo
          id="reto-cierre"
          label="Cierre"
          type="datetime-local"
          value={cierre}
          onChange={(e) => setCierre(e.target.value)}
          disabled={ocupado}
          {...(apertura ? { min: apertura } : {})}
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
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Boton
          type="submit"
          variante="principal"
          disabled={ocupado}
          className="py-3.5 shadow-[var(--df-cta-lift)]"
        >
          {ocupado
            ? esEdicion
              ? "Guardando…"
              : "Creando…"
            : esEdicion
              ? "Guardar cambios"
              : "Crear reto"}
        </Boton>
        {esEdicion && onCancelar ? (
          <button
            type="button"
            onClick={onCancelar}
            disabled={ocupado}
            className="min-h-[44px] rounded-sm border border-line px-4 text-sm font-medium text-text-dim transition-colors duration-150 ease-mechanical hover:bg-raised hover:text-text disabled:opacity-40"
          >
            Cancelar
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alarm">
          {error}
        </p>
      ) : null}
      {estado === "hecho" && !esEdicion ? (
        <p role="status" className="mt-3 text-sm text-ok">
          Reto creado como borrador. Publícalo desde la lista cuando esté listo.
        </p>
      ) : null}
      {aviso ? (
        <p role="alert" className="mt-2 text-sm text-alarm">
          {aviso}
        </p>
      ) : null}
    </form>
  );
}
