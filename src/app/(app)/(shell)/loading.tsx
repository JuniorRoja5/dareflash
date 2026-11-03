import {
  EsqueletoTarjeta,
  EsqueletoTexto,
  EsqueletoTitulo,
  PantallaCargando,
} from "@/components/ui/esqueleto";

/**
 * EL ESQUELETO DE RESERVA del shell: lo ve cualquier sección que no tenga el suyo.
 *
 * No intenta parecerse a ninguna pantalla concreta —no puede: lo comparten `/buscar`, `/ranking`,
 * `/wallet`, `/puntos`, `/vip`, `/referidos`, `/notificaciones` y `/crear`— así que dibuja lo único
 * que TODAS tienen: el contenedor del shell, un título y una columna de tarjetas. Las secciones de
 * más tráfico tienen su propio `loading.tsx` al lado de su `page.tsx`, con su rejilla exacta.
 *
 * Que este fichero exista es lo que convierte "pulsé y no pasa nada" en "está cargando" para las
 * veintisiete páginas `force-dynamic` de golpe.
 */
export default function CargandoShell() {
  return (
    <PantallaCargando>
      <EsqueletoTitulo />
      <EsqueletoTexto className="mt-4 max-w-prose" lineas={2} />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <EsqueletoTarjeta key={i} className="h-20" />
        ))}
      </div>
    </PantallaCargando>
  );
}
