"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";

import {
  AVATAR_TIPOS,
  BIO_MAX,
  NOMBRE_MAX,
  avatarExcedeTope,
  nombreEsValido,
} from "../perfil-logic";

/** Lee `error.code` de la respuesta del endpoint de forma defensiva (mismo patrón que login). */
function codigoDe(data: unknown): string {
  if (typeof data === "object" && data && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "object" && err && "message" in err) {
      return String((err as { message?: unknown }).message ?? "");
    }
  }
  return "";
}

type EstadoNombre = "idle" | "guardando" | "guardado";
type EstadoAvatar = "idle" | "subiendo";

/**
 * Formulario de EDITAR PERFIL (isla cliente). Dos acciones independientes:
 *  - NOMBRE: PATCH /api/perfil (JSON) — 100% funcional. La validación de aquí es SOLO UX; el gate es
 *    el servidor (Zod). La ÚNICA acción magenta de la pantalla es "Guardar nombre".
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
  imagenInicial,
  bioInicial,
  websiteInicial,
  instagramInicial,
  youtubeInicial,
  children,
}: {
  nombreInicial: string;
  usuario: string;
  imagenInicial: string | null;
  bioInicial: string;
  websiteInicial: string;
  instagramInicial: string;
  youtubeInicial: string;
  /** Contenido de la columna DERECHA bajo "Perfil" (hoy: la tarjeta de Contraseña). Solo maqueta. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreInicial);
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

  async function pedirCsrf(): Promise<string> {
    const res = await fetch("/api/auth/csrf", { credentials: "include" });
    if (!res.ok) throw new Error("SIN_SESION");
    const { csrfToken } = (await res.json()) as { csrfToken: string };
    return csrfToken;
  }

  async function guardarNombre(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setEstadoNombre("idle");
    if (!nombreEsValido(nombre)) {
      setErrorNombre(
        "Escribe un nombre de entre 2 y 40 letras o números. Sin símbolos raros ni emojis.",
      );
      return;
    }
    setErrorNombre(undefined);
    setEstadoNombre("guardando");
    try {
      const csrfToken = await pedirCsrf();
      const res = await fetch("/api/perfil", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ displayName: nombre, bio, website, instagram, youtube }),
      });
      if (res.ok) {
        const data = (await res.json()) as { displayName?: string };
        if (typeof data.displayName === "string") setNombre(data.displayName);
        setEstadoNombre("guardado");
        return;
      }
      if (res.status === 401) {
        setErrorNombre("Tu sesión ha caducado. Vuelve a iniciar sesión para guardar.");
      } else if (res.status === 429) {
        setErrorNombre("Has guardado muchas veces seguidas. Espera un momento.");
      } else {
        const msg = codigoDe(await res.json().catch(() => ({})));
        setErrorNombre(msg || "No hemos podido guardar el nombre. Inténtalo de nuevo.");
      }
      setEstadoNombre("idle");
    } catch (err) {
      setErrorNombre(
        err instanceof Error && err.message === "SIN_SESION"
          ? "Inicia sesión para guardar los cambios."
          : "No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.",
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
      setErrorAvatar("Elige una imagen JPG, PNG o WebP.");
      return;
    }
    if (avatarExcedeTope(f.size)) {
      setFicheroAvatar(null);
      setErrorAvatar("La imagen es demasiado grande. El máximo son 5 MB.");
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
      setErrorAvatar("Elige primero una imagen.");
      return;
    }
    setErrorAvatar(undefined);
    setAvisoAvatar(undefined);
    setEstadoAvatar("subiendo");
    try {
      const csrfToken = await pedirCsrf();
      const cuerpo = new FormData();
      cuerpo.append("avatar", ficheroAvatar);
      const res = await fetch("/api/perfil/avatar", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
        body: cuerpo,
      });
      if (res.ok) {
        setAvisoAvatar("Foto actualizada.");
        setEstadoAvatar("idle");
        router.refresh(); // revalida los Server Components -> el avatar nuevo se ve en /perfil, nav…
        return;
      }
      const msg = codigoDe(await res.json().catch(() => ({})));
      if (res.status === 401) {
        setErrorAvatar("Tu sesión ha caducado. Vuelve a iniciar sesión.");
      } else if (res.status === 429) {
        setErrorAvatar("Has subido muchas imágenes seguidas. Espera un momento.");
      } else {
        setErrorAvatar(msg || "No hemos podido subir la imagen. Prueba con otra.");
      }
      setEstadoAvatar("idle");
    } catch {
      setErrorAvatar("No hemos podido conectar. Revisa tu conexión e inténtalo de nuevo.");
      setEstadoAvatar("idle");
    }
  }

  return (
    // Maqueta desktop v2: en `lg` DOS columnas (izquierda Foto, derecha Perfil + Contraseña); en móvil
    // UNA columna apilada (idéntico a antes). El grid solo entra en `lg`; el espaciado móvil lo dan el
    // `mt-8` de la columna derecha y el `space-y-8` interno.
    <div className="lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start lg:gap-8">
      {/* COLUMNA IZQUIERDA — FOTO. Previsualización + selector. Acción SECUNDARIA (el magenta único es
          "Guardar perfil"). */}
      <section className="df-rise rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md">
        <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">Foto</h2>
        <div className="mt-4 flex items-center gap-5">
          {previa ? (
            // eslint-disable-next-line @next/next/no-img-element -- previsualización local (object URL), no un remoto
            <img
              src={previa}
              alt="Vista previa de tu nueva foto"
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : imagenInicial ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar actual del usuario
            <img
              src={imagenInicial}
              alt="Tu foto actual"
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <Avatar nombre={nombre || usuario || "?"} tamano="xl" />
          )}

          <div className="min-w-0">
            <label
              htmlFor="avatar-file"
              className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-sm border border-line bg-raised px-4 text-sm font-semibold text-text transition-colors duration-150 ease-mechanical hover:bg-surface ${avatarOcupado ? "pointer-events-none opacity-60" : ""}`}
            >
              Elegir imagen
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
              JPG, PNG o WebP · máx. 5 MB
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
            {avatarOcupado ? "Subiendo…" : "Guardar foto"}
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

      {/* COLUMNA DERECHA — Perfil + Contraseña, apiladas. */}
      <div className="mt-8 space-y-8 lg:mt-0">
        {/* PERFIL — acción principal (magenta único). */}
        <form
          onSubmit={guardarNombre}
          noValidate
          className="df-rise rounded-sm border border-line bg-surface/60 p-6 shadow-[var(--df-shadow-md)] backdrop-blur-md"
          style={{ animationDelay: "60ms" }}
        >
          <h2 className="text-sm font-semibold tracking-widest text-text-dim uppercase">Perfil</h2>
          <div className="mt-4 flex flex-col gap-5">
            <Campo
              id="perfil-nombre"
              label="Nombre visible"
              placeholder="Ej.: Ana Gómez"
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
              id="perfil-bio"
              label="Biografía"
              placeholder="Cuenta algo sobre ti"
              maxLength={BIO_MAX}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              disabled={nombreOcupado}
            />
            <Campo
              id="perfil-website"
              label="Sitio web"
              type="url"
              inputMode="url"
              placeholder="https://tu-web.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={nombreOcupado}
            />
            <Campo
              id="perfil-instagram"
              label="Instagram"
              placeholder="tu_usuario (sin @)"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              disabled={nombreOcupado}
            />
            <Campo
              id="perfil-youtube"
              label="YouTube"
              placeholder="@tucanal"
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
            {nombreOcupado ? "Guardando…" : "Guardar perfil"}
          </Boton>

          {estadoNombre === "guardado" ? (
            <p role="status" className="mt-3 text-center text-sm text-ok">
              Perfil guardado.
            </p>
          ) : null}
        </form>

        {/* CONTRASEÑA (u otro contenido de la columna derecha): pasado como children desde la página. */}
        {children}
      </div>
    </div>
  );
}
