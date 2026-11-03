import { EsqueletoPerfil } from "@/components/ui/esqueleto-perfil";

/**
 * /u/[username] — el perfil de otra persona. Misma forma que `/perfil` (mismo `PerfilVista`), así
 * que comparte el esqueleto: ver `esqueleto-perfil.tsx`.
 */
export default function CargandoPerfilPublico() {
  return <EsqueletoPerfil />;
}
