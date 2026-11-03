import { EsqueletoPerfil } from "@/components/ui/esqueleto-perfil";

/**
 * /perfil — el mío. Misma forma que `/u/[username]`, porque la pinta el mismo componente
 * (`PerfilVista`), así que el esqueleto también es el mismo y vive en un sitio.
 */
export default function CargandoPerfil() {
  return <EsqueletoPerfil />;
}
