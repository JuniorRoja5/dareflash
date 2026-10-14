import type { ReactNode } from "react";

import { PieLegal } from "@/components/ui/pie-legal";

export const metadata = { title: "Política de Privacidad · DareFlash" };

/**
 * POLÍTICA DE PRIVACIDAD — página pública, estática y sin datos.
 *
 * ┌─ POR QUÉ EXISTE YA, CON HUECOS ───────────────────────────────────────────────────────────────┐
 * │ La casilla del registro la nombraba y no enlazaba a ninguna parte: pedir consentimiento sobre │
 * │ un documento que no se puede leer es peor que no pedirlo. El texto es FUNCIONAL —describe lo  │
 * │ que la plataforma recoge de verdad— pero NO es definitivo: los `[PENDIENTE]` se rellenan con  │
 * │ los datos del responsable y tiene que revisarlo un abogado antes de ser la versión publicada. │
 * │ Por eso el aviso de arriba está EN LA PÁGINA y no solo en un comentario: quien la lea tiene   │
 * │ que saber en qué estado está. El sitio sigue tras el pestillo (`noindex`), así que no es       │
 * │ pública de verdad todavía.                                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTÁTICA DE VERDAD: ni `env`, ni `prisma`, ni sesión. Se prerenderiza en el build, que es lo que
 * exige una página bajo `src/app/**` (ver CLAUDE.md: leer `env` en ámbito de módulo aquí tumba el
 * despliegue). Si algún día lleva el correo de contacto, sale de `constants.ts`, no de `env`.
 *
 * NO SE PINTA DESDE MARKDOWN: no hay renderizador en el proyecto y meter uno por una página sería
 * una dependencia nueva para esto. El texto va en JSX, con dos piezas locales para que el documento
 * se lea como un documento y no como un muro de `<div>`.
 */

/** Un apartado numerado. El `id` deja enlazar a una sección concreta desde fuera. */
function Apartado({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: ReactNode;
}) {
  const id = `s${numero}`;
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-8">
      <h2
        id={id}
        className="text-lg leading-tight text-text sm:text-xl"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 700, "wdth" 110',
        }}
      >
        {numero}. {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-text-dim">{children}</div>
    </section>
  );
}

/**
 * Un hueco sin rellenar, VISIBLE a propósito. No se disimula con texto plausible: un documento legal
 * con un dato inventado es peor que uno con un hueco declarado.
 *
 * VA EN NEUTRO, y la primera versión no: la pinté con `--df-time`, que se ve bien y está MAL —ese
 * token es "tiempo restante no crítico" y nada más (ver MARCA.md: un token, un trabajo). Un hueco
 * pendiente no es tiempo, ni dinero, ni alarma, ni una acción: es una anotación. Lo que lo hace
 * visible es que rompe el ritmo del texto —fondo elevado y filete discontinuo—, no robarle el color
 * a otro significado.
 */
function Pendiente({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded-xs border border-dashed border-line bg-raised px-1.5 py-0.5 text-text-dim">
      [PENDIENTE — {children}]
    </mark>
  );
}

