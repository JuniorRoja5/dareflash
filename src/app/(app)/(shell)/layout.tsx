import type { ReactNode } from "react";

import { PieLegal } from "@/components/ui/pie-legal";

import { BarraSuperior } from "./barra-superior";

/**
 * SHELL DE ESCRITORIO (grupo `(shell)`). Envuelve las secciones normales (Inicio, Retos, Ranking,
 * Perfil, Crear, Reto por dentro) con la BARRA SUPERIOR de escritorio + una region de contenido que
 * puede aprovechar el ancho + el PIE LEGAL. En movil no hay barra superior (la nav es la inferior del
 * chrome) y el hueco de esa barra lo reserva el pie. El `/feed` queda FUERA de este grupo -> sin
 * shell y sin pie, que es lo que lo deja ser inmersivo.
 *
 * La barra muestra al usuario de la SESION (nombre + avatar reales) y recibe su ROL, que decide el CTA
 * principal (ver `ctaPrincipal`). El numero de la campana NO pasa por aqui: lo lleva el contador
 * compartido del armazon `(app)` (ver `avisos-contexto`). Se resuelve AQUI (server): lee la cookie y
 * consulta solo lo publico del chrome (displayName/username/image). Un INVITADO (sin sesion) ve la
 * silueta generica y ninguna campana, sin romper (el grupo es publico). Leer la sesion hace el shell
 * dinamico por peticion; el build sin env no se toca (cookies/DB son de request, no de build).
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { getCurrentUser } = await import("@/server/auth/current-user");
  const user = await getCurrentUser();

  let cuenta: { nombre: string; imagen: string | null; puntos: number } | null = null;
  if (user) {
    const { prisma } = await import("@/server/db/client");
    const fila = await prisma.user.findUnique({
      where: { id: user.userId },
      // `pointsBalance`: una columna mas en la consulta que YA se hacia, para el anillo de nivel del
      // avatar de la barra. Ni una consulta extra.
      select: { displayName: true, username: true, image: true, pointsBalance: true },
    });
    if (fila) {
      cuenta = {
        nombre: fila.displayName ?? fila.username ?? "Tú",
        imagen: fila.image,
        puntos: fila.pointsBalance,
      };
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* Barra superior: solo escritorio */}
      <div className="hidden lg:block">
        <BarraSuperior usuario={cuenta} rol={user?.role ?? null} />
      </div>

      {/* Region de contenido: en escritorio, ancho disponible. `flex-1` para que el pie caiga abajo
          en las pantallas cortas en vez de quedarse pegado al contenido. */}
      <div className="flex-1">{children}</div>

      {/* EL PIE LEGAL, UNA VEZ Y EN EL ARMAZON: es la unica puerta a `/privacidad` para quien ya
          tiene cuenta (la otra es la casilla del registro, que esa persona ya no vuelve a ver).
          Aqui tambien RESERVA el hueco de la barra inferior de movil, que antes reservaba el
          contenido con `pb-24`: ese hueco tiene que estar DEBAJO del pie, no encima. */}
      <PieLegal sobreNavMovil />
    </div>
  );
}
