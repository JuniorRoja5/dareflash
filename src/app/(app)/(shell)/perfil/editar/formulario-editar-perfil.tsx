"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { useTextos } from "@/components/textos-provider";
import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { mensajeDe, obtenerCsrfToken, patchJsonCsrf } from "@/lib/cliente-http";

import {
  AVATAR_TIPOS,
  BIO_MAX,
  NOMBRE_MAX,
  USERNAME_MAX,
  avatarExcedeTope,
  nombreEsValido,
  usernameEsValido,
} from "../perfil-logic";

type EstadoNombre = "idle" | "guardando" | "guardado";
type EstadoAvatar = "idle" | "subiendo";

/**
 * Formulario de EDITAR PERFIL (isla cliente). Dos acciones independientes:
 *  - NOMBRE: PATCH /api/perfil (JSON) — 100% funcional. La validación de aquí es SOLO UX; el gate es
 *    el servidor (Zod). La ÚNICA acción principal de la pantalla es "Guardar nombre".
 *  - FOTO: POST /api/perfil/avatar (multipart) — el servidor valida/recomprime/quita EXIF y GUARDA el
 *    WebP en el volumen que Caddy sirve en /avatars/*; devuelve la nueva URL. `router.refresh()` en
 *    éxito revalida los Server Components para que el avatar se actualice también fuera de aquí.
 *
 * Todo error se muestra en copy HUMANO; nunca códigos, 401 ni CSRF crudos. CSRF: se pide un token
 * atado a la sesión a /api/auth/csrf y se manda en `X-CSRF-Token` (igual que Crear).
 */
