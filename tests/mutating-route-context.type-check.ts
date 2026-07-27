/**
 * Comprobacion de TIPOS (no se ejecuta; la valida `npm run typecheck`) de que
 * `mutatingRoute` PROPAGA intacto el 2o argumento que Next pasa a la ruta —el context
 * con `params` de una ruta dinamica— hasta el handler. Si alguien vuelve a la firma que
 * descartaba ese argumento, este fichero deja de compilar y `typecheck` se pone rojo.
 *
 * No es un `.test.ts` a proposito: vitest no lo ejecuta (evita cargar la cadena
 * `server-only` / `next/headers` en Node), pero tsc si lo type-chequea (`include: **\/*.ts`).
 */
import { mutatingRoute } from "@/server/auth/mutating-route";

// Ruta dinamica ficticia (p.ej. /api/withdrawals/[id]): Next entrega este context.
type DynamicContext = { params: Promise<{ id: string }> };

// DEBE COMPILAR: el handler recibe el context tipado y puede leer sus params.
export const DELETE = mutatingRoute<DynamicContext>(async (_req, { user }, ctx) => {
  const { id } = await ctx.params; // solo compila si el context llega tipado hasta aqui
  return new Response(`${user.userId}:${id}`);
});

// DIENTES: leer una propiedad que NO existe en params debe fallar en compilacion. Si el
// context dejara de propagarse tipado (p.ej. `unknown`), el error caeria en `ctx.params`
// de arriba y `typecheck` tambien se pondria rojo.
export const PATCH = mutatingRoute<DynamicContext>(async (_req, _ctx, ctx) => {
  // @ts-expect-error - `params` no tiene la propiedad `nope`
  const { nope } = await ctx.params;
  return new Response(String(nope));
});
