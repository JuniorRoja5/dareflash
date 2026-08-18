/**
 * Lógica PURA del desplegable de sugerencias (P4). Aislada del componente para atarla con dientes: la
 * construcción de la lista (usuarios + retos) y el DESTINO de cada sugerencia al hacer click. Sin React,
 * sin red: viaja al bundle sin arrastrar nada y se testea directa.
 */
import type { RetoBusqueda, UsuarioBusqueda } from "@/server/services/buscar";

export type SugerenciaUsuario = {
  tipo: "usuario";
  id: string;
  username: string;
  displayName: string | null;
  image: string | null;
};
export type SugerenciaReto = {
  tipo: "reto";
  id: string;
  title: string;
  category: string;
};
export type Sugerencia = SugerenciaUsuario | SugerenciaReto;

/**
 * Une usuarios + retos en UNA lista para el desplegable (usuarios primero, luego retos). Descarta
 * usuarios sin `username` (no serían enlazables a `/u/[username]`); tras P1 no debería haberlos, pero
 * el DTO lo tipa nullable y el filtro lo deja demostrado.
 */
export function construirSugerencias(
  usuarios: UsuarioBusqueda[],
  retos: RetoBusqueda[],
): Sugerencia[] {
  const u: Sugerencia[] = usuarios
    .filter((x): x is UsuarioBusqueda & { username: string } => Boolean(x.username))
    .map((x) => ({
      tipo: "usuario",
      id: x.id,
      username: x.username,
      displayName: x.displayName,
      image: x.image,
    }));
  const r: Sugerencia[] = retos.map((x) => ({
    tipo: "reto",
    id: x.id,
    title: x.title,
    category: x.category,
  }));
  return [...u, ...r];
}

/** DESTINO al elegir una sugerencia: perfil público del usuario, o detalle del reto. */
export function destinoSugerencia(s: Sugerencia): string {
  return s.tipo === "usuario" ? `/u/${s.username}` : `/retos/${s.id}`;
}

/** URL de "ver todos" / Enter sin opción activa: la página `/buscar` con la consulta (tipo por defecto). */
export function hrefBuscarTodos(q: string): string {
  return `/buscar?${new URLSearchParams({ q: q.trim() }).toString()}`;
}