export function FormularioEditarPerfil({
  nombreInicial,
  usuario,
  puntos,
  imagenInicial,
  bioInicial,
  websiteInicial,
  instagramInicial,
  youtubeInicial,
  children,
}: {
  nombreInicial: string;
  usuario: string;
  /** Puntos propios: la previa del avatar ensena el anillo de nivel que veran los demas. */
  puntos: number;
  imagenInicial: string | null;
  bioInicial: string;
  websiteInicial: string;
  instagramInicial: string;
  youtubeInicial: string;
  /** Contenido de la columna DERECHA bajo "Perfil" (hoy: la tarjeta de Contraseña). Solo maqueta. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const t = useTextos("editarPerfil");
  const [nombre, setNombre] = useState(nombreInicial);
  const [username, setUsername] = useState(usuario);
  const [errorUsername, setErrorUsername] = useState<string | undefined>(undefined);
  const [bio, setBio] = useState(bioInicial);
  const [website, setWebsite] = useState(websiteInicial);
  const [instagram, setInstagram] = useState(instagramInicial);
  const [youtube, setYoutube] = useState(youtubeInicial);
  const [errorNombre, setErrorNombre] = useState<string | undefined>(undefined);
  const [estadoNombre, setEstadoNombre] = useState<EstadoNombre>("idle");

  const [ficheroAvatar, setFicheroAvatar] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [errorAvatar, setErrorAvatar] = useState<string | undefined>(undefined);
  const [avisoAvatar, setAvisoAvatar] = useState<string | undefined>(undefined);
  const [estadoAvatar, setEstadoAvatar] = useState<EstadoAvatar>("idle");
  const previaRef = useRef<string | null>(null);

  const nombreOcupado = estadoNombre === "guardando";
  const avatarOcupado = estadoAvatar === "subiendo";

  // La URL de previsualización (object URL) se revoca al cambiarla o al desmontar: no se filtra memoria.
  useEffect(() => {
    return () => {
      if (previaRef.current) URL.revokeObjectURL(previaRef.current);
    };
  }, []);

  async function guardarNombre(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setEstadoNombre("idle");
    if (!nombreEsValido(nombre)) {
      setErrorNombre(t("errorNombre"));
      return;
    }
    setErrorNombre(undefined);
    if (!usernameEsValido(username)) {
      setErrorUsername(t("errorUsuario"));
      return;
    }
    setErrorUsername(undefined);
    setEstadoNombre("guardando");
    try {
      const r = await patchJsonCsrf<{ displayName?: string; username?: string }>("/api/perfil", {
        displayName: nombre,
        username,
        bio,
        website,
        instagram,
        youtube,
      });
      if (r.ok) {
        if (typeof r.data.displayName === "string") setNombre(r.data.displayName);
        // El servidor devuelve el handle YA normalizado (minúsculas): reflejarlo en el campo.
        if (typeof r.data.username === "string") setUsername(r.data.username);
        setEstadoNombre("guardado");
        return;
      }
      if (r.status === 401) {
        setErrorNombre(t("sesionCaducadaGuardar"));
      } else if (r.code === "USERNAME_TAKEN") {
        setErrorUsername(t("usuarioOcupado"));
      } else if (r.status === 429) {
        setErrorNombre(t("demasiadasVeces"));
      } else {
        setErrorNombre(mensajeDe(r.data) || t("errorGuardar"));
      }
      setEstadoNombre("idle");
    } catch (err) {
      setErrorNombre(
        err instanceof Error && err.message === "SIN_SESION"
          ? t("sinSesionGuardar")
          : t("sinConexion"),
      );
      setEstadoNombre("idle");
    }
  }

  function onElegirAvatar(e: React.ChangeEvent<HTMLInputElement>): void {
    setAvisoAvatar(undefined);
    setErrorAvatar(undefined);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!AVATAR_TIPOS.includes(f.type as (typeof AVATAR_TIPOS)[number])) {
      setFicheroAvatar(null);
      setErrorAvatar(t("fotoTipo"));
      return;
    }
    if (avatarExcedeTope(f.size)) {
      setFicheroAvatar(null);
      setErrorAvatar(t("fotoGrande"));
      return;
    }
    if (previaRef.current) URL.revokeObjectURL(previaRef.current);
    const url = URL.createObjectURL(f);
    previaRef.current = url;
    setPrevia(url);
    setFicheroAvatar(f);
  }

  async function subirAvatar(): Promise<void> {
    if (!ficheroAvatar) {
      setErrorAvatar(t("fotoPrimero"));
      return;
    }
    setErrorAvatar(undefined);
    setAvisoAvatar(undefined);
    setEstadoAvatar("subiendo");
    try {
      // Multipart (NO JSON): usa el token del helper CSRF compartido, pero el fetch es propio.
      const csrfToken = await obtenerCsrfToken();
      const cuerpo = new FormData();
      cuerpo.append("avatar", ficheroAvatar);
      const res = await fetch("/api/perfil/avatar", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
        body: cuerpo,
      });
      if (res.ok) {
        setAvisoAvatar(t("fotoHecha"));
        setEstadoAvatar("idle");
        router.refresh(); // revalida los Server Components -> el avatar nuevo se ve en /perfil, nav…
        return;
      }
      const msg = mensajeDe(await res.json().catch(() => ({})));
      if (res.status === 401) {
        setErrorAvatar(t("sesionCaducada"));
      } else if (res.status === 429) {
        setErrorAvatar(t("fotoDemasiadas"));
      } else {
        setErrorAvatar(msg || t("fotoError"));
      }
      setEstadoAvatar("idle");
    } catch {
      setErrorAvatar(t("sinConexion"));
      setEstadoAvatar("idle");
    }
  }

  return (
    // DOS COLUMNAS POR TEMA, no por tamaño: a la izquierda TU PERFIL (la foto y tus datos, que es lo
    // que ve la gente); a la derecha los AJUSTES DE CUENTA (correo y contraseña, que no ve nadie).
    // Antes las tres cosas se apilaban en la misma columna y la pantalla era un scroll largo con la
    // mitad del ancho vacía. En móvil sigue siendo UNA columna apilada, idéntica a antes.
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      {/* COLUMNA IZQUIERDA — TU PERFIL: foto y datos. */}
      <div className="space-y-8">
        {/* COLUMNA IZQUIERDA — FOTO. Previsualización + selector. Acción SECUNDARIA (el acento único es
          "Guardar perfil"). */}
        <section className="df-rise rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md">
          <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">
            {t("foto")}
          </h2>
          <div className="mt-4 flex items-center gap-5">
            {previa ? (
              // eslint-disable-next-line @next/next/no-img-element -- previsualización local (object URL), no un remoto
              <img
                src={previa}
                alt={t("fotoPrevia")}
                className="h-20 w-20 shrink-0 rounded-full object-cover"
              />
            ) : imagenInicial ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar actual del usuario
              <img
                src={imagenInicial}
                alt={t("fotoActual")}
                className="h-20 w-20 shrink-0 rounded-full object-cover"
              />
            ) : (
              <Avatar nombre={nombre || usuario || "?"} tamano="xl" puntos={puntos} />
            )}

            <div className="min-w-0">
              <label
                htmlFor="avatar-file"
                className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-sm border border-line bg-raised px-4 text-sm font-semibold text-text transition-colors duration-150 ease-mechanical hover:bg-surface ${avatarOcupado ? "pointer-events-none opacity-60" : ""}`}
              >
                {t("elegirImagen")}
              </label>
              <input
                id="avatar-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarOcupado}
                onChange={onElegirAvatar}
              />
              <p className="mt-2 text-2xs tracking-widest text-text-dim uppercase">
                {t("formatosFoto")}
              </p>
            </div>
          </div>

          {ficheroAvatar ? (
            <Boton
              type="button"
              variante="secundario"
              disabled={avatarOcupado}
              onClick={subirAvatar}
              className="mt-4 py-3"
            >
              {avatarOcupado ? t("subiendo") : t("guardarFoto")}
            </Boton>
          ) : null}

          {errorAvatar ? (
            <p role="alert" className="mt-3 text-sm text-alarm">
              {errorAvatar}
            </p>
          ) : null}
          {avisoAvatar ? (
            <p
              role="status"
              className="mt-3 rounded-sm border border-line bg-void p-3 text-sm text-text-dim"
            >
              {avisoAvatar}
            </p>
          ) : null}
        </section>

        {/* PERFIL — acción principal (acento único). */}
        <form
          onSubmit={guardarNombre}
          noValidate
          className="df-rise rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md"
          style={{ animationDelay: "60ms" }}
        >
          <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">
            {t("seccionPerfil")}
          </h2>
          <div className="mt-4 flex flex-col gap-5">
            <Campo
              id="perfil-nombre"
              label={t("nombreVisible")}
              placeholder={t("nombrePlaceholder")}
              maxLength={NOMBRE_MAX}
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                if (estadoNombre === "guardado") setEstadoNombre("idle");
              }}
              error={errorNombre}
              disabled={nombreOcupado}
            />
            <Campo
              id="perfil-username"
              label={t("nombreUsuario")}
              placeholder={t("usuarioPlaceholder")}
              maxLength={USERNAME_MAX}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errorUsername) setErrorUsername(undefined);
                if (estadoNombre === "guardado") setEstadoNombre("idle");
              }}
              error={errorUsername}
              disabled={nombreOcupado}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <Campo
              id="perfil-bio"
              label={t("biografia")}
              placeholder={t("bioPlaceholder")}
              maxLength={BIO_MAX}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              disabled={nombreOcupado}
            />
            <Campo
              id="perfil-website"
              label={t("web")}
              type="url"
              inputMode="url"
              placeholder={t("webPlaceholder")}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={nombreOcupado}
            />
            <Campo
              id="perfil-instagram"
              label={t("instagram")}
              placeholder={t("instagramPlaceholder")}
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              disabled={nombreOcupado}
            />
            <Campo
              id="perfil-youtube"
              label={t("youtube")}
              placeholder={t("youtubePlaceholder")}
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              disabled={nombreOcupado}
            />
          </div>

          <Boton
            type="submit"
            variante="principal"
            disabled={nombreOcupado}
            className="mt-5 w-full py-3.5 shadow-[var(--df-cta-lift)]"
          >
            {nombreOcupado ? t("guardando") : t("guardar")}
          </Boton>

          {estadoNombre === "guardado" ? (
            <p role="status" className="mt-3 text-center text-sm text-ok">
              {t("guardado")}
            </p>
          ) : null}
        </form>
      </div>

      {/* COLUMNA DERECHA — AJUSTES DE CUENTA: correo y contraseña, que llegan como children desde la
          página. Son lo que NO ve nadie más que tú, y por eso van juntos y aparte de tu perfil. */}
      <div className="mt-8 space-y-8 lg:mt-0">{children}</div>
    </div>
  );
}
