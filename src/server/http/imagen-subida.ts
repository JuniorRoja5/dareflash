import "server-only";

/**
 * LAS IMÁGENES DE UN RETO QUE LLEGAN EN UN FORMULARIO — sanear y guardar, en un solo sitio.
 *
 * ┌─ POR QUÉ SE EXTRAE AHORA ───────────────────────────────────────────────────────────────────┐
 * │ La portada ya vivía copiada en las dos rutas del panel (crear y editar): mismo saneado, mismo │
 * │ `writeFile`, mismo bloque de log con `code/errno/syscall` que nació de un EACCES real. Con el │
 * │ LOGO del sponsor pasarían a ser CUATRO copias de lo mismo, y el día que una se arregle —otro  │
 * │ límite, otro modo de recorte— las otras tres se quedan como estaban. Es el mismo motivo por   │
 * │ el que las rutas pasaron a `camposDelFormulario`.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NO DECIDE NADA DE PRODUCTO: ni el nombre del fichero, ni los límites, ni qué pasa si falla. Eso
 * lo pone quien llama, que es quien sabe si un fallo debe abortar o solo avisar.
 */

/** Lo que devuelve el saneado: la imagen, un error ya traducido a respuesta, o nada (no venía). */
export type ImagenSaneada =
  | { tipo: "ok"; buffer: Buffer }
  | { tipo: "error"; code: string; mensaje: string; status: number }
  | { tipo: "ausente" };

/**
 * Saquea un campo de fichero del formulario y lo pasa por el pipeline compartido (`procesarImagen`:
 * tipo por bytes, tope ANTES de decodificar, strip EXIF, WebP). El campo vacío o ausente no es un
 * error: las dos imágenes son opcionales.
 *
 * `prefijoError` nombra el campo en el código de error (`PORTADA_TAMANO`, `LOGO_TIPO`...): quien
 * recibe el 400 tiene que saber CUÁL de las dos imágenes rechazó el servidor.
 */
export async function imagenDelFormulario(
  form: FormData,
  campo: string,
  prefijoError: string,
  limites: { maxBytes: number; maxLado: number },
): Promise<ImagenSaneada> {
  const fichero = form.get(campo);
  if (!(fichero instanceof File) || fichero.size === 0) return { tipo: "ausente" };

  const { procesarImagen, ImagenInvalidaError } = await import("@/server/services/imagen");
  const { sanearError } = await import("@/server/observability/sanitize-error");
  const bytes = new Uint8Array(await fichero.arrayBuffer());
  try {
    const r = await procesarImagen(bytes, {
      maxBytes: limites.maxBytes,
      modo: { tipo: "contener", maxLado: limites.maxLado },
    });
    return { tipo: "ok", buffer: r.buffer };
  } catch (e) {
    if (e instanceof ImagenInvalidaError) {
      return {
        tipo: "error",
        code: `${prefijoError}_${e.motivo}`,
        mensaje: e.message,
        status: e.motivo === "TAMANO" ? 413 : 400,
      };
    }
    console.error(`[panel/retos] fallo procesando ${campo}:`, sanearError(e));
    return {
      tipo: "error",
      code: `${prefijoError}_ERROR`,
      mensaje: "No hemos podido procesar la imagen. Prueba con otra.",
      status: 400,
    };
  }
}

/**
 * ESCRIBE LA IMAGEN Y LA APUNTA EN LA FILA, en ese orden, y dice si las DOS cosas salieron bien.
 *
 * ┌─ LAS DOS, Y NO SOLO EL `writeFile` ─────────────────────────────────────────────────────────┐
 * │ Guardar el fichero y no poder apuntarlo deja exactamente el mismo síntoma que no guardarlo:  │
 * │ la imagen no aparece. Si esta función solo cubriera la escritura, un fallo del `update` se    │
 * │ escaparía como excepción y la ruta devolvería un 500 — con el reto YA creado y sin avisar de  │
 * │ qué falló. Pasó al extraer este helper, y lo cazó el diente de "si la portada no se puede     │
 * │ guardar, el reto se crea igual pero AVISA".                                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NUNCA LANZA: en el panel ninguna imagen aborta la operación —el reto existe sin ella— y quien
 * llama decide qué decir. El `?v=` de la URL rompe la caché de Caddy al sobrescribir.
 *
 * EL LOG LLEVA `code/errno/syscall` porque nació de un fallo real: un volumen montado sobre un
 * directorio de root daba EACCES y el único síntoma era que la portada "no aparecía". Sin esos tres
 * datos, el diagnóstico fue media tarde.
 */
export async function guardarImagenDeReto(opts: {
  dir: string;
  nombre: string;
  buffer: Buffer;
  /** Escribe la URL pública en la fila. Se le pasa ya construida, con su `?v=`. */
  apuntar: (url: string) => Promise<unknown>;
}): Promise<boolean> {
  const { sanearError } = await import("@/server/observability/sanitize-error");
  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(opts.dir, { recursive: true });
    await writeFile(join(opts.dir, opts.nombre), opts.buffer);
    await opts.apuntar(`/portadas/${opts.nombre}?v=${Date.now()}`);
    return true;
  } catch (e) {
    const err = e as { code?: unknown; errno?: unknown; syscall?: unknown };
    const code = typeof err.code === "string" ? err.code : "?";
    const errno = typeof err.errno === "number" ? err.errno : "?";
    const syscall = typeof err.syscall === "string" ? err.syscall : "?";
    console.error(
      `[panel/retos] NO se pudo guardar ${opts.nombre} ` +
        `(code=${code} errno=${errno} syscall=${syscall}; EACCES => revisar permisos del volumen):`,
      sanearError(e),
    );
    return false;
  }
}