export default function PrivacidadPage() {
  return (
    <main className="mx-auto w-full max-w-[72ch] px-5 py-12 sm:px-6 lg:py-16">
      <h1
        className="text-[clamp(1.75rem,5vw,2.5rem)] leading-tight text-text"
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: '"wght" 800, "wdth" 115',
        }}
      >
        Política de Privacidad
      </h1>

      {/* EL ESTADO DEL DOCUMENTO, VISIBLE. Quien lo lee tiene que saber que todavía no es la versión
          definitiva; esconderlo sería dejarle creer que ya lo es. */}
      <p
        role="note"
        className="mt-5 rounded-sm border border-line bg-surface/60 p-4 text-sm leading-relaxed text-text-dim"
      >
        <strong className="font-medium text-text">Documento en preparación.</strong> Esta versión
        describe cómo tratamos tus datos hoy, pero todavía no es la definitiva: los huecos marcados
        como <Pendiente>pendiente</Pendiente> se completan antes del lanzamiento, y el texto está
        pendiente de revisión legal.
      </p>

      <p className="mt-4 text-xs text-text-dim">
        Última actualización: <Pendiente>fecha de publicación</Pendiente>
      </p>

      <Apartado numero={1} titulo="Quién es el responsable de tus datos">
        <p>
          DareFlash (en adelante, «la Plataforma», «nosotros») es un servicio de retos en vídeo con
          premios. El responsable del tratamiento de tus datos es:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-text">Entidad:</span>{" "}
            <Pendiente>razón social del responsable</Pendiente>
          </li>
          <li>
            <span className="text-text">Domicilio:</span> <Pendiente>domicilio social</Pendiente>
          </li>
          <li>
            <span className="text-text">Contacto de privacidad:</span>{" "}
            <Pendiente>correo de contacto</Pendiente>
          </li>
        </ul>
        <p>
          Si resides en el Espacio Económico Europeo (EEE), el Reino Unido o Suiza, tratamos tus
          datos conforme al Reglamento General de Protección de Datos (RGPD) y a la normativa local
          aplicable.
        </p>
      </Apartado>

      <Apartado numero={2} titulo="Qué datos recogemos">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="text-text">Datos de cuenta:</span> correo electrónico, nombre de
            usuario, contraseña (guardada siempre cifrada, nunca en claro), fecha de nacimiento
            (para comprobar que eres mayor de 18 años) y los datos opcionales de tu perfil (avatar,
            web, redes).
          </li>
          <li>
            <span className="text-text">Contenido que publicas:</span> vídeos, comentarios, votos y
            tu participación en retos.
          </li>
          <li>
            <span className="text-text">Datos de uso y técnicos:</span> dirección IP, tipo de
            dispositivo y navegador, y registros de actividad, que usamos para seguridad y
            prevención del fraude.
          </li>
          <li>
            <span className="text-text">Datos de pago:</span> cuando compras un Boost, el pago lo
            procesa Stripe.{" "}
            <span className="text-text">No almacenamos los números de tu tarjeta</span> en ningún
            momento; solo guardamos el registro de la transacción (importe, moneda e identificador
            de pago) para tu historial.
          </li>
          <li>
            <span className="text-text">Referidos:</span> si llegas por el enlace de otra persona, o
            invitas a alguien, registramos esa relación.
          </li>
          <li>
            <span className="text-text">Comunicaciones:</span> los correos que te enviamos
            (verificación de cuenta, avisos y recuperación de contraseña).
          </li>
        </ul>
      </Apartado>

      <Apartado numero={3} titulo="Para qué usamos tus datos y con qué base legal">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-4 font-medium text-text">
                  Finalidad
                </th>
                <th scope="col" className="py-2 font-medium text-text">
                  Base legal (RGPD)
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Crear y mantener tu cuenta, dejarte participar y ver el servicio",
                  "Ejecución del contrato",
                ],
                [
                  "Comprobar que eres mayor de 18 años",
                  "Obligación legal / ejecución del contrato",
                ],
                [
                  "Procesar compras de Boost y, en el futuro, el pago de premios",
                  "Ejecución del contrato",
                ],
                ["Seguridad, prevención del fraude y del abuso, y moderación", "Interés legítimo"],
                [
                  "Enviarte correos operativos (verificación, avisos de tu cuenta)",
                  "Ejecución del contrato",
                ],
                ["Enviarte comunicaciones opcionales, si las activas", "Consentimiento"],
                [
                  "Cumplir obligaciones fiscales y responder a requerimientos legales",
                  "Obligación legal",
                ],
              ].map(([finalidad, base]) => (
                <tr key={finalidad} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-4 align-top">{finalidad}</td>
                  <td className="py-2.5 align-top">{base}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Apartado>

      <Apartado numero={4} titulo="Mayores de 18 años">
        <p>
          DareFlash es <span className="text-text">solo para mayores de 18 años</span>. No admitimos
          cuentas de menores de edad ni recogemos sus datos a sabiendas. Si detectamos la cuenta de
          un menor, la eliminamos.
        </p>
      </Apartado>

      <Apartado numero={5} titulo="Con quién compartimos tus datos">
        <p>
          No vendemos tus datos. Los compartimos únicamente con los proveedores que necesitamos para
          prestar el servicio, y solo lo imprescindible:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-text">Bunny.net</span> — alojamiento y distribución (CDN) de los
            vídeos.
          </li>
          <li>
            <span className="text-text">Stripe</span> — procesamiento de pagos y, en el futuro, el
            pago de premios.
          </li>
          <li>
            <span className="text-text">Proveedor de correo</span> — para enviarte los correos del
            servicio.
          </li>
          <li>
            <span className="text-text">Proveedor de alojamiento</span> — donde se ejecuta la
            Plataforma.
          </li>
        </ul>
        <p>También podremos compartir datos cuando lo exija la ley o una autoridad competente.</p>
        <p>
          <span className="text-text">Transferencias internacionales:</span> algunos de estos
          proveedores, y el propio responsable, pueden estar fuera del EEE. En ese caso aplicamos
          las garantías que exige el RGPD, como las cláusulas contractuales tipo.{" "}
          <Pendiente>mecanismo exacto, pendiente de revisión legal</Pendiente>
        </p>
      </Apartado>

      <Apartado numero={6} titulo="Cuánto tiempo conservamos tus datos">
        <p>
          Conservamos tus datos mientras tu cuenta esté activa. Si la eliminas, los borramos o los
          anonimizamos, salvo lo que debamos conservar por obligación legal —por ejemplo, los
          registros de pagos durante el plazo fiscal aplicable— o para resolver disputas y prevenir
          el fraude.
        </p>
      </Apartado>

      <Apartado numero={7} titulo="Tus derechos">
        <p>
          Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión,
          oposición, limitación del tratamiento y portabilidad, así como retirar tu consentimiento
          cuando el tratamiento se base en él. Escríbenos a{" "}
          <Pendiente>correo de contacto</Pendiente>.
        </p>
        <p>
          Si estás en el EEE, también puedes reclamar ante tu autoridad de control (en España, la
          Agencia Española de Protección de Datos).
        </p>
      </Apartado>

      <Apartado numero={8} titulo="Cookies">
        <p>
          Usamos cookies y almacenamiento local <span className="text-text">necesarios</span> para
          que la Plataforma funcione: mantener tu sesión iniciada, recordar tu preferencia de tema
          (claro u oscuro) y protegerte frente al fraude. No usamos cookies de publicidad de
          terceros.{" "}
          <Pendiente>si se añade analítica, requiere una capa de consentimiento</Pendiente>
        </p>
      </Apartado>

      <Apartado numero={9} titulo="Seguridad">
        <p>
          Aplicamos medidas técnicas y organizativas para proteger tus datos: contraseñas cifradas,
          conexiones seguras, control de acceso y registros de seguridad. Ningún sistema es
          infalible, pero trabajamos para reducir el riesgo.
        </p>
      </Apartado>

      <Apartado numero={10} titulo="Cambios en esta política">
        <p>
          Podemos actualizar esta política. Si el cambio es relevante, te avisaremos por los medios
          habituales. La fecha de arriba indica la última versión.
        </p>
      </Apartado>

      <Apartado numero={11} titulo="Contacto">
        <p>
          Para cualquier cuestión sobre tus datos o esta política:{" "}
          <Pendiente>correo de contacto</Pendiente>.
        </p>
      </Apartado>

      {/* EL MISMO PIE QUE EL RESTO, también aquí: una página legal sin camino de vuelta deja a quien
          la abre en un callejón. Sin barra inferior —esta ruta está fuera del grupo `(app)`—. */}
      <PieLegal />
    </main>
  );
}
