/**
 * EL CUERPO DE UN FORMULARIO, ENTERO, PARA DÁRSELO AL SCHEMA.
 *
 * ┌─ POR QUÉ NO SE ENUMERAN LOS CAMPOS A MANO ───────────────────────────────────────────────────┐
 * │ Las dos rutas del panel construían el objeto campo a campo (`title: campo("title"), …`), y el │
 * │ día que `nivelMinimo` entró en el schema NADIE lo añadió a esa lista. El formulario lo         │
 * │ mandaba, el schema lo aceptaba con su default… y la ruta no se lo pasaba: TODOS los retos se   │
 * │ creaban y se editaban con `rookie`, o sea sin restricción, eligiera lo que eligiera el admin.  │
 * │ No fallaba nada —el default es un valor válido— y los tests del servicio no lo veían porque    │
 * │ llaman al servicio con el objeto ya parseado.                                                  │
 * │                                                                                                │
 * │ Pasando el formulario ENTERO, un campo nuevo en el schema llega solo. Lo que no está en el     │
 * │ schema se ignora (Zod no es `strict` aquí), así que esto no abre ninguna puerta: sigue siendo  │
 * │ el schema quien decide qué existe y con qué forma.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SOLO LOS VALORES DE TEXTO. Un `File` (la portada) no es un campo del dominio y se queda fuera: lo
 * maneja aparte quien llama, que es quien sabe sanearlo.
 */
export function camposDelFormulario(form: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [clave, valor] of form.entries()) {
    if (typeof valor === "string") campos[clave] = valor;
  }
  return campos;
}
